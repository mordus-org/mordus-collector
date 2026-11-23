import { DelegatedDomCollector } from './DelegatedDomCollector.js';
import { ElementResolver } from '../identification/ElementResolver.js';
import type { Collector } from '../types/collector.js';
import type { RawMonitorEvent } from '../types/events.js';
import type { EventPipeline } from '../types/pipeline.js';

export interface ClickCollectorOptions {
  document: Document;
  pipeline: EventPipeline;
  attribute?: string;
}

export class ClickCollector implements Collector {
  private readonly delegate: DelegatedDomCollector;

  constructor(options: ClickCollectorOptions) {
    const resolver = new ElementResolver(options.attribute);

    this.delegate = new DelegatedDomCollector({
      document: options.document,
      eventType: 'click',
      pipeline: options.pipeline,
      resolve: (event): RawMonitorEvent | null => {
        const element = resolver.resolve(event);

        if (!element) {
          return null;
        }

        return {
          category: 'element',
          type: 'element.click',
          source: 'auto',
          element,
        };
      },
    });
  }

  start(): void {
    this.delegate.start();
  }

  stop(): void {
    this.delegate.stop();
  }
}
