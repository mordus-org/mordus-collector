import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMonitor } from '@/index';
import type { Monitor, MonitorEvent } from '@/index';

afterEach(() => {
  document.body.replaceChildren();
});

describe('collector resources', () => {
  it('releases listeners on stop and creates one listener after restart', () => {
    const events: MonitorEvent[] = [];
    const monitor = createMonitor(
      { projectId: 'example', endpoint: '/events', collectionEnabled: true },
      {
        transport: { emit: (event) => events.push(event), async flush() {} },
        collectors: [
          {
            name: 'fake',
            create: (pipeline) => {
              const listener = () =>
                pipeline.process({
                  category: 'page',
                  type: 'page.view',
                  source: 'auto',
                });

              return {
                start: () => document.addEventListener('click', listener),
                stop: () => document.removeEventListener('click', listener),
              };
            },
          },
        ],
      },
    );

    monitor.start();
    monitor.start();
    document.dispatchEvent(new Event('click'));
    monitor.stop();
    document.dispatchEvent(new Event('click'));
    monitor.start();
    document.dispatchEvent(new Event('click'));
    monitor.stop();
    document.dispatchEvent(new Event('click'));

    expect(events).toHaveLength(2);
  });

  it('cancels initialization when a synchronous emission stops the monitor', () => {
    const nextCreate = vi.fn(() => ({ start() {}, stop() {} }));
    const listener = vi.fn();
    const monitor: Monitor = createMonitor(
      { projectId: 'example', endpoint: '/events', collectionEnabled: true },
      {
        transport: {
          emit() {
            monitor.stop();
            monitor.start();
          },
          async flush() {},
        },
        collectors: [
          {
            name: 'first',
            create: (pipeline) => ({
              start() {
                pipeline.process({
                  category: 'page',
                  type: 'page.view',
                  source: 'auto',
                });
                document.addEventListener('click', listener);
              },
              stop() {
                document.removeEventListener('click', listener);
              },
            }),
          },
          { name: 'next', create: nextCreate },
        ],
      },
    );

    monitor.start();
    document.dispatchEvent(new Event('click'));

    expect(monitor.state).toBe('stopped');
    expect(nextCreate).not.toHaveBeenCalled();
    expect(listener).not.toHaveBeenCalled();
  });
});
