import { expect, it, vi } from 'vitest';
import { BatchManager } from '@/transport/BatchManager';
import type { MonitorEvent } from '@/types/events';

it('flushes on pagehide and revokes pending delivery with clear', async () => {
  const request = vi
    .fn<typeof fetch>()
    .mockResolvedValue({ ok: true } as Response);
  const transport = new BatchManager({
    endpoint: '/events',
    batchSize: 20,
    flushIntervalMs: 60000,
    maxQueueSize: 100,
    window,
    fetch: request,
  });
  const event: MonitorEvent = {
    schemaVersion: 1,
    eventId: 'event',
    category: 'custom',
    type: 'cart.added',
    timestamp: '2026-01-01T00:00:00.000Z',
    projectId: 'app',
    sessionId: 'session',
    source: 'manual',
    page: { path: '/' },
  };
  try {
    transport.start();
    transport.emit(event);
    expect(request).not.toHaveBeenCalled();
    window.dispatchEvent(new Event('pagehide'));
    await transport.flush();
    expect(request).toHaveBeenCalledTimes(1);
    transport.emit(event);
    transport.clear();
    transport.emit(event);
    window.dispatchEvent(new Event('pagehide'));
    await transport.flush();
    expect(request).toHaveBeenCalledTimes(1);
    expect(transport.statistics).toMatchObject({
      queued: 0,
      delivered: 1,
      dropped: 1,
    });
  } finally {
    transport.stop();
  }
});
