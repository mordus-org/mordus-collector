import { describe, expect, it, vi } from 'vitest';
import { SessionManager } from '@/context/SessionManager';
import { createMonitor } from '@/index';
import type { MonitorEvent } from '@/index';

function fakeWindow(storage = new Map<string, string>()): Window {
  return {
    sessionStorage: {
      getItem: vi.fn((key: string) => storage.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => storage.set(key, value)),
      removeItem: vi.fn((key: string) => storage.delete(key)),
    },
  } as unknown as Window;
}

function session(window: Window, projectId = 'project', id = 'session-new') {
  return new SessionManager({ window, projectId, generateId: () => id });
}

describe('session context', () => {
  it('shares a session within a document and restores it after reload', () => {
    const storage = new Map<string, string>();
    const first = fakeWindow(storage);
    expect(session(first).getId()).toBe('session-new');
    expect(session(first, 'project', 'other').getId()).toBe('session-new');
    expect(session(fakeWindow(storage), 'project', 'other').getId()).toBe(
      'session-new',
    );
    expect(session(first, 'another-project', 'other').getId()).toBe('other');
    expect(session(fakeWindow(), 'project', 'tab-two').getId()).toBe('tab-two');
  });

  it('regenerates invalid stored IDs even when removal fails', () => {
    const window = fakeWindow(
      new Map([['mordus.session.project', 'person@example.test']]),
    );
    vi.mocked(window.sessionStorage.removeItem).mockImplementation(() => {
      throw new Error();
    });
    expect(session(window).getId()).toBe('session-new');
  });

  it('preserves the shared memory session through intermittent storage failures', () => {
    const window = fakeWindow();
    vi.mocked(window.sessionStorage.getItem).mockImplementation(() => {
      throw new Error();
    });
    vi.mocked(window.sessionStorage.setItem).mockImplementation(() => {
      throw new Error();
    });
    expect(session(window).getId()).toBe('session-new');
    vi.mocked(window.sessionStorage.getItem).mockReturnValue('older-session');
    expect(session(window, 'project', 'other').getId()).toBe('session-new');
  });

  it('supports a blocked storage getter and rejects invalid generated IDs', () => {
    const window = {} as Window;
    Object.defineProperty(window, 'sessionStorage', {
      get() {
        throw new Error();
      },
    });
    expect(session(window).getId()).toBe('session-new');
    expect(() =>
      session(fakeWindow(), 'project', 'invalid id').getId(),
    ).toThrow(TypeError);
  });

  it('separates a cloned opener session and preserves it on child reload', () => {
    const opener = fakeWindow(
      new Map([['mordus.session.project', 'parent-session']]),
    );
    const storage = new Map([['mordus.session.project', 'parent-session']]);
    const child = fakeWindow(storage);
    Object.assign(child, { opener });
    expect(session(child, 'project', 'child-session').getId()).toBe(
      'child-session',
    );
    const reloaded = fakeWindow(storage);
    Object.assign(reloaded, { opener });
    expect(session(reloaded, 'project', 'other').getId()).toBe('child-session');
  });
});

it('applies optional identity only to future events and clears it without changing session', () => {
  const events: MonitorEvent[] = [];
  const monitor = createMonitor(
    { projectId: 'identity', endpoint: '/events', collectionEnabled: true },
    {
      collectors: [],
      transport: { emit: (event) => events.push(event), async flush() {} },
    },
  );
  monitor.start();
  monitor.track('before.identity');
  expect(monitor.identify('user_42')).toBe(true);
  monitor.track('with.identity');
  expect(monitor.identify('person@example.test')).toBe(false);
  monitor.resetIdentity();
  monitor.track('after.identity');
  monitor.stop();
  monitor.start();
  monitor.track('after.restart');
  monitor.stop();
  expect(events.map((event) => event.userId)).toEqual([
    undefined,
    'user_42',
    undefined,
    undefined,
  ]);
  expect(new Set(events.map((event) => event.sessionId)).size).toBe(1);
  expect(events.every((event) => event.element === undefined)).toBe(true);
});

it('does not accept identity before collection authorization', () => {
  const monitor = createMonitor({ projectId: 'disabled', endpoint: '/events' });
  expect(monitor.identify('user_42')).toBe(false);
});
