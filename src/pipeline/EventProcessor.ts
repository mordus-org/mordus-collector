import {
  filterMetadata,
  filterErrorMetadata,
  readDataProperty,
} from '@/pipeline/PrivacyFilter';
import { copyPage } from '@/navigation/PageManager';
import { EventFactory } from '@/pipeline/EventFactory';
import {
  copyJson,
  EventValidator,
  isEventKind,
} from '@/pipeline/EventValidator';
import { Diagnostics } from '@/pipeline/Diagnostics';
import type {
  ElementDescriptor,
  PageContext,
  RawMonitorEvent,
} from '@/types/events';
import type { EventPipeline, EventSink } from '@/types/pipeline';

interface EventProcessorOptions {
  projectId: string;
  sessionId: string;
  now(): Date;
  generateId(): string;
  sink: EventSink;
  getPage?(): PageContext;
  getUserId?(): string | undefined;
  isAuthorized?(): boolean;
  diagnostics?: Diagnostics;
}

function isIdentifier(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z][a-z0-9._:-]{0,127}$/i.test(value);
}

function copyElement(element: ElementDescriptor): ElementDescriptor | null {
  if (!element || !isIdentifier(element.identifier)) {
    return null;
  }

  const result: ElementDescriptor = { identifier: element.identifier };

  if (element.path !== undefined) {
    if (
      !Array.isArray(element.path) ||
      element.path.length > 16 ||
      ![...element.path].every(isIdentifier)
    ) {
      return null;
    }

    result.path = [...element.path];
  }

  if (element.tagName !== undefined) {
    if (
      typeof element.tagName !== 'string' ||
      !/^[a-z][a-z0-9-]{0,63}$/.test(element.tagName)
    ) {
      return null;
    }

    result.tagName = element.tagName;
  }

  return result;
}

export class EventProcessor implements EventPipeline {
  private processing = false;
  private readonly factory: EventFactory;
  private readonly validator = new EventValidator();
  private readonly diagnostics: Diagnostics;

  constructor(private readonly options: EventProcessorOptions) {
    this.factory = new EventFactory(options);
    this.diagnostics = options.diagnostics ?? new Diagnostics();
  }

  process(input: RawMonitorEvent): void {
    if (this.processing) {
      this.diagnostics.record('reentrant');
      return;
    }
    this.processing = true;
    try {
      if (this.options.isAuthorized?.() === false) {
        this.diagnostics.record('unauthorized');
        return;
      }
      if (
        typeof input !== 'object' ||
        input === null ||
        ['category', 'type', 'source', 'element', 'page', 'metadata'].some(
          (key) => {
            const descriptor = Object.getOwnPropertyDescriptor(input, key);
            return descriptor !== undefined && !('value' in descriptor);
          },
        )
      ) {
        this.diagnostics.record('invalid_event');
        return;
      }
      const category = readDataProperty(input, 'category');
      const type = readDataProperty(input, 'type');
      const source = readDataProperty(input, 'source');
      if (!isEventKind(category, type, source)) {
        this.diagnostics.record('invalid_event');
        return;
      }
      const rawElement = readDataProperty(input, 'element');
      const element =
        source === 'auto' && rawElement !== undefined
          ? copyElement(copyJson(rawElement) as ElementDescriptor)
          : undefined;
      if (
        element === null ||
        (['element', 'field', 'form'].includes(String(category)) &&
          element === undefined)
      ) {
        this.diagnostics.record('invalid_event');
        return;
      }
      const rawMetadata = readDataProperty(input, 'metadata');
      const metadata =
        category === 'error'
          ? filterErrorMetadata(rawMetadata)
          : rawMetadata === undefined
            ? {}
            : filterMetadata(rawMetadata);
      if (metadata === null) {
        this.diagnostics.record('invalid_metadata');
        return;
      }
      const rawPage = readDataProperty(input, 'page') ??
        this.options.getPage?.() ?? { path: '/' };
      const page = copyPage(copyJson(rawPage) as PageContext);
      const event = this.factory.create(
        {
          category,
          type,
          source,
          ...(element === undefined ? {} : { element }),
          ...(Object.keys(metadata).length ? { metadata } : {}),
        } as RawMonitorEvent,
        page,
      );
      if (!this.validator.validate(event)) {
        this.diagnostics.record('invalid_event');
        return;
      }
      if (this.options.isAuthorized?.() === false) {
        this.diagnostics.record('unauthorized');
        return;
      }
      try {
        const emission: unknown = this.options.sink.emit(event);
        this.diagnostics.recordEmission();
        if (emission != null)
          void Promise.resolve(emission).catch(() =>
            this.diagnostics.record('transport_error'),
          );
      } catch {
        this.diagnostics.record('transport_error');
      }
    } catch {
      this.diagnostics.record('processing_error');
    } finally {
      this.processing = false;
    }
  }
}
