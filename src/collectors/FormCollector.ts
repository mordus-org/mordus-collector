import { DelegatedDomCollector } from '@/collectors/DelegatedDomCollector';
import { ElementResolver } from '@/identification/ElementResolver';
import type { Collector } from '@/types/collector';
import type { RawMonitorEvent } from '@/types/events';
import type { EventPipeline } from '@/types/pipeline';

export interface FormCollectorOptions {
  document: Document;
  pipeline: EventPipeline;
  attribute?: string;
}

export class FormCollector implements Collector {
  private readonly delegates: DelegatedDomCollector[];

  constructor(options: FormCollectorOptions) {
    const resolver = new ElementResolver(options.attribute);

    this.delegates = ['submit', 'reset'].map(
      (eventType) =>
        new DelegatedDomCollector({
          document: options.document,
          eventType,
          pipeline: options.pipeline,
          resolve: (event): RawMonitorEvent | null => {
            if (!(event.target instanceof HTMLFormElement)) {
              return null;
            }

            const element = resolver.resolve(event);

            if (!element || element.tagName !== 'form') {
              return null;
            }

            return {
              category: 'form',
              type: eventType === 'submit' ? 'form.submit' : 'form.reset',
              source: 'auto',
              element,
            };
          },
        }),
    );
  }

  start(): void {
    try {
      for (const delegate of this.delegates) {
        delegate.start();
      }
    } catch (error) {
      this.stop();
      throw error;
    }
  }

  stop(): void {
    let firstError: unknown;

    for (const delegate of this.delegates) {
      try {
        delegate.stop();
      } catch (error) {
        firstError ??= error;
      }
    }

    if (firstError) {
      throw firstError;
    }
  }
}
