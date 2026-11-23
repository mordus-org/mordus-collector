import type { Collector } from '@/types/collector';
import type { RawMonitorEvent } from '@/types/events';
import type { EventPipeline } from '@/types/pipeline';

export interface DelegatedDomCollectorOptions {
  document: Document;
  eventType: string;
  pipeline: EventPipeline;
  resolve: (event: Event) => RawMonitorEvent | null;
  listenerOptions?: Pick<AddEventListenerOptions, 'capture' | 'passive'>;
}

export class DelegatedDomCollector implements Collector {
  private started = false;
  private readonly listenerOptions: Pick<
    AddEventListenerOptions,
    'capture' | 'passive'
  >;

  constructor(private readonly options: DelegatedDomCollectorOptions) {
    this.listenerOptions = options.listenerOptions ?? { capture: true };
  }

  start(): void {
    if (this.started) {
      return;
    }

    this.options.document.addEventListener(
      this.options.eventType,
      this.handleEvent,
      this.listenerOptions,
    );
    this.started = true;
  }

  stop(): void {
    if (!this.started) {
      return;
    }

    this.options.document.removeEventListener(
      this.options.eventType,
      this.handleEvent,
      this.listenerOptions,
    );
    this.started = false;
  }

  private readonly handleEvent = (event: Event): void => {
    try {
      const rawEvent = this.options.resolve(event);

      if (rawEvent) {
        this.options.pipeline.process(rawEvent);
      }
    } catch {
      // Monitoring failures must not interrupt the application's event handlers.
    }
  };
}
