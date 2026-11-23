import { describe, expect, it, vi } from 'vitest';
import { createMonitor } from '@/index';
import type {
  MonitorConfig,
  MonitorDependencies,
  MonitorEvent,
  EventPipeline,
} from '@/index';

function setupMonitor(
  config: Partial<MonitorConfig> = {},
  dependencies: MonitorDependencies = {},
) {
  const events: MonitorEvent[] = [];
  let nextId = 0;
  const transport = {
    emit: vi.fn((event: MonitorEvent) => events.push(event)),
    flush: vi.fn(async () => {}),
  };

  const monitor = createMonitor(
    {
      projectId: 'example',
      endpoint: '/events',
      collectionEnabled: true,
      ...config,
    },
    {
      now: () => new Date('2026-01-01T00:00:00.000Z'),
      generateId: () => `id-${++nextId}`,
      transport,
      ...dependencies,
    },
  );

  return { monitor, events, transport };
}

describe('monitor lifecycle', () => {
  it('uses injected context and transport for track and flush', async () => {
    const { monitor, events, transport } = setupMonitor();

    expect(monitor.state).toBe('idle');
    monitor.track('before.start');
    monitor.start();
    monitor.track('cart.item_added', { password: 'private-value' });
    await monitor.flush();

    expect(monitor.state).toBe('running');
    expect(events).toEqual([
      {
        schemaVersion: 1,
        eventId: 'id-2',
        category: 'custom',
        type: 'cart.item_added',
        timestamp: '2026-01-01T00:00:00.000Z',
        projectId: 'example',
        sessionId: 'id-1',
        source: 'manual',
        page: { path: '/' },
      },
    ]);
    expect(transport.flush).toHaveBeenCalledOnce();
  });

  it('starts once, stops once and rejects callbacks from previous cycles', () => {
    const pipelines: EventPipeline[] = [];
    const start = vi.fn();
    const stop = vi.fn();
    const { monitor, events } = setupMonitor(
      {},
      {
        collectors: [
          {
            name: 'fake',
            create: (pipeline) => {
              pipelines.push(pipeline);
              return { start, stop };
            },
          },
        ],
      },
    );
    const event = {
      category: 'page',
      type: 'page.view',
      source: 'auto',
    } as const;

    monitor.start();
    monitor.start();
    pipelines[0]?.process(event);
    monitor.stop();
    monitor.stop();
    pipelines[0]?.process(event);
    monitor.track('after.stop');

    expect(start).toHaveBeenCalledOnce();
    expect(stop).toHaveBeenCalledOnce();
    expect(events).toHaveLength(1);
    expect(monitor.state).toBe('stopped');

    monitor.start();
    pipelines[0]?.process(event);
    pipelines[1]?.process(event);

    expect(start).toHaveBeenCalledTimes(2);
    expect(events).toHaveLength(2);
    expect(events[0]?.sessionId).toBe(events[1]?.sessionId);
    monitor.stop();
  });

  it('keeps capture and transport inactive until explicitly enabled', async () => {
    const create = vi.fn(() => ({ start() {}, stop() {} }));
    const generateId = vi.fn(() => 'id');
    const { monitor, events, transport } = setupMonitor(
      { collectionEnabled: false },
      {
        generateId,
        collectors: [{ name: 'fake', create }],
      },
    );

    monitor.start();
    monitor.track('cart.item_added');
    await monitor.flush();

    expect(monitor.state).toBe('idle');
    expect(create).not.toHaveBeenCalled();
    expect(generateId).not.toHaveBeenCalled();
    expect(events).toEqual([]);
    expect(transport.flush).not.toHaveBeenCalled();
  });

  it('does not construct disabled collectors', () => {
    const create = vi.fn(() => ({ start() {}, stop() {} }));
    const { monitor } = setupMonitor(
      { capture: { clicks: false } },
      {
        collectors: [{ name: 'clicks', capture: 'clicks', create }],
      },
    );

    monitor.start();

    expect(monitor.state).toBe('running');
    expect(create).not.toHaveBeenCalled();
    monitor.stop();
  });

  it('rolls back partial starts and ignores teardown emissions', () => {
    let pipeline: EventPipeline | undefined;
    const firstStop = vi.fn(() =>
      pipeline?.process({
        category: 'page',
        type: 'page.view',
        source: 'auto',
      }),
    );
    const secondStop = vi.fn();
    const lastCreate = vi.fn(() => ({ start() {}, stop() {} }));
    const { monitor, events } = setupMonitor(
      {},
      {
        collectors: [
          {
            name: 'first',
            create: (channel) => {
              pipeline = channel;
              return { start() {}, stop: firstStop };
            },
          },
          {
            name: 'second',
            create: () => ({
              start() {
                throw new Error('failure');
              },
              stop: secondStop,
            }),
          },
          { name: 'last', create: lastCreate },
        ],
      },
    );

    expect(() => monitor.start()).not.toThrow();
    expect(monitor.state).toBe('stopped');
    expect(firstStop).toHaveBeenCalledOnce();
    expect(secondStop).toHaveBeenCalledOnce();
    expect(lastCreate).not.toHaveBeenCalled();
    expect(events).toEqual([]);
  });

  it('retries failed cleanup before allowing a restart', () => {
    const start = vi.fn();
    const stop = vi
      .fn()
      .mockImplementationOnce(() => {
        throw new Error('failure');
      })
      .mockImplementationOnce(() => {
        throw new Error('failure');
      });
    const otherStop = vi.fn();
    const { monitor } = setupMonitor(
      {},
      {
        collectors: [
          { name: 'first', create: () => ({ start, stop }) },
          { name: 'second', create: () => ({ start() {}, stop: otherStop }) },
        ],
      },
    );

    monitor.start();
    monitor.stop();
    monitor.start();

    expect(monitor.state).toBe('stopped');
    expect(start).toHaveBeenCalledOnce();
    expect(otherStop).toHaveBeenCalledOnce();

    monitor.start();

    expect(monitor.state).toBe('running');
    expect(start).toHaveBeenCalledTimes(2);
    monitor.stop();
  });

  it('coalesces concurrent flushes and recovers after rejection', async () => {
    const { monitor, transport } = setupMonitor();
    transport.flush.mockRejectedValueOnce(new Error('transport failure'));

    const first = monitor.flush();
    const second = monitor.flush();

    expect(first).toBe(second);
    await expect(first).resolves.toBeUndefined();
    await monitor.flush();

    expect(transport.flush).toHaveBeenCalledTimes(2);
  });
});

describe('configuration', () => {
  it('normalizes defaults and isolates configuration from caller mutation', () => {
    const config: MonitorConfig = {
      projectId: 'example',
      endpoint: '/events',
      capture: { clicks: false },
    };
    const monitor = createMonitor(config);

    config.projectId = 'changed';
    config.capture!.clicks = true;

    expect(monitor.config).toEqual({
      projectId: 'example',
      endpoint: '/events',
      attribute: 'data-monitor',
      capture: {
        clicks: false,
        fields: true,
        forms: true,
        navigation: true,
        errors: true,
      },
      transport: { batchSize: 20, flushIntervalMs: 5000, maxQueueSize: 1000 },
      collectionEnabled: false,
    });
    expect(Object.isFrozen(monitor.config)).toBe(true);
    expect(Object.isFrozen(monitor.config.capture)).toBe(true);
    expect(Object.isFrozen(monitor.config.transport)).toBe(true);
  });

  it.each([
    { projectId: '' },
    { endpoint: 'javascript:private-value' },
    { endpoint: 'https://user:password@example.test/events' },
    { attribute: 'data-monitor-ignore' },
    { collectionEnabled: 'yes' },
    { capture: null },
    { capture: { clicks: null } },
    { transport: { batchSize: 0 } },
    { transport: { flushIntervalMs: Infinity } },
    { transport: { maxQueueSize: 1 } },
  ])(
    'rejects invalid configuration without exposing values (%j)',
    (invalid) => {
      expect(() =>
        createMonitor({
          projectId: 'example',
          endpoint: '/events',
          ...invalid,
        } as MonitorConfig),
      ).toThrow(TypeError);
    },
  );
});

describe('minimal privacy pipeline', () => {
  it('drops metadata and copies only valid semantic descriptor fields', () => {
    let pipeline: EventPipeline | undefined;
    const { monitor, events } = setupMonitor(
      {},
      {
        collectors: [
          {
            name: 'fake',
            create: (channel) => {
              pipeline = channel;
              return { start() {}, stop() {} };
            },
          },
        ],
      },
    );
    const element = {
      identifier: 'checkout.submit',
      path: ['checkout', 'checkout.submit'],
      tagName: 'button',
      value: 'private-value',
      text: 'private-value',
    };

    monitor.start();
    pipeline?.process({
      category: 'element',
      type: 'element.click',
      source: 'auto',
      element,
      metadata: { value: 'private-value' },
    });
    element.path.push('changed');
    monitor.track('cart.item_added', {
      get password() {
        throw new Error('metadata must not be read');
      },
    });

    expect(events).toHaveLength(2);
    expect(events[0]?.element).toEqual({
      identifier: 'checkout.submit',
      path: ['checkout', 'checkout.submit'],
      tagName: 'button',
    });
    expect(JSON.stringify(events)).not.toContain('private-value');
    expect(events.every((event) => event.metadata === undefined)).toBe(true);
    monitor.stop();
  });

  it('rejects malformed descriptors and event names before the sink', () => {
    let pipeline: EventPipeline | undefined;
    const { monitor, events } = setupMonitor(
      {},
      {
        collectors: [
          {
            name: 'fake',
            create: (channel) => {
              pipeline = channel;
              return { start() {}, stop() {} };
            },
          },
        ],
      },
    );

    monitor.start();
    monitor.track('person@example.test');
    monitor.track('x'.repeat(129));
    pipeline?.process({
      category: 'element',
      type: 'element.click',
      source: 'auto',
      element: { identifier: 'person@example.test' },
    });
    pipeline?.process({
      category: 'element',
      type: 'element.click',
      source: 'auto',
      element: { identifier: 'action', path: ['person@example.test'] },
    });
    pipeline?.process({
      category: 'element',
      type: 'element.click',
      source: 'auto',
      element: { identifier: 'action', tagName: '<input value="private">' },
    });

    expect(events).toEqual([]);
    monitor.stop();
  });

  it('contains clock exceptions without logging payloads', () => {
    const log = vi.spyOn(console, 'error');
    const { monitor, events } = setupMonitor(
      {},
      {
        now: () => {
          throw new Error('private-value');
        },
      },
    );

    monitor.start();
    expect(() => monitor.track('valid.event')).not.toThrow();
    expect(events).toEqual([]);
    expect(log).not.toHaveBeenCalled();

    monitor.stop();
    log.mockRestore();
  });
});
