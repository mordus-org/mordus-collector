import { sanitizePath } from '@/navigation/PageManager';
import type { NavigationType } from '@/types/events';

type Listener = (path: string, type: NavigationType) => void;
interface Hub {
  listeners: Set<Listener>;
  dispose(): void;
}

const hubs = new WeakMap<Window, Hub>();

function createHub(window: Window): Hub {
  const listeners = new Set<Listener>();
  const restorers: Array<() => void> = [];
  const queue: Array<{ path: string; type: NavigationType }> = [];
  let notifying = false;
  let active = true;

  const notify = (type: NavigationType) => {
    if (!active) return;

    queue.push({ path: sanitizePath(window.location.href), type });
    if (notifying) return;

    notifying = true;
    try {
      while (queue.length > 0 && active) {
        const transition = queue.shift()!;
        for (const listener of [...listeners]) {
          if (!listeners.has(listener)) continue;
          try {
            listener(transition.path, transition.type);
          } catch {
            // Observers must preserve the application's navigation behavior.
          }
        }
      }
    } finally {
      notifying = false;
    }
  };

  const dispose = () => {
    active = false;
    queue.length = 0;
    for (const restore of restorers.reverse()) restore();
  };

  try {
    for (const name of ['pushState', 'replaceState'] as const) {
      const original = window.history[name];
      const descriptor = Object.getOwnPropertyDescriptor(window.history, name);
      const wrapper: History[typeof name] = function (this: History, ...args) {
        const result = Reflect.apply(original, this, args);
        try {
          notify(name);
        } catch {
          // Telemetry failures never change the History API result.
        }
        return result;
      };

      Object.defineProperty(window.history, name, {
        configurable: true,
        enumerable: descriptor?.enumerable ?? false,
        writable: true,
        value: wrapper,
      });
      restorers.push(() => {
        if (window.history[name] !== wrapper) return;
        if (descriptor) Object.defineProperty(window.history, name, descriptor);
        else Reflect.deleteProperty(window.history, name);
      });
    }

    for (const type of ['popstate', 'hashchange'] as const) {
      const listener = () => notify(type);
      window.addEventListener(type, listener);
      restorers.push(() => window.removeEventListener(type, listener));
    }
  } catch (error) {
    dispose();
    throw error;
  }

  return { listeners, dispose };
}

export function observeHistory(window: Window, listener: Listener): () => void {
  let hub = hubs.get(window);
  if (!hub) {
    hub = createHub(window);
    hubs.set(window, hub);
  }

  hub.listeners.add(listener);
  const subscribedHub = hub;

  return () => {
    subscribedHub.listeners.delete(listener);
    if (subscribedHub.listeners.size === 0) {
      subscribedHub.dispose();
      if (hubs.get(window) === subscribedHub) hubs.delete(window);
    }
  };
}
