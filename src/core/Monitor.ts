import { BatchManager } from '../transport/BatchManager.js';
import type { TransportStatistics } from '../transport/BatchManager.js';
import { Diagnostics } from '../pipeline/Diagnostics.js';
import type { PipelineDiagnostics } from '../pipeline/Diagnostics.js';
import { ErrorCollector } from '../collectors/ErrorCollector.js';
import { IdentityManager } from '../context/IdentityManager.js';
import { SessionManager } from '../context/SessionManager.js';
import { NavigationCollector } from '../navigation/NavigationCollector.js';
import { PageManager } from '../navigation/PageManager.js';
import { CollectorRegistry } from './CollectorRegistry.js';
import { ClickCollector } from '../collectors/ClickCollector.js';
import { FieldCollector } from '../collectors/FieldCollector.js';
import { FormCollector } from '../collectors/FormCollector.js';
import { resolveConfiguration } from './Configuration.js';
import { EventProcessor } from '../pipeline/EventProcessor.js';
import type { MonitorConfig, ResolvedMonitorConfig } from '../types/config.js';
import type {
  CollectorRegistration,
  MonitorDependencies,
  MonitorState,
  MonitorTransport,
} from '../types/monitor.js';
import type { EventPipeline } from '../types/pipeline.js';

export class Monitor {
  readonly config: ResolvedMonitorConfig;

  private enabled: boolean;
  private readonly pipelineDiagnostics = new Diagnostics();
  private readonly pageManager = new PageManager();
  private navigation: NavigationCollector | undefined;
  private readonly registry: CollectorRegistry;
  private readonly now: () => Date;
  private readonly generateId: () => string;
  private readonly transport: MonitorTransport;
  private currentState: MonitorState = 'idle';
  private generation = 0;
  private initializing = false;
  private readonly session: SessionManager;
  private readonly identity = new IdentityManager();
  private pipeline: EventPipeline | undefined;
  private pendingFlush: Promise<void> | undefined;

  constructor(config: MonitorConfig, dependencies: MonitorDependencies = {}) {
    this.config = resolveConfiguration(config);
    this.enabled = this.config.collectionEnabled;
    this.now = dependencies.now ?? (() => new Date());
    this.generateId =
      dependencies.generateId ?? (() => globalThis.crypto.randomUUID());
    this.transport =
      dependencies.transport ??
      new BatchManager({
        endpoint: this.config.endpoint,
        ...this.config.transport,
        ...(typeof window === 'undefined' ? {} : { window }),
      });
    this.session = new SessionManager({
      projectId: this.config.projectId,
      generateId: this.generateId,
      ...(typeof window === 'undefined' ? {} : { window }),
    });

    const defaultCollectors: CollectorRegistration[] =
      typeof document === 'undefined'
        ? []
        : [
            {
              name: 'errors',
              capture: 'errors',
              create: (pipeline) => new ErrorCollector({ window, pipeline }),
            },
            {
              name: 'navigation',
              capture: 'navigation',
              create: (pipeline) => {
                this.navigation = new NavigationCollector({
                  window,
                  pipeline,
                  pageManager: this.pageManager,
                });
                return this.navigation;
              },
            },
            {
              name: 'clicks',
              capture: 'clicks',
              create: (pipeline) =>
                new ClickCollector({
                  document,
                  pipeline,
                  attribute: this.config.attribute,
                }),
            },
            {
              name: 'fields',
              capture: 'fields',
              create: (pipeline) =>
                new FieldCollector({
                  document,
                  pipeline,
                  attribute: this.config.attribute,
                }),
            },
            {
              name: 'forms',
              capture: 'forms',
              create: (pipeline) =>
                new FormCollector({
                  document,
                  pipeline,
                  attribute: this.config.attribute,
                }),
            },
          ];

    const registrations = (dependencies.collectors ?? defaultCollectors)
      .filter(
        (registration) =>
          registration.capture === undefined ||
          this.config.capture[registration.capture],
      )
      .map((registration) => ({ ...registration }));

    const names = new Set(
      registrations.map((registration) => registration.name),
    );

    if (names.size !== registrations.length) {
      throw new TypeError('Collector names must be unique.');
    }

    this.registry = new CollectorRegistry(registrations);
  }

  get state(): MonitorState {
    return this.currentState;
  }

  get collectionEnabled(): boolean {
    return this.enabled;
  }

  get diagnostics(): PipelineDiagnostics {
    return this.pipelineDiagnostics.snapshot;
  }

  get transportStatistics(): TransportStatistics | undefined {
    try {
      const statistics = this.transport.statistics;
      if (statistics === undefined) return undefined;

      const snapshot = {
        queued: statistics.queued,
        delivered: statistics.delivered,
        dropped: statistics.dropped,
        failures: statistics.failures,
        retries: statistics.retries,
      };
      if (
        Object.values(snapshot).some(
          (value) => !Number.isSafeInteger(value) || value < 0,
        )
      )
        return undefined;

      return snapshot;
    } catch {
      return undefined;
    }
  }

  setCollectionEnabled(enabled: boolean): void {
    if (typeof enabled !== 'boolean')
      throw new TypeError('collectionEnabled must be a boolean.');
    this.enabled = enabled;
    if (!enabled) {
      this.stop();
      this.identity.resetIdentity();
      try {
        this.transport.clear?.();
      } catch {
        this.pipelineDiagnostics.record('transport_error');
      }
    }
  }

  start(): void {
    if (
      !this.enabled ||
      this.initializing ||
      this.currentState === 'running' ||
      this.currentState === 'stopping'
    ) {
      return;
    }

    this.initializing = true;
    this.currentState = 'starting';
    const generation = ++this.generation;
    const isCurrent = () => this.generation === generation;
    const cancel = () => {
      if (isCurrent()) {
        this.generation += 1;
        this.currentState = 'stopping';
      }
    };

    try {
      if (!this.registry.stop()) {
        this.currentState = 'stopped';
        return;
      }

      this.transport.start?.();
      if (!isCurrent() || !this.enabled) {
        this.stopTransport();
        this.currentState = 'stopped';
        return;
      }
      const sessionId = this.session.getId();

      const processor = new EventProcessor({
        diagnostics: this.pipelineDiagnostics,
        isAuthorized: () =>
          this.enabled &&
          isCurrent() &&
          (this.currentState === 'starting' || this.currentState === 'running'),
        projectId: this.config.projectId,
        sessionId,
        getUserId: () => this.identity.userId,
        now: this.now,
        generateId: this.generateId,
        sink: this.transport,
        getPage: () => this.pageManager.current,
      });

      this.pipeline = {
        process: (event) => {
          if (
            isCurrent() &&
            (this.currentState === 'starting' ||
              this.currentState === 'running')
          ) {
            processor.process(event);
          }
        },
      };

      if (
        this.registry.start(this.pipeline, isCurrent, cancel) &&
        isCurrent()
      ) {
        this.currentState = 'running';
      } else {
        this.stopTransport();
        this.currentState = 'stopped';
      }
    } catch {
      cancel();
      this.registry.stop();
      this.stopTransport();
      this.currentState = 'stopped';
    } finally {
      this.initializing = false;
    }
  }

  stop(): void {
    if (this.currentState === 'stopping') {
      return;
    }

    this.currentState = 'stopping';
    this.generation += 1;
    this.pipeline = undefined;
    this.registry.stop();
    this.stopTransport();
    this.currentState = 'stopped';
  }

  private stopTransport(): void {
    try {
      this.transport.stop?.();
    } catch {
      this.pipelineDiagnostics.record('transport_error');
    }
    this.pendingFlush = undefined;
  }

  track(name: string, metadata?: Record<string, unknown>): void {
    const event = { category: 'custom', type: name, source: 'manual' } as const;

    this.pipeline?.process(
      metadata === undefined ? event : { ...event, metadata },
    );
  }

  identify(userId: string): boolean {
    return this.enabled && this.identity.identify(userId);
  }

  resetIdentity(): void {
    this.identity.resetIdentity();
  }

  notifyRoute(route?: string): void {
    this.navigation?.notifyRoute(route);
  }

  flush(): Promise<void> {
    if (!this.enabled) {
      return Promise.resolve();
    }

    const generation = this.generation;
    this.pendingFlush ??= Promise.resolve()
      .then(() => {
        if (this.enabled && generation === this.generation)
          return this.transport.flush();
      })
      .catch(() => {
        this.pipelineDiagnostics.record('transport_error');
      })
      .finally(() => {
        if (generation === this.generation) this.pendingFlush = undefined;
      });

    return this.pendingFlush;
  }
}

export function createMonitor(
  config: MonitorConfig,
  dependencies?: MonitorDependencies,
): Monitor {
  return new Monitor(config, dependencies);
}
