import { DelegatedDomCollector } from '@/collectors/DelegatedDomCollector';
import { ElementResolver } from '@/identification/ElementResolver';
import type { Collector } from '@/types/collector';
import type { RawMonitorEvent } from '@/types/events';
import type { EventPipeline } from '@/types/pipeline';

export interface FieldCollectorOptions {
  document: Document;
  pipeline: EventPipeline;
  attribute?: string;
}

export class FieldCollector implements Collector {
  private readonly delegates: DelegatedDomCollector[];
  private readonly attribute: string;
  private pendingChanges = new WeakSet<Element>();

  constructor(options: FieldCollectorOptions) {
    this.attribute = options.attribute ?? 'data-monitor';
    const resolver = new ElementResolver(options.attribute);

    const resolve = (event: Event): RawMonitorEvent | null => {
      const field = event.target;

      if (!this.isEligibleField(field)) {
        return null;
      }

      const element = resolver.resolve(event);

      if (!element || element.tagName === 'form') {
        return null;
      }

      const isSelection =
        field instanceof HTMLSelectElement ||
        (field instanceof HTMLInputElement &&
          (field.type === 'checkbox' || field.type === 'radio'));

      if (event.type === 'input') {
        if (!isSelection) {
          this.pendingChanges.add(field);
        }

        return null;
      }

      if (event.type === 'focusout') {
        if (isSelection || !this.pendingChanges.has(field)) {
          return null;
        }

        this.pendingChanges.delete(field);
      } else if (event.type === 'change') {
        this.pendingChanges.delete(field);
      }

      return {
        category: 'field',
        type: isSelection ? 'field.selection' : 'field.change',
        source: 'auto',
        element,
      };
    };

    this.delegates = ['input', 'change', 'focusout'].map(
      (eventType) =>
        new DelegatedDomCollector({
          document: options.document,
          eventType,
          pipeline: options.pipeline,
          resolve,
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

    this.pendingChanges = new WeakSet<Element>();

    if (firstError) {
      throw firstError;
    }
  }

  private isEligibleField(
    target: EventTarget | null,
  ): target is HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement {
    if (
      !(target instanceof HTMLInputElement) &&
      !(target instanceof HTMLTextAreaElement) &&
      !(target instanceof HTMLSelectElement)
    ) {
      return false;
    }

    if (target.closest('[contenteditable]')) {
      return false;
    }

    if (target instanceof HTMLInputElement) {
      if (
        [
          'password',
          'hidden',
          'file',
          'button',
          'submit',
          'reset',
          'image',
        ].includes(target.type)
      ) {
        return false;
      }
    }

    const identity = [
      target.getAttribute('name'),
      target.getAttribute('id'),
      target.getAttribute('autocomplete'),
      target.getAttribute(this.attribute),
    ].join(' ');

    return !/(?:password|passwd|token|secret|auth|credential|cvv|cvc|card-number)/i.test(
      identity,
    );
  }
}
