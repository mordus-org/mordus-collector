import { sanitizePath } from '@/navigation/PageManager';

export const METADATA_LIMITS = {
  depth: 4,
  entries: 100,
  bytes: 8192,
  stringLength: 128,
} as const;
const sensitiveKey =
  /password|passwd|secret|token|authorization|cookie|email|phone|address|credit|card|ssn|cpf|value|text|html|content|message|stack/i;
const forbiddenKeys = new Set(['__proto__', 'constructor', 'prototype']);
const omitted = Symbol('omitted');
const errorNames = [
  'Error',
  'TypeError',
  'RangeError',
  'ReferenceError',
  'SyntaxError',
  'URIError',
  'EvalError',
  'AggregateError',
] as const;

export function normalizeErrorName(value: unknown): string {
  return errorNames.some((name) => name === value)
    ? (value as string)
    : 'Error';
}

export function readDataProperty(value: unknown, key: string): unknown {
  if (typeof value !== 'object' || value === null) return undefined;
  return Object.getOwnPropertyDescriptor(value, key)?.value;
}

export function filterMetadata(input: unknown): Record<string, unknown> | null {
  let entries = 0;
  let bytes = 2;
  const ancestors = new Set<object>();
  const encoder = new TextEncoder();

  const account = (value: string) => {
    bytes += encoder.encode(value).length;
    if (bytes > METADATA_LIMITS.bytes) throw new RangeError();
  };

  const visit = (value: unknown, depth: number): unknown => {
    if (value === null || typeof value === 'boolean') {
      account(String(value));
      return value;
    }
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) throw new TypeError();
      account(String(value));
      return value;
    }
    if (typeof value === 'string') {
      if (value.length > METADATA_LIMITS.stringLength) throw new RangeError();
      account(JSON.stringify(value));
      return /^[a-z][a-z0-9._:-]*$/i.test(value) &&
        !/(?:token|password|secret)/i.test(value)
        ? value
        : omitted;
    }
    if (typeof value !== 'object' || depth > METADATA_LIMITS.depth)
      throw new TypeError();
    if (ancestors.has(value)) throw new TypeError();
    const array = Array.isArray(value);
    if (
      !array &&
      Object.getPrototypeOf(value) !== Object.prototype &&
      Object.getPrototypeOf(value) !== null
    )
      throw new TypeError();

    ancestors.add(value);
    const result: Record<string, unknown> = {};
    const items: unknown[] = [];
    const keys = Reflect.ownKeys(value);
    if (keys.length > METADATA_LIMITS.entries + (array ? 1 : 0))
      throw new RangeError();

    for (const key of keys) {
      if (array && key === 'length') continue;
      if (++entries > METADATA_LIMITS.entries) throw new RangeError();
      if (typeof key !== 'string' || key.length > 128) throw new TypeError();
      account(JSON.stringify(key) + ':,');
      if (forbiddenKeys.has(key) || sensitiveKey.test(key)) continue;
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !('value' in descriptor)) throw new TypeError();
      const child = visit(descriptor.value, depth + 1);
      if (child === omitted) continue;
      if (array) items.push(child);
      else result[key] = child;
    }
    ancestors.delete(value);
    account('{}');
    return array ? items : result;
  };

  try {
    if (typeof input !== 'object' || input === null || Array.isArray(input))
      return null;
    return visit(input, 0) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function location(
  urlValue: unknown,
  lineValue: unknown,
  columnValue: unknown,
): Record<string, unknown> | null {
  if (typeof urlValue !== 'string' || urlValue.length > 2048) return null;
  try {
    const url = new URL(urlValue);
    if (
      !['https:', 'http:'].includes(url.protocol) ||
      url.username ||
      url.password
    )
      return null;
    const path = sanitizePath(url.pathname);
    const result: Record<string, unknown> = { path };
    if (
      typeof lineValue === 'number' &&
      Number.isInteger(lineValue) &&
      lineValue > 0 &&
      lineValue <= 2147483647
    )
      result.line = lineValue;
    if (
      typeof columnValue === 'number' &&
      Number.isInteger(columnValue) &&
      columnValue > 0 &&
      columnValue <= 2147483647
    )
      result.column = columnValue;
    return result;
  } catch {
    return null;
  }
}

export function filterErrorMetadata(input: unknown): Record<string, unknown> {
  const errorName = normalizeErrorName(readDataProperty(input, 'errorName'));
  const result: Record<string, unknown> = {
    errorName,
    message: `${errorName} captured`,
  };
  const source = location(
    readDataProperty(input, 'url'),
    readDataProperty(input, 'line'),
    readDataProperty(input, 'column'),
  );
  if (source) result.location = source;
  const stack = readDataProperty(input, 'stack');
  const frames: Record<string, unknown>[] = [];
  if (typeof stack === 'string' && stack.length <= 8192) {
    for (const frame of stack.split('\n').slice(1, 9)) {
      const match = frame.match(
        /(?:\(|@|\s)(https?:\/\/[^\s)]+):(\d+):(\d+)\)?$/,
      );
      if (!match) continue;
      const sanitized = location(match[1], Number(match[2]), Number(match[3]));
      if (sanitized) frames.push(sanitized);
    }
  }
  if (frames.length) result.frames = frames;
  return result;
}
