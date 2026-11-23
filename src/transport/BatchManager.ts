import { EventQueue } from './EventQueue.js';
import { HttpTransport } from './HttpTransport.js';
import type { MonitorEvent } from '../types/events.js';
import type { MonitorTransport } from '../types/monitor.js';

export interface BatchManagerOptions {
  endpoint: string;
  batchSize: number;
  flushIntervalMs: number;
  maxQueueSize: number;
  maxAttempts?: number;
  retryDelayMs?: number;
  timeoutMs?: number;
  fetch?: typeof fetch;
  window?: Window;
}

export interface TransportStatistics {
  queued: number;
  delivered: number;
  dropped: number;
  failures: number;
  retries: number;
}

const MAX_BATCH_BYTES = 60 * 1024;

export class BatchManager implements MonitorTransport {
  readonly #options: BatchManagerOptions;
  private readonly queue: EventQueue;
  private readonly http: HttpTransport;
  private readonly maxAttempts: number;
  private readonly retryDelayMs: number;
  private active = false;
  private generation = 0;
  private controller = new AbortController();
  private interval: ReturnType<typeof setInterval> | undefined;
  private pending: Promise<void> | undefined;
  private exiting = false;
  private wakeDelay: (() => void) | undefined;
  private delivered = 0;
  private dropped = 0;
  private failures = 0;
  private retries = 0;

  constructor(options: BatchManagerOptions) {
    this.#options = { ...options };
    this.maxAttempts = options.maxAttempts ?? 3;
    this.retryDelayMs = options.retryDelayMs ?? 1000;

    const limits = [
      options.batchSize,
      options.flushIntervalMs,
      options.maxQueueSize,
      this.maxAttempts,
      this.retryDelayMs,
      options.timeoutMs ?? 10000,
    ];
    if (limits.some((value) => !Number.isSafeInteger(value) || value <= 0)) {
      throw new TypeError('Transport limits must be positive safe integers.');
    }

    this.queue = new EventQueue(options.maxQueueSize);
    this.http = new HttpTransport(
      options.endpoint,
      options.fetch,
      options.timeoutMs,
    );
  }

  get statistics(): TransportStatistics {
    return {
      queued: this.queue.size,
      delivered: this.delivered,
      dropped: this.dropped,
      failures: this.failures,
      retries: this.retries,
    };
  }

  start(): void {
    if (this.active) return;

    this.active = true;
    this.exiting = false;
    this.generation += 1;
    this.controller = new AbortController();
    this.interval = setInterval(
      () => void this.flush(),
      this.#options.flushIntervalMs,
    );
    this.#options.window?.addEventListener('pagehide', this.onPageHide);
    this.#options.window?.addEventListener('pageshow', this.onPageShow);
  }

  stop(): void {
    this.active = false;
    this.generation += 1;
    this.controller.abort();
    clearInterval(this.interval);
    this.interval = undefined;
    this.pending = undefined;
    this.#options.window?.removeEventListener('pagehide', this.onPageHide);
    this.#options.window?.removeEventListener('pageshow', this.onPageShow);
    this.dropped += this.queue.clear();
  }

  clear(): void {
    this.stop();
  }

  emit(event: MonitorEvent): void {
    if (!this.active) return;

    try {
      const serialized = JSON.stringify(event);
      const bytes = new TextEncoder().encode(
        `{"events":[${serialized}]}`,
      ).length;
      if (bytes > MAX_BATCH_BYTES || !this.queue.push(serialized)) {
        this.dropped += 1;
        return;
      }
    } catch {
      this.dropped += 1;
      return;
    }

    if (this.queue.size >= this.#options.batchSize) void this.flush();
  }

  flush(): Promise<void> {
    if (!this.active) return Promise.resolve();
    if (this.pending) return this.pending;

    const generation = this.generation;
    const signal = this.controller.signal;
    const pending = this.drain(generation, signal).finally(() => {
      if (this.generation === generation) this.pending = undefined;
    });
    this.pending = pending;

    return pending;
  }

  private readonly onPageHide = (): void => {
    this.exiting = true;
    this.wakeDelay?.();
    void this.flush();
  };

  private readonly onPageShow = (): void => {
    this.exiting = false;
  };

  private async drain(generation: number, signal: AbortSignal): Promise<void> {
    while (
      this.active &&
      generation === this.generation &&
      this.queue.size > 0
    ) {
      const batch = this.queue.batch(this.#options.batchSize, MAX_BATCH_BYTES);
      const body = `{"events":[${batch.join(',')}]}`;
      let delivered = false;

      for (let attempt = 0; attempt < this.maxAttempts; attempt += 1) {
        const result = await this.http.send(body, signal);
        if (generation !== this.generation || result === 'cancelled') return;
        if (result === 'delivered') {
          delivered = true;
          break;
        }

        this.failures += 1;
        if (
          result === 'permanent' ||
          this.exiting ||
          attempt + 1 === this.maxAttempts
        )
          break;

        this.retries += 1;
        await this.delay(
          Math.min(this.retryDelayMs * 2 ** attempt, 30000),
          signal,
        );
        if (signal.aborted) return;
      }

      this.queue.remove(batch.length);
      if (delivered) this.delivered += batch.length;
      else this.dropped += batch.length;
    }
  }

  private delay(milliseconds: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve) => {
      const finish = () => {
        clearTimeout(timer);
        signal.removeEventListener('abort', finish);
        if (this.wakeDelay === finish) this.wakeDelay = undefined;
        resolve();
      };
      const timer = setTimeout(finish, milliseconds);
      this.wakeDelay = finish;
      signal.addEventListener('abort', finish, { once: true });
      if (signal.aborted) finish();
    });
  }
}
