import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMonitor } from '@/index';
import type { MonitorEvent } from '@/index';

const applicationErrorHandler = () => {};
beforeEach(() => window.addEventListener('error', applicationErrorHandler));
afterEach(() => window.removeEventListener('error', applicationErrorHandler));

function setup(errors = true) {
  const events: MonitorEvent[] = [];
  const emit = vi.fn((event: MonitorEvent) => {
    events.push(event);
  });
  const monitor = createMonitor(
    {
      projectId: 'errors-test',
      endpoint: '/events',
      collectionEnabled: true,
      capture: { navigation: false, errors },
    },
    { transport: { emit, async flush() {} } },
  );
  return { monitor, events, emit };
}

function dispatchError() {
  window.dispatchEvent(
    new ErrorEvent('error', {
      error: new TypeError('person@example.test'),
      message: 'private',
      filename: 'https://example.test/app.js?token=private',
      lineno: 3,
      colno: 2,
    }),
  );
}

describe('browser errors and manual events', () => {
  it('captures normalized errors, rejections and business metadata through the shared pipeline', () => {
    const { monitor, events } = setup();
    monitor.start();
    monitor.start();
    monitor.track('cart.item_added', { source: 'page', password: 'private' });
    dispatchError();
    const rejection = new Event('unhandledrejection');
    Object.defineProperty(rejection, 'reason', {
      value: new RangeError('private'),
    });
    window.dispatchEvent(rejection);
    monitor.stop();
    dispatchError();
    expect(events.map((event) => [event.type, event.source])).toEqual([
      ['cart.item_added', 'manual'],
      ['error.javascript', 'auto'],
      ['error.unhandledrejection', 'auto'],
    ]);
    expect(events[0]?.metadata).toEqual({ source: 'page' });
    expect(events[1]?.metadata).toMatchObject({
      errorName: 'TypeError',
      message: 'TypeError captured',
    });
    expect(events[2]?.metadata).toMatchObject({ errorName: 'RangeError' });
    expect(JSON.stringify(events)).not.toMatch(/private|person@/);
    monitor.start();
    dispatchError();
    monitor.stop();
    expect(events).toHaveLength(4);
  });

  it('contains throwing, rejecting and recursively emitting sinks and recovers', async () => {
    const { monitor, events, emit } = setup();
    monitor.start();
    emit.mockImplementationOnce(() => {
      dispatchError();
      throw new Error('private');
    });
    expect(dispatchError).not.toThrow();
    emit.mockImplementationOnce(() => Promise.reject(new Error('private')));
    dispatchError();
    await new Promise((resolve) => setTimeout(resolve, 0));
    dispatchError();
    monitor.stop();
    expect(emit).toHaveBeenCalledTimes(3);
    expect(events).toHaveLength(1);
  });

  it('disables capture and rejects malformed manual metadata', () => {
    const { monitor, events } = setup(false);
    monitor.start();
    dispatchError();
    monitor.track('invalid name');
    monitor.track('valid.event', { source: 'x'.repeat(129) });
    monitor.track('valid.event', { a: { b: { c: { d: { e: {} } } } } });
    monitor.stop();
    expect(events).toEqual([]);
  });
});
