import { isContextIdentifier } from '../context/SessionManager.js';
import { AUTOMATIC_EVENT_TYPES, SCHEMA_VERSION } from '../types/events.js';
import type { MonitorEvent } from '../types/events.js';

export const MAX_EVENT_BYTES = 16384;

export function copyJson(value: unknown, maxBytes = MAX_EVENT_BYTES): unknown {
  const ancestors = new Set<object>();
  let bytes = 0;
  let entries = 0;
  const encoder = new TextEncoder();
  const account = (text: string) => {
    bytes += encoder.encode(text).length;
    if (bytes > maxBytes) throw new RangeError();
  };
  const visit = (input: unknown, depth: number): unknown => {
    if (
      input === null ||
      typeof input === 'boolean' ||
      typeof input === 'string' ||
      (typeof input === 'number' && Number.isFinite(input))
    ) {
      account(JSON.stringify(input));
      return input;
    }
    if (typeof input !== 'object' || depth > 8 || ancestors.has(input))
      throw new TypeError();
    const array = Array.isArray(input);
    const prototype = Object.getPrototypeOf(input);
    if (!array && prototype !== Object.prototype && prototype !== null)
      throw new TypeError();
    ancestors.add(input);
    account('{}');
    const keys = Reflect.ownKeys(input);
    if (keys.length > 256) throw new RangeError();
    const output: Record<string, unknown> = {};
    const items: unknown[] = [];
    for (const key of keys) {
      if (array && key === 'length') continue;
      if (
        ++entries > 256 ||
        typeof key !== 'string' ||
        ['__proto__', 'constructor', 'prototype'].includes(key)
      )
        throw new TypeError();
      const descriptor = Object.getOwnPropertyDescriptor(input, key);
      if (!descriptor || !('value' in descriptor)) throw new TypeError();
      account(JSON.stringify(key) + ':,');
      const child = visit(descriptor.value, depth + 1);
      if (array) {
        if (key !== String(items.length)) throw new TypeError();
        items.push(child);
      } else output[key] = child;
    }
    ancestors.delete(input);
    return array ? items : output;
  };
  return visit(value, 0);
}

export function isEventKind(
  category: unknown,
  type: unknown,
  source: unknown,
): boolean {
  if (
    typeof type !== 'string' ||
    type.length > 128 ||
    !/^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/i.test(type)
  )
    return false;
  return (
    (source === 'manual' && category === 'custom') ||
    (source === 'auto' &&
      AUTOMATIC_EVENT_TYPES.some((candidate) => candidate === type) &&
      category === type.split('.')[0])
  );
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function identifier(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z][a-z0-9._:-]{0,127}$/i.test(value);
}

function keysAllowed(
  value: Record<string, unknown>,
  allowed: readonly string[],
): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function page(value: unknown): boolean {
  if (
    !record(value) ||
    !keysAllowed(value, ['path', 'route', 'previousPath', 'navigationType']) ||
    typeof value.path !== 'string' ||
    value.path.length > 1024 ||
    !value.path.startsWith('/')
  )
    return false;
  for (const key of ['route', 'previousPath']) {
    if (
      value[key] !== undefined &&
      (typeof value[key] !== 'string' ||
        value[key].length > 1024 ||
        !value[key].startsWith('/'))
    )
      return false;
  }
  return (
    value.navigationType === undefined ||
    [
      'initial',
      'pushState',
      'replaceState',
      'popstate',
      'hashchange',
      'router',
    ].includes(String(value.navigationType))
  );
}

function element(value: unknown): boolean {
  if (
    !record(value) ||
    !keysAllowed(value, ['identifier', 'path', 'tagName']) ||
    !identifier(value.identifier)
  )
    return false;
  if (
    value.path !== undefined &&
    (!Array.isArray(value.path) ||
      value.path.length > 16 ||
      !value.path.every(identifier))
  )
    return false;
  return (
    value.tagName === undefined ||
    (typeof value.tagName === 'string' &&
      /^[a-z][a-z0-9-]{0,63}$/.test(value.tagName))
  );
}

export class EventValidator {
  validate(value: unknown): value is MonitorEvent {
    try {
      const event = copyJson(value);
      if (
        !record(event) ||
        !keysAllowed(event, [
          'schemaVersion',
          'eventId',
          'category',
          'type',
          'timestamp',
          'projectId',
          'sessionId',
          'userId',
          'source',
          'page',
          'element',
          'metadata',
        ]) ||
        event.schemaVersion !== SCHEMA_VERSION ||
        !isEventKind(event.category, event.type, event.source)
      )
        return false;
      if (
        !isContextIdentifier(event.eventId) ||
        !isContextIdentifier(event.sessionId) ||
        (event.userId !== undefined && !isContextIdentifier(event.userId))
      )
        return false;
      if (
        typeof event.projectId !== 'string' ||
        !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(event.projectId)
      )
        return false;
      if (
        typeof event.timestamp !== 'string' ||
        new Date(event.timestamp).toISOString() !== event.timestamp ||
        !page(event.page)
      )
        return false;
      if (event.element !== undefined && !element(event.element)) return false;
      if (
        ['element', 'field', 'form'].includes(String(event.category)) &&
        event.element === undefined
      )
        return false;
      return event.metadata === undefined || record(event.metadata);
    } catch {
      return false;
    }
  }
}
