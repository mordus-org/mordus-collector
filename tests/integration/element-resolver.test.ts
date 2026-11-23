import { afterEach, describe, expect, it, vi } from 'vitest';
import { ElementResolver } from '@/identification/ElementResolver';
import { createElementFixture } from '../fixtures/element-resolver';

const resolver = new ElementResolver();

function resolveClick(element: Element, useFallback = false) {
  let descriptor = null;

  document.addEventListener(
    'click',
    (event) => {
      if (useFallback) {
        Object.defineProperty(event, 'composedPath', { value: undefined });
      }

      descriptor = resolver.resolve(event);
    },
    { once: true },
  );

  element.dispatchEvent(
    new MouseEvent('click', { bubbles: true, composed: true }),
  );

  return descriptor;
}

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe('ElementResolver', () => {
  it('resolves an inner icon to its logical button', () => {
    createElementFixture();

    expect(resolveClick(document.querySelector('#icon')!)).toEqual({
      identifier: 'checkout.submit',
      path: ['checkout.submit'],
      tagName: 'button',
    });
  });

  it('distinguishes repeated identifiers by ancestor context', () => {
    createElementFixture();

    expect(resolveClick(document.querySelector('#first-product')!)).toEqual({
      identifier: 'add-to-cart',
      path: ['product:123', 'add-to-cart'],
      tagName: 'button',
    });
    expect(resolveClick(document.querySelector('#second-product')!)).toEqual({
      identifier: 'add-to-cart',
      path: ['product:456', 'add-to-cart'],
      tagName: 'button',
    });
  });

  it('resolves elements inserted after the resolver was created', () => {
    createElementFixture();

    const button = document.createElement('button');
    button.setAttribute('data-monitor', 'dynamic.action');
    document.querySelector('#dynamic-root')!.append(button);

    expect(resolveClick(button)).toEqual({
      identifier: 'dynamic.action',
      path: ['dynamic.action'],
      tagName: 'button',
    });
  });

  it('discards unidentified and ignored interactions', () => {
    createElementFixture();

    const unidentified = document.createElement('button');
    document.body.append(unidentified);

    expect(resolveClick(unidentified)).toBeNull();
    expect(resolveClick(document.querySelector('#ignored')!)).toBeNull();

    const selfIgnored = document.createElement('button');
    selfIgnored.setAttribute('data-monitor', 'self-ignored');
    selfIgnored.setAttribute('data-monitor-ignore', '');
    document.body.append(selfIgnored);

    expect(resolveClick(selfIgnored)).toBeNull();
  });

  it('uses an identified ancestor when a nested marker is empty', () => {
    const button = document.createElement('button');
    button.setAttribute('data-monitor', 'checkout.submit');
    const icon = document.createElement('span');
    icon.setAttribute('data-monitor', '   ');
    button.append(icon);
    document.body.append(button);

    expect(resolveClick(icon)).toEqual({
      identifier: 'checkout.submit',
      path: ['checkout.submit'],
      tagName: 'button',
    });
  });

  it('uses ancestor fallback when composedPath is unavailable', () => {
    createElementFixture();

    expect(resolveClick(document.querySelector('#icon')!, true)).toEqual({
      identifier: 'checkout.submit',
      path: ['checkout.submit'],
      tagName: 'button',
    });
  });

  it('resolves an eligible control in open Shadow DOM', () => {
    const host = document.createElement('div');
    host.setAttribute('data-monitor', 'widget');
    const shadow = host.attachShadow({ mode: 'open' });
    const button = document.createElement('button');
    button.setAttribute('data-monitor', 'submit');
    shadow.append(button);
    document.body.append(host);

    expect(resolveClick(button)).toEqual({
      identifier: 'submit',
      path: ['widget', 'submit'],
      tagName: 'button',
    });
  });

  it('does not read text, HTML, or input values', () => {
    const input = document.createElement('input');
    input.setAttribute('data-monitor', 'account.email');
    input.value = 'private@example.com';
    input.textContent = 'private text';
    document.body.append(input);

    const valueRead = vi.spyOn(input, 'value', 'get');
    const textRead = vi.spyOn(input, 'textContent', 'get');
    const htmlRead = vi.spyOn(input, 'innerHTML', 'get');
    const descriptor = resolveClick(input);

    expect(descriptor).toEqual({
      identifier: 'account.email',
      path: ['account.email'],
      tagName: 'input',
    });
    expect(valueRead).not.toHaveBeenCalled();
    expect(textRead).not.toHaveBeenCalled();
    expect(htmlRead).not.toHaveBeenCalled();
    expect(JSON.stringify(descriptor)).not.toContain('private@example.com');
  });
});
