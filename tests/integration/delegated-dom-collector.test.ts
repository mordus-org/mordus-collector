import { afterEach, describe, expect, it, vi } from 'vitest';
import { DelegatedDomCollector } from '@/collectors/DelegatedDomCollector';
import { ElementResolver } from '@/identification/ElementResolver';
import type { RawMonitorEvent } from '@/types/events';
import type { EventPipeline } from '@/types/pipeline';

const rawEvent: RawMonitorEvent = {
  category: 'element',
  type: 'element.click',
  source: 'auto',
};

function createCollector(
  resolve: (event: Event) => RawMonitorEvent | null = () => rawEvent,
) {
  const process = vi.fn();
  const collector = new DelegatedDomCollector({
    document,
    eventType: 'click',
    pipeline: { process },
    resolve,
  });

  return { collector, process };
}

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe('DelegatedDomCollector', () => {
  it('receives events from elements added after start', () => {
    const { collector, process } = createCollector();
    collector.start();

    const button = document.createElement('button');
    document.body.append(button);
    button.click();

    expect(process).toHaveBeenCalledExactlyOnceWith(rawEvent);
    collector.stop();
  });

  it('does not collect before start or after stop', () => {
    const { collector, process } = createCollector();
    const button = document.createElement('button');
    document.body.append(button);

    button.click();
    collector.start();
    button.click();
    collector.stop();
    button.click();

    expect(process).toHaveBeenCalledOnce();
  });

  it('does not duplicate listeners across repeated starts and restarts', () => {
    const addListener = vi.spyOn(document, 'addEventListener');
    const removeListener = vi.spyOn(document, 'removeEventListener');
    const { collector, process } = createCollector();
    const button = document.createElement('button');
    document.body.append(button);

    collector.start();
    collector.start();
    button.click();
    collector.stop();
    collector.stop();
    collector.start();
    button.click();
    collector.stop();

    expect(process).toHaveBeenCalledTimes(2);
    expect(addListener).toHaveBeenCalledTimes(2);
    expect(removeListener).toHaveBeenCalledTimes(2);
  });

  it('isolates resolver and pipeline failures from application handlers', () => {
    const button = document.createElement('button');
    document.body.append(button);
    const applicationHandler = vi.fn();
    button.addEventListener('click', applicationHandler);

    const resolverFailure = createCollector(() => {
      throw new Error('resolver failed');
    });
    resolverFailure.collector.start();
    button.click();
    resolverFailure.collector.stop();

    const pipeline: EventPipeline = {
      process: () => {
        throw new Error('pipeline failed');
      },
    };
    const pipelineFailure = new DelegatedDomCollector({
      document,
      eventType: 'click',
      pipeline,
      resolve: () => rawEvent,
    });
    pipelineFailure.start();
    button.click();
    pipelineFailure.stop();

    expect(applicationHandler).toHaveBeenCalledTimes(2);
  });

  it('passes only a safe descriptor from the resolver to the pipeline', () => {
    const input = document.createElement('input');
    input.setAttribute('data-monitor', 'account.email');
    input.value = 'private@example.com';
    document.body.append(input);

    const valueRead = vi.spyOn(input, 'value', 'get');
    const elementResolver = new ElementResolver();
    const { collector, process } = createCollector((event) => {
      const element = elementResolver.resolve(event);

      return element ? { ...rawEvent, element } : null;
    });
    collector.start();
    input.click();
    collector.stop();

    expect(process).toHaveBeenCalledExactlyOnceWith({
      ...rawEvent,
      element: {
        identifier: 'account.email',
        path: ['account.email'],
        tagName: 'input',
      },
    });
    expect(valueRead).not.toHaveBeenCalled();
    expect(JSON.stringify(process.mock.calls)).not.toContain(
      'private@example.com',
    );
  });
});
