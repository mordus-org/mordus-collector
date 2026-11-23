import { expect, it } from 'vitest';
import { filterMetadata, filterErrorMetadata } from '@/pipeline/PrivacyFilter';

it('copies semantic metadata and removes sensitive fields without invoking getters', () => {
  const input = {
    source: 'page',
    count: 2,
    nested: { enabled: true, email: 'person@example.test' },
    tags: ['product', 'person@example.test'],
    get password() {
      throw new Error('must not read');
    },
  };
  const result = filterMetadata(input);
  expect(result).toEqual({
    source: 'page',
    count: 2,
    nested: { enabled: true },
    tags: ['product'],
  });
  input.nested.enabled = false;
  expect(result?.nested).toEqual({ enabled: true });
  expect(
    filterMetadata(
      JSON.parse(
        '{"__proto__":{"polluted":true},"constructor":"bad","source":"page"}',
      ),
    ),
  ).toEqual({ source: 'page' });
});

it('rejects unsupported, cyclic, oversized, deep and accessor metadata', () => {
  const cycle: Record<string, unknown> = {};
  cycle.self = cycle;
  for (const value of [
    cycle,
    { date: new Date() },
    { amount: Infinity },
    { source: 'x'.repeat(129) },
    { a: { b: { c: { d: { e: {} } } } } },
    Object.fromEntries(
      Array.from({ length: 101 }, (_, index) => [`key${index}`, true]),
    ),
    Object.fromEntries(
      Array.from({ length: 80 }, (_, index) => [
        `key${index}`,
        'x'.repeat(128),
      ]),
    ),
    {
      get source() {
        throw new Error('must not execute');
      },
    },
  ]) {
    expect(filterMetadata(value)).toBeNull();
  }
});

it('normalizes untrusted error fields and reconstructs only HTTP stack locations', () => {
  const result = filterErrorMetadata({
    errorName: 'TypeError',
    message: 'person@example.test',
    url: 'https://example.test/app.js?token=private#secret',
    line: 2,
    column: 3,
    stack:
      'TypeError: secret\n at fn (https://example.test/app.js?token=private:10:20)\n at local (file:///Users/private/app.js:1:2)\n at auth (https://user:password@example.test/app.js:1:2)\n at unknown private-value\n at email (https://example.test/person%40example.test:2:3)',
  });
  expect(result).toEqual({
    errorName: 'TypeError',
    message: 'TypeError captured',
    location: { path: '/app.js', line: 2, column: 3 },
    frames: [
      { path: '/app.js', line: 10, column: 20 },
      { path: '/[redacted]', line: 2, column: 3 },
    ],
  });
  expect(JSON.stringify(result)).not.toMatch(
    /private|secret|password|example\.test/,
  );
  expect(
    filterErrorMetadata({ errorName: 'private-error', message: 'private' }),
  ).toEqual({ errorName: 'Error', message: 'Error captured' });
});
