import { afterEach, describe, expect, it, vi } from 'vitest';
import { FieldCollector } from '@/collectors/FieldCollector';
import { FormCollector } from '@/collectors/FormCollector';
import { createMonitor } from '@/index';
import type { RawMonitorEvent } from '@/types/events';

const process = vi.fn<(event: RawMonitorEvent) => void>();
const pipeline = { process };
let fieldCollector: FieldCollector | undefined;
let formCollector: FormCollector | undefined;

function dispatch(element: Element, type: string): void {
  element.dispatchEvent(new Event(type, { bubbles: true, cancelable: true }));
}

afterEach(() => {
  fieldCollector?.stop();
  formCollector?.stop();
  fieldCollector = undefined;
  formCollector = undefined;
  process.mockReset();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe('FieldCollector', () => {
  it('emits one change when typing is confirmed', () => {
    const input = document.createElement('input');
    input.setAttribute('data-monitor', 'profile.name');
    document.body.append(input);
    fieldCollector = new FieldCollector({ document, pipeline });
    fieldCollector.start();

    dispatch(input, 'input');
    dispatch(input, 'input');
    dispatch(input, 'input');
    expect(process).not.toHaveBeenCalled();

    dispatch(input, 'change');
    dispatch(input, 'focusout');

    expect(process).toHaveBeenCalledExactlyOnceWith({
      category: 'field',
      type: 'field.change',
      source: 'auto',
      element: {
        identifier: 'profile.name',
        path: ['profile.name'],
        tagName: 'input',
      },
    });
  });

  it('confirms a pending edit on focusout when change is absent', () => {
    const input = document.createElement('textarea');
    input.setAttribute('data-monitor', 'profile.note');
    document.body.append(input);
    fieldCollector = new FieldCollector({ document, pipeline });
    fieldCollector.start();

    dispatch(input, 'input');
    dispatch(input, 'focusout');
    dispatch(input, 'focusout');

    expect(process).toHaveBeenCalledOnce();
    expect(process.mock.calls[0]?.[0].type).toBe('field.change');
  });

  it('emits selection events for select, checkbox, and radio', () => {
    const select = document.createElement('select');
    const checkbox = document.createElement('input');
    const radio = document.createElement('input');
    checkbox.type = 'checkbox';
    radio.type = 'radio';
    select.setAttribute('data-monitor', 'choice.select');
    checkbox.setAttribute('data-monitor', 'choice.check');
    radio.setAttribute('data-monitor', 'choice.radio');
    document.body.append(select, checkbox, radio);
    fieldCollector = new FieldCollector({ document, pipeline });
    fieldCollector.start();

    dispatch(select, 'change');
    dispatch(checkbox, 'input');
    dispatch(checkbox, 'change');
    dispatch(radio, 'input');
    dispatch(radio, 'change');

    expect(process).toHaveBeenCalledTimes(3);
    expect(process.mock.calls.map(([event]) => event.type)).toEqual([
      'field.selection',
      'field.selection',
      'field.selection',
    ]);
  });

  it('excludes unmarked, ignored, password, token, and contenteditable fields', () => {
    const plain = document.createElement('input');
    const password = document.createElement('input');
    password.type = 'password';
    password.setAttribute('data-monitor', 'account.password');
    const token = document.createElement('input');
    token.name = 'access_token';
    token.setAttribute('data-monitor', 'account.access');
    const ignored = document.createElement('section');
    ignored.setAttribute('data-monitor-ignore', '');
    const ignoredField = document.createElement('input');
    ignoredField.setAttribute('data-monitor', 'ignored.field');
    ignored.append(ignoredField);
    const editable = document.createElement('div');
    editable.setAttribute('contenteditable', 'true');
    editable.setAttribute('data-monitor', 'editable');
    document.body.append(plain, password, token, ignored, editable);
    fieldCollector = new FieldCollector({ document, pipeline });
    fieldCollector.start();

    for (const field of [plain, password, token, ignoredField, editable]) {
      dispatch(field, 'input');
      dispatch(field, 'change');
      dispatch(field, 'focusout');
    }

    expect(process).not.toHaveBeenCalled();
  });

  it('does not read or emit a typed value and clears pending edits on stop', () => {
    const input = document.createElement('input');
    input.setAttribute('data-monitor', 'profile.email');
    input.value = 'private@example.com';
    document.body.append(input);
    const valueRead = vi.spyOn(input, 'value', 'get');
    fieldCollector = new FieldCollector({ document, pipeline });
    fieldCollector.start();

    dispatch(input, 'input');
    fieldCollector.stop();
    fieldCollector.start();
    dispatch(input, 'focusout');
    expect(process).not.toHaveBeenCalled();

    dispatch(input, 'change');
    expect(process).toHaveBeenCalledTimes(1);
    expect(valueRead).not.toHaveBeenCalled();
    expect(JSON.stringify(process.mock.calls)).not.toContain(
      'private@example.com',
    );
  });
});

describe('FormCollector', () => {
  it('emits submit and reset once from an identified form', () => {
    const form = document.createElement('form');
    form.setAttribute('data-monitor', 'profile.form');
    document.body.append(form);
    formCollector = new FormCollector({ document, pipeline });
    formCollector.start();

    dispatch(form, 'submit');
    dispatch(form, 'reset');

    expect(process).toHaveBeenCalledTimes(2);
    expect(process.mock.calls.map(([event]) => event.type)).toEqual([
      'form.submit',
      'form.reset',
    ]);
    expect(process.mock.calls[0]?.[0].element?.identifier).toBe('profile.form');
  });

  it('ignores unmarked and excluded forms, including after stop', () => {
    const plain = document.createElement('form');
    const ignored = document.createElement('section');
    ignored.setAttribute('data-monitor-ignore', '');
    const ignoredForm = document.createElement('form');
    ignoredForm.setAttribute('data-monitor', 'ignored.form');
    ignored.append(ignoredForm);
    const active = document.createElement('form');
    active.setAttribute('data-monitor', 'active.form');
    document.body.append(plain, ignored, active);
    formCollector = new FormCollector({ document, pipeline });
    formCollector.start();

    dispatch(plain, 'submit');
    dispatch(ignoredForm, 'submit');
    formCollector.stop();
    dispatch(active, 'submit');

    expect(process).not.toHaveBeenCalled();
  });
});

describe('default monitor registration', () => {
  it('respects capture options and collectionEnabled', () => {
    const input = document.createElement('input');
    input.setAttribute('data-monitor', 'profile.name');
    const form = document.createElement('form');
    form.setAttribute('data-monitor', 'profile.form');
    document.body.append(input, form);
    const emit = vi.fn();
    const transport = { emit, async flush() {} };
    const disabled = createMonitor(
      {
        projectId: 'test',
        endpoint: '/events',
        capture: { fields: true, forms: true },
      },
      { transport },
    );
    disabled.start();
    dispatch(input, 'change');
    dispatch(form, 'submit');
    expect(emit).not.toHaveBeenCalled();

    const monitor = createMonitor(
      {
        projectId: 'test',
        endpoint: '/events',
        collectionEnabled: true,
        capture: {
          clicks: false,
          fields: false,
          forms: false,
          navigation: false,
        },
      },
      { transport },
    );
    monitor.start();
    dispatch(input, 'change');
    dispatch(form, 'submit');
    monitor.stop();

    expect(emit).not.toHaveBeenCalled();
  });
});
