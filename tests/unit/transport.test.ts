import { afterEach, describe, expect, it, vi } from 'vitest';
import { BatchManager } from '@/transport/BatchManager';
import type { MonitorEvent } from '@/types/events';

function event(eventId: string): MonitorEvent {
  return {
    schemaVersion: 1,
    eventId,
    category: 'custom',
    type: 'cart.added',
    timestamp: '2026-01-01T00:00:00.000Z',
    projectId: 'app',
    sessionId: 'session',
    source: 'manual',
    page: { path: '/' },
  };
}

const managers: BatchManager[] = [];
function manager(
  request: typeof fetch,
  overrides: Partial<ConstructorParameters<typeof BatchManager>[0]> = {},
) {
  const instance = new BatchManager({
    endpoint: '/events',
    batchSize: 2,
    flushIntervalMs: 100,
    maxQueueSize: 3,
    retryDelayMs: 10,
    timeoutMs: 20,
    fetch: request,
    ...overrides,
  });
  managers.push(instance);
  instance.start();
  return instance;
}

afterEach(() => {
  for (const instance of managers.splice(0)) instance.stop();
  vi.useRealTimers();
});

describe('batch delivery', () => {
  it('retains FIFO batches and snapshots while counting in-flight capacity', async () => {
    let finish!: (response: Response) => void;
    const request = vi
      .fn<typeof fetch>()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      )
      .mockResolvedValue(new Response(null, { status: 204 }));
    const transport = manager(request);
    const first = event('one');
    transport.emit(first);
    first.type = 'mutated';
    transport.emit(event('two'));
    transport.emit(event('three'));
    transport.emit(event('four'));
    const pending = transport.flush();
    expect(transport.flush()).toBe(pending);
    expect(transport.statistics).toMatchObject({ queued: 3, dropped: 1 });
    finish(new Response(null, { status: 204 }));
    await pending;
    expect(
      request.mock.calls.map((call) =>
        JSON.parse(String(call[1]?.body)).events.map(
          (item: MonitorEvent) => item.eventId,
        ),
      ),
    ).toEqual([['one', 'two'], ['three']]);
    expect(String(request.mock.calls[0]?.[1]?.body)).not.toContain('mutated');
    expect(transport.statistics).toMatchObject({ queued: 0, delivered: 3 });
  });

  it('retries transient failures with stable IDs and bounded attempts', async () => {
    vi.useFakeTimers();
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status: 503 }));
    const transport = manager(request);
    transport.emit(event('one'));
    const pending = transport.flush();
    await vi.advanceTimersByTimeAsync(30);
    await pending;
    expect(request).toHaveBeenCalledTimes(3);
    expect(new Set(request.mock.calls.map((call) => call[1]?.body)).size).toBe(
      1,
    );
    expect(transport.statistics).toMatchObject({
      dropped: 1,
      failures: 3,
      retries: 2,
    });
  });

  it('discards permanent failures without retry and flushes by interval', async () => {
    vi.useFakeTimers();
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status: 400 }));
    const transport = manager(request);
    transport.emit(event('one'));
    await vi.advanceTimersByTimeAsync(100);
    expect(request).toHaveBeenCalledTimes(1);
    expect(transport.statistics.dropped).toBe(1);
  });

  it('retries network failures and timeouts then succeeds', async () => {
    vi.useFakeTimers();
    const request = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new TypeError('network'))
      .mockImplementationOnce(
        (_url, options) =>
          new Promise((_resolve, reject) => {
            options?.signal?.addEventListener('abort', () =>
              reject(new Error('timeout')),
            );
          }),
      )
      .mockResolvedValue(new Response(null, { status: 204 }));
    const transport = manager(request);
    transport.emit(event('one'));
    const pending = transport.flush();
    await vi.advanceTimersByTimeAsync(50);
    await pending;
    expect(request).toHaveBeenCalledTimes(3);
    expect(transport.statistics.delivered).toBe(1);
  });

  it('isolates a stopped generation from the next start', async () => {
    let finish!: (response: Response) => void;
    const request = vi
      .fn<typeof fetch>()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      )
      .mockResolvedValue(new Response(null, { status: 204 }));
    const transport = manager(request);
    transport.emit(event('old'));
    const old = transport.flush();
    transport.stop();
    transport.start();
    transport.emit(event('new'));
    await transport.flush();
    finish(new Response(null, { status: 204 }));
    await old;
    expect(transport.statistics).toMatchObject({
      delivered: 1,
      dropped: 1,
      queued: 0,
    });
  });

  it('rejects an oversized event and sends credential-free keepalive requests', async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status: 204 }));
    const transport = manager(request);
    transport.emit({
      ...event('large'),
      metadata: { content: 'x'.repeat(62000) },
    });
    transport.emit(event('small'));
    await transport.flush();
    expect(transport.statistics.dropped).toBe(1);
    expect(request.mock.calls[0]?.[1]).toMatchObject({
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      keepalive: true,
    });
  });
});
