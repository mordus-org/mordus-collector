import { afterEach, describe, expect, it } from 'vitest';
import { NavigationCollector } from '@/navigation/NavigationCollector';
import { sanitizePath } from '@/navigation/PageManager';
import { createMonitor } from '@/core/Monitor';
import type { RawMonitorEvent, MonitorEvent } from '@/types/events';

const collectors: NavigationCollector[] = [];
afterEach(() => {
  for (const collector of collectors) collector.stop();
  collectors.length = 0;
  window.history.replaceState(null, '', '/');
});

function setup(callback?: (event: RawMonitorEvent) => void) {
  const events: RawMonitorEvent[] = [];
  const collector = new NavigationCollector({
    window,
    pipeline: {
      process(event) {
        events.push(event);
        callback?.(event);
      },
    },
  });
  collectors.push(collector);
  return { collector, events };
}

describe('navigation', () => {
  it('captures initial and effective transitions without query or anchor duplication', () => {
    const { collector, events } = setup();
    collector.start();
    collector.start();
    window.history.pushState(null, '', '/products?token=secret');
    window.history.replaceState(null, '', '/products?email=person@example.com');
    collector.notifyRoute('/products/:id');
    window.dispatchEvent(new PopStateEvent('popstate'));
    expect(events).toHaveLength(2);
    expect(collector.pageManager.current.route).toBe('/products/:id');
    window.history.replaceState(null, '', '/checkout');
    expect(events.at(-1)?.page).toMatchObject({
      path: '/checkout',
      previousPath: '/products',
      navigationType: 'replaceState',
    });
    collector.stop();
    window.history.pushState(null, '', '/stopped');
    expect(events).toHaveLength(3);
  });

  it('shares wrappers and restores original property descriptors', () => {
    const descriptor = Object.getOwnPropertyDescriptor(
      window.history,
      'pushState',
    );
    const original = window.history.pushState;
    const first = setup();
    const second = setup();
    first.collector.start();
    const wrapper = window.history.pushState;
    second.collector.start();
    expect(window.history.pushState).toBe(wrapper);
    first.collector.stop();
    window.history.pushState(null, '', '/active');
    expect(first.events).toHaveLength(1);
    expect(second.events).toHaveLength(2);
    second.collector.stop();
    expect(window.history.pushState).toBe(original);
    expect(
      Object.getOwnPropertyDescriptor(window.history, 'pushState'),
    ).toEqual(descriptor);
  });

  it('preserves snapshots during reentrant navigation', () => {
    const first = setup((event) => {
      if (event.page?.path === '/one')
        window.history.pushState(null, '', '/two');
    });
    const second = setup();
    first.collector.start();
    second.collector.start();
    window.history.pushState(null, '', '/one');
    expect(second.events.map((event) => event.page?.path)).toEqual([
      '/',
      '/one',
      '/two',
    ]);
  });

  it('cleans up when stopped from the initial emission', () => {
    const original = window.history.pushState;
    const { collector } = setup(() => collector.stop());
    collector.start();
    expect(window.history.pushState).toBe(original);
  });

  it('captures hash routes and deduplicates native signals', () => {
    const { collector, events } = setup();
    collector.start();
    window.history.replaceState(null, '', '/#/orders?token=private');
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    expect(events.at(-1)?.page?.path).toBe('/#/orders');
    expect(events).toHaveLength(2);
    expect(
      sanitizePath('/account/person%40example.com?token=private#anchor'),
    ).toBe('/account/[redacted]');
    expect(sanitizePath(sanitizePath('/account/person%40example.com'))).toBe(
      '/account/[redacted]',
    );
  });

  it('preserves original History errors and external wrappers through restart', () => {
    const { collector, events } = setup();
    const original = window.history.pushState;
    collector.start();
    expect(() =>
      window.history.pushState(null, '', 'https://elsewhere.invalid'),
    ).toThrow();
    expect(events).toHaveLength(1);
    const wrapped = window.history.pushState;
    const external: History['pushState'] = function (this: History, ...args) {
      return Reflect.apply(wrapped, this, args);
    };
    window.history.pushState = external;
    collector.stop();
    expect(window.history.pushState).toBe(external);
    collector.start();
    window.history.pushState(null, '', '/restarted');
    expect(events).toHaveLength(3);
    collector.stop();
    window.history.pushState = original;
  });

  it('enriches manual events through the normal monitor entry point', () => {
    const events: MonitorEvent[] = [];
    const monitor = createMonitor(
      { projectId: 'app', endpoint: '/events', collectionEnabled: true },
      {
        transport: {
          emit(event) {
            events.push(event);
          },
          async flush() {},
        },
      },
    );
    try {
      monitor.start();
      window.history.pushState(null, '', '/orders?token=private');
      monitor.notifyRoute('/orders/:id');
      monitor.track('order.confirm');
      expect(events.filter((event) => event.type === 'page.view')).toHaveLength(
        2,
      );
      expect(events.at(-1)?.page).toMatchObject({
        path: '/orders',
        route: '/orders/:id',
      });
      expect(JSON.stringify(events)).not.toContain('private');
    } finally {
      monitor.stop();
    }
  });
});
