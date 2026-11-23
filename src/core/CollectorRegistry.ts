import type { Collector } from '../types/collector.js';
import type { CollectorRegistration } from '../types/monitor.js';
import type { EventPipeline } from '../types/pipeline.js';

export class CollectorRegistry {
  private readonly active = new Set<Collector>();

  constructor(
    private readonly registrations: readonly CollectorRegistration[],
  ) {}

  start(
    pipeline: EventPipeline,
    isCurrent: () => boolean,
    cancel: () => void,
  ): boolean {
    for (const registration of this.registrations) {
      if (!isCurrent()) {
        return false;
      }

      let collector: Collector;

      try {
        collector = registration.create(pipeline);
        this.active.add(collector);

        if (!isCurrent()) {
          this.stop();
          return false;
        }

        collector.start();
      } catch {
        cancel();
        this.stop();
        return false;
      }

      if (!isCurrent()) {
        this.active.add(collector);
        this.stop();
        return false;
      }
    }

    return true;
  }

  stop(): boolean {
    const collectors = [...this.active].reverse();
    this.active.clear();

    for (const collector of collectors) {
      try {
        collector.stop();
      } catch {
        this.active.add(collector);
      }
    }

    return this.active.size === 0;
  }
}
