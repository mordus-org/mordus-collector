import { normalizeErrorName, readDataProperty } from '@/pipeline/PrivacyFilter';
import type { Collector } from '@/types/collector';
import type { EventPipeline } from '@/types/pipeline';

interface ErrorCollectorOptions {
  window: Window;
  pipeline: EventPipeline;
}

function errorDetails(error: unknown): Record<string, unknown> {
  if (!(error instanceof Error)) return { errorName: 'Error' };
  const prototypeName = readDataProperty(Object.getPrototypeOf(error), 'name');
  return {
    errorName: normalizeErrorName(
      readDataProperty(error, 'name') ?? prototypeName,
    ),
    stack: readDataProperty(error, 'stack'),
  };
}

export class ErrorCollector implements Collector {
  private active = false;
  private processing = false;

  constructor(private readonly options: ErrorCollectorOptions) {}

  private readonly onError = (event: Event): void => {
    this.capture('error.javascript', () => {
      const error = event as ErrorEvent;
      return {
        ...errorDetails(error.error),
        url: error.filename,
        line: error.lineno,
        column: error.colno,
      };
    });
  };

  private readonly onRejection = (event: Event): void => {
    this.capture('error.unhandledrejection', () =>
      errorDetails((event as PromiseRejectionEvent).reason),
    );
  };

  private capture(
    type: 'error.javascript' | 'error.unhandledrejection',
    metadata: () => Record<string, unknown>,
  ): void {
    if (!this.active || this.processing) return;
    this.processing = true;
    try {
      this.options.pipeline.process({
        category: 'error',
        type,
        source: 'auto',
        metadata: metadata(),
      });
    } catch {
      // Collector failures must not trigger another browser error.
    } finally {
      this.processing = false;
    }
  }

  start(): void {
    if (this.active) return;
    this.active = true;
    try {
      this.options.window.addEventListener('error', this.onError);
      this.options.window.addEventListener(
        'unhandledrejection',
        this.onRejection,
      );
    } catch (error) {
      this.stop();
      throw error;
    }
  }

  stop(): void {
    this.active = false;
    this.options.window.removeEventListener('error', this.onError);
    this.options.window.removeEventListener(
      'unhandledrejection',
      this.onRejection,
    );
  }
}
