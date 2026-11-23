import { observeHistory } from '@/navigation/HistoryObserver';
import { PageManager } from '@/navigation/PageManager';
import type { Collector } from '@/types/collector';
import type { NavigationType } from '@/types/events';
import type { EventPipeline } from '@/types/pipeline';

interface NavigationCollectorOptions {
  window: Window;
  pipeline: EventPipeline;
  pageManager?: PageManager;
}

export class NavigationCollector implements Collector {
  readonly pageManager: PageManager;
  private unsubscribe: (() => void) | undefined;

  constructor(private readonly options: NavigationCollectorOptions) {
    this.pageManager = options.pageManager ?? new PageManager();
  }

  start(): void {
    if (this.unsubscribe) return;

    this.pageManager.reset();
    this.unsubscribe = observeHistory(this.options.window, (path, type) => {
      this.capture(path, type);
    });
    this.capture(this.options.window.location.href, 'initial');
  }

  stop(): void {
    const unsubscribe = this.unsubscribe;
    this.unsubscribe = undefined;
    unsubscribe?.();
  }

  notifyRoute(route?: string): void {
    if (!this.unsubscribe) return;

    this.capture(this.options.window.location.href, 'router', route);
  }

  private capture(path: string, type: NavigationType, route?: string): void {
    const page = this.pageManager.update(path, type, route);
    if (!page) return;

    try {
      this.options.pipeline.process({
        category: 'page',
        type: 'page.view',
        source: 'auto',
        page,
      });
    } catch {
      // Navigation continues even when the pipeline fails.
    }
  }
}
