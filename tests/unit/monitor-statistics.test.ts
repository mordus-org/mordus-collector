import { afterEach, expect, it, vi } from 'vitest';
import { createMonitor } from '@/index';
import type { Monitor, TransportStatistics } from '@/index';

const monitors: Monitor[] = [];
afterEach(() => {
  for (const monitor of monitors.splice(0)) monitor.stop();
  vi.unstubAllGlobals();
});

it('exposes queue overflow and HTTP failures from the default transport', async () => {
  let finish!: (response: Response) => void;
  const request = vi.fn<typeof fetch>().mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  vi.stubGlobal('fetch', request);
  const monitor = createMonitor(
    {
      projectId: 'statistics',
      endpoint: '/events',
      collectionEnabled: true,
      transport: { batchSize: 2, maxQueueSize: 2, flushIntervalMs: 60000 },
    },
    { collectors: [] },
  );
  monitors.push(monitor);
  monitor.start();
  monitor.track('queue.first', { password: 'private-value' });
  monitor.track('queue.second');
  monitor.track('queue.overflow');
  const snapshot: TransportStatistics | undefined = monitor.transportStatistics;
  expect(snapshot).toEqual({
    queued: 2,
    delivered: 0,
    dropped: 1,
    failures: 0,
    retries: 0,
  });
  snapshot!.queued = 999;
  expect(monitor.transportStatistics?.queued).toBe(2);
  expect(JSON.stringify(monitor.transportStatistics)).not.toContain(
    'private-value',
  );

  finish(new Response(null, { status: 400 }));
  await monitor.flush();
  expect(monitor.transportStatistics).toEqual({
    queued: 0,
    delivered: 0,
    dropped: 3,
    failures: 1,
    retries: 0,
  });
  expect(monitor.diagnostics.emitted).toBe(3);
});

it('copies only supported counts and contains unsupported injected statistics', () => {
  const statistics = {
    queued: 1,
    delivered: 2,
    dropped: 3,
    failures: 4,
    retries: 5,
    payload: 'private-value',
  };
  const transport = { statistics, emit() {}, async flush() {} };
  const monitor = createMonitor(
    { projectId: 'custom', endpoint: '/events' },
    { transport },
  );
  monitors.push(monitor);
  expect(monitor.transportStatistics).toEqual({
    queued: 1,
    delivered: 2,
    dropped: 3,
    failures: 4,
    retries: 5,
  });
  statistics.queued = -1;
  expect(monitor.transportStatistics).toBeUndefined();

  const missing = createMonitor(
    { projectId: 'missing', endpoint: '/events' },
    { transport: { emit() {}, async flush() {} } },
  );
  monitors.push(missing);
  expect(missing.transportStatistics).toBeUndefined();

  const throwing = createMonitor(
    { projectId: 'throwing', endpoint: '/events' },
    {
      transport: {
        get statistics(): TransportStatistics {
          throw new Error('private-value');
        },
        emit() {},
        async flush() {},
      },
    },
  );
  monitors.push(throwing);
  expect(throwing.transportStatistics).toBeUndefined();
});
