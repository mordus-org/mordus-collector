import { expect, it, vi } from 'vitest';
import { EventProcessor } from '@/pipeline/EventProcessor';
import { EventValidator } from '@/pipeline/EventValidator';
import { Diagnostics } from '@/pipeline/Diagnostics';
import { AUTOMATIC_EVENT_TYPES, createMonitor } from '@/index';
import type {
  EventCategory,
  Monitor,
  MonitorEvent,
  RawMonitorEvent,
} from '@/index';

function setup() {
  const events: MonitorEvent[] = [];
  const diagnostics = new Diagnostics();
  const processor = new EventProcessor({
    projectId: 'project',
    sessionId: 'session',
    generateId: () => 'event',
    now: () => new Date('2026-01-01T00:00:00.000Z'),
    sink: { emit: (event) => events.push(event) },
    diagnostics,
  });
  return { events, diagnostics, processor };
}

it('emits valid envelopes for every collector and manual event', () => {
  const { processor, events } = setup();
  for (const type of AUTOMATIC_EVENT_TYPES) {
    const category = type.split('.')[0] as EventCategory;
    processor.process({
      category,
      type,
      source: 'auto',
      ...(['element', 'field', 'form'].includes(category)
        ? {
            element: {
              identifier: 'action',
              path: ['region', 'action'],
              tagName: 'button',
            },
          }
        : {}),
    });
  }
  processor.process({
    category: 'custom',
    type: 'cart.item_added',
    source: 'manual',
    metadata: { source: 'page' },
    page: { path: '/products?token=private' },
  });
  expect(events).toHaveLength(AUTOMATIC_EVENT_TYPES.length + 1);
  expect(events.every((event) => new EventValidator().validate(event))).toBe(
    true,
  );
  expect(events.at(-1)).toMatchObject({
    schemaVersion: 1,
    projectId: 'project',
    sessionId: 'session',
    timestamp: '2026-01-01T00:00:00.000Z',
    page: { path: '/products' },
    metadata: { source: 'page' },
  });
});

it('rejects malformed payloads without invoking accessors or toJSON', () => {
  const { processor, events } = setup();
  const getter = vi.fn(() => 'private');
  const element = Object.defineProperty({}, 'identifier', { get: getter });
  const page = Object.defineProperty({}, 'path', { get: getter });
  processor.process({
    category: 'element',
    type: 'element.click',
    source: 'auto',
    element,
  } as RawMonitorEvent);
  processor.process({
    category: 'custom',
    type: 'valid.event',
    source: 'manual',
    page,
  } as RawMonitorEvent);
  processor.process(
    Object.defineProperty(
      { category: 'custom', type: 'valid.event', source: 'manual' },
      'metadata',
      { get: getter },
    ) as RawMonitorEvent,
  );
  const validator = new EventValidator();
  expect(validator.validate({ toJSON: getter })).toBe(false);
  expect(
    validator.validate(
      new Proxy(
        {},
        {
          ownKeys() {
            throw new Error('private');
          },
        },
      ),
    ),
  ).toBe(false);
  expect(getter).not.toHaveBeenCalled();
  expect(events).toEqual([]);
});

it('validates the complete payload budget and immutable diagnostic snapshots', () => {
  const { processor, events, diagnostics } = setup();
  processor.process({
    category: 'custom',
    type: 'valid.event',
    source: 'manual',
  });
  const event = events[0]!;
  const validator = new EventValidator();
  expect(
    validator.validate({ ...event, metadata: { source: 'x'.repeat(17000) } }),
  ).toBe(false);
  expect(validator.validate({ ...event, schemaVersion: 2 })).toBe(false);
  expect(validator.validate({ ...event, timestamp: 'invalid' })).toBe(false);
  expect(validator.validate({ ...event, private: 'value' })).toBe(false);
  processor.process({
    category: 'custom',
    type: 'private@example.test',
    source: 'manual',
  });
  const snapshot = diagnostics.snapshot;
  snapshot.discarded.invalid_event = 999;
  expect(diagnostics.snapshot.discarded.invalid_event).toBe(1);
  expect(JSON.stringify(diagnostics.snapshot)).not.toContain('private');
});

it.each(['now', 'generateId'] as const)(
  'rejects events from a revoked cycle even after reauthorization during %s',
  (callback) => {
    const emit = vi.fn();
    let identifier = 0;
    let revoke = false;
    const interrupt = () => {
      if (revoke) {
        monitor.setCollectionEnabled(false);
        monitor.setCollectionEnabled(true);
      }
    };
    const monitor: Monitor = createMonitor(
      { projectId: 'gate', endpoint: '/events', collectionEnabled: true },
      {
        collectors: [],
        generateId: () => {
          if (callback === 'generateId') interrupt();
          return `id-${++identifier}`;
        },
        now: () => {
          if (callback === 'now') interrupt();
          return new Date();
        },
        transport: { emit, async flush() {} },
      },
    );
    monitor.start();
    revoke = true;
    monitor.track('private.event');
    expect(emit).not.toHaveBeenCalled();
    expect(monitor.state).toBe('stopped');
    expect(monitor.diagnostics.discarded.unauthorized).toBe(1);
    revoke = false;
    monitor.start();
    monitor.track('valid.event');
    expect(emit).toHaveBeenCalledOnce();
    monitor.stop();
  },
);

it('revokes collection, clears identity and cancels queued flush work', async () => {
  const emit = vi.fn();
  const flush = vi.fn(async () => {});
  const stop = vi.fn();
  const clear = vi.fn();
  const monitor = createMonitor(
    { projectId: 'gate', endpoint: '/events' },
    { collectors: [], transport: { emit, flush, stop, clear } },
  );
  monitor.start();
  monitor.track('before.authorization');
  expect(emit).not.toHaveBeenCalled();
  monitor.setCollectionEnabled(true);
  monitor.start();
  monitor.identify('opaque-user');
  const pending = monitor.flush();
  monitor.setCollectionEnabled(false);
  await pending;
  expect(flush).not.toHaveBeenCalled();
  expect(stop).toHaveBeenCalledOnce();
  expect(clear).toHaveBeenCalledOnce();
  monitor.setCollectionEnabled(true);
  monitor.start();
  monitor.track('after.authorization');
  expect(emit.mock.calls[0]?.[0].userId).toBeUndefined();
  monitor.stop();
});
