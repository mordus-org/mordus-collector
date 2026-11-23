import { afterEach, describe, expect, it, vi } from 'vitest';
import { ClickCollector } from '@/collectors/ClickCollector';

const process = vi.fn();
const pipeline = { process };
let collector: ClickCollector;

function createCollector(attribute?: string): ClickCollector {
  return new ClickCollector({
    document,
    pipeline,
    ...(attribute ? { attribute } : {}),
  });
}

afterEach(() => {
  collector?.stop();
  process.mockReset();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe('ClickCollector', () => {
  it('emits one click for a button and one for its inner icon', () => {
    const button = document.createElement('button');
    button.setAttribute('data-monitor', 'checkout.submit');
    const icon = document.createElement('span');
    button.append(icon);
    document.body.append(button);
    collector = createCollector();
    collector.start();

    button.click();
    icon.click();

    expect(process).toHaveBeenCalledTimes(2);
    expect(process.mock.calls[0]?.[0]).toEqual({
      category: 'element',
      type: 'element.click',
      source: 'auto',
      element: {
        identifier: 'checkout.submit',
        path: ['checkout.submit'],
        tagName: 'button',
      },
    });
    expect(process.mock.calls[1]?.[0]).toEqual(process.mock.calls[0]?.[0]);
  });

  it('captures links and elements inserted after start', () => {
    collector = createCollector();
    collector.start();

    const link = document.createElement('a');
    link.href = '#next';
    link.setAttribute('data-monitor', 'navigation.next');
    document.body.append(link);
    link.click();

    expect(process).toHaveBeenCalledExactlyOnceWith({
      category: 'element',
      type: 'element.click',
      source: 'auto',
      element: {
        identifier: 'navigation.next',
        path: ['navigation.next'],
        tagName: 'a',
      },
    });
  });

  it('ignores unidentified and excluded regions', () => {
    const plain = document.createElement('button');
    const ignored = document.createElement('section');
    ignored.setAttribute('data-monitor-ignore', '');
    const button = document.createElement('button');
    button.setAttribute('data-monitor', 'private.action');
    ignored.append(button);
    document.body.append(plain, ignored);
    collector = createCollector();
    collector.start();

    plain.click();
    button.click();

    expect(process).not.toHaveBeenCalled();
  });

  it('does not duplicate events across repeated starts and stops', () => {
    const button = document.createElement('button');
    button.setAttribute('data-monitor', 'action');
    document.body.append(button);
    collector = createCollector();

    collector.start();
    collector.start();
    button.click();
    collector.stop();
    button.click();
    collector.start();
    button.click();

    expect(process).toHaveBeenCalledTimes(2);
  });

  it('accepts synthetic clicks without reading field values', () => {
    const input = document.createElement('input');
    input.setAttribute('data-monitor', 'account.email');
    input.value = 'private@example.com';
    document.body.append(input);
    const valueRead = vi.spyOn(input, 'value', 'get');
    collector = createCollector();
    collector.start();

    input.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(process).toHaveBeenCalledTimes(1);
    expect(valueRead).not.toHaveBeenCalled();
    expect(JSON.stringify(process.mock.calls)).not.toContain(
      'private@example.com',
    );
  });

  it('uses a configured monitor attribute', () => {
    const button = document.createElement('button');
    button.setAttribute('data-action', 'custom.action');
    document.body.append(button);
    collector = createCollector('data-action');
    collector.start();

    button.click();

    expect(process.mock.calls[0]?.[0].element?.identifier).toBe(
      'custom.action',
    );
  });
});
