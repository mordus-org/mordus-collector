import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMonitor, Monitor } from '@/index';

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe('monitor instantiation', () => {
  it('leaves input content and browser resources untouched', () => {
    const input = document.createElement('input');
    input.value = 'private-example';
    document.body.append(input);

    const readValue = vi.spyOn(input, 'value', 'get');
    const documentListener = vi.spyOn(document, 'addEventListener');
    const windowListener = vi.spyOn(window, 'addEventListener');
    const fetch = vi.spyOn(globalThis, 'fetch');
    const interval = vi.spyOn(globalThis, 'setInterval');
    const storage = vi.spyOn(Storage.prototype, 'setItem');

    const monitor = createMonitor({
      projectId: 'example',
      endpoint: '/api/monitor/events',
    });

    expect(monitor).toBeInstanceOf(Monitor);
    expect(readValue).not.toHaveBeenCalled();
    expect(documentListener).not.toHaveBeenCalled();
    expect(windowListener).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect(interval).not.toHaveBeenCalled();
    expect(storage).not.toHaveBeenCalled();
    expect(JSON.stringify(monitor)).not.toContain('private-example');
  });
});
