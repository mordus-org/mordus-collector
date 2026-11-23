import type { ElementDescriptor } from '../types/events.js';

export class ElementResolver {
  constructor(private readonly attribute = 'data-monitor') {}

  resolve(event: Event): ElementDescriptor | null {
    const elements = this.getEventElements(event);

    if (
      elements.some((element) => element.hasAttribute('data-monitor-ignore'))
    ) {
      return null;
    }

    const target = elements.find((element) =>
      Boolean(element.getAttribute(this.attribute)?.trim()),
    );
    const identifier = target?.getAttribute(this.attribute)?.trim();

    if (!target || !identifier) {
      return null;
    }

    const path = elements
      .slice(elements.indexOf(target))
      .reverse()
      .map((element) => element.getAttribute(this.attribute)?.trim())
      .filter((value): value is string => Boolean(value));

    return {
      identifier,
      path,
      tagName: target.tagName.toLowerCase(),
    };
  }

  private getEventElements(event: Event): Element[] {
    const composedPath =
      typeof event.composedPath === 'function' ? event.composedPath() : [];

    if (composedPath.length > 0) {
      return composedPath.filter(
        (item): item is Element => item instanceof Element,
      );
    }

    const elements: Element[] = [];
    let node: Node | null = event.target as Node | null;

    while (node) {
      if (node instanceof Element) {
        elements.push(node);
      }

      node = node instanceof ShadowRoot ? node.host : node.parentNode;
    }

    return elements;
  }
}
