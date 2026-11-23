import { expect, test } from '@playwright/test';
import type { MonitorEvent } from '@/types/events';
import type { Monitor } from '@/core/Monitor';

test('attempts a private event batch on pagehide through the default transport', async ({
  page,
}) => {
  const batches: MonitorEvent[][] = [];
  await page.route('**/api/transport', async (route) => {
    batches.push(route.request().postDataJSON().events as MonitorEvent[]);
    await route.fulfill({ status: 204 });
  });
  await page.goto('/');
  await expect(page.getByRole('status')).toContainText('Monitor criado');
  await page.evaluate(() => {
    const CreateMonitor = (window.clickMonitor as Monitor)
      .constructor as typeof Monitor;
    const monitor = new CreateMonitor({
      projectId: 'transport-browser',
      endpoint: '/api/transport',
      collectionEnabled: true,
      capture: {
        navigation: false,
        clicks: false,
        fields: false,
        forms: false,
        errors: false,
      },
      transport: { batchSize: 20, flushIntervalMs: 60000, maxQueueSize: 100 },
    });
    monitor.start();
    Object.assign(window, { transportTestMonitor: monitor });
    monitor.track('transport.ready', {
      source: 'checkout',
      password: 'private-password',
    });
    window.dispatchEvent(new PageTransitionEvent('pagehide'));
  });
  await expect.poll(() => batches.length).toBe(1);
  await page.evaluate(async () => {
    const monitor = (window as unknown as { transportTestMonitor: Monitor })
      .transportTestMonitor;
    await monitor.flush();
    monitor.stop();
  });
  expect(batches[0]?.map((event) => event.type)).toEqual(['transport.ready']);
  expect(JSON.stringify(batches)).not.toContain('private-password');
});

test('discards revoked events before a later authorization flush', async ({
  page,
}) => {
  const batches: MonitorEvent[][] = [];
  await page.route('**/api/revocation', async (route) => {
    batches.push(route.request().postDataJSON().events as MonitorEvent[]);
    await route.fulfill({ status: 204 });
  });
  await page.goto('/');
  await expect(page.getByRole('status')).toContainText('Monitor criado');
  await page.evaluate(async () => {
    const CreateMonitor = (window.clickMonitor as Monitor)
      .constructor as typeof Monitor;
    const monitor = new CreateMonitor({
      projectId: 'revocation',
      endpoint: '/api/revocation',
      capture: { navigation: false },
      transport: { batchSize: 20, flushIntervalMs: 60000 },
    });
    monitor.start();
    monitor.track('before.authorization');
    monitor.setCollectionEnabled(true);
    monitor.start();
    monitor.track('revoked.pending');
    monitor.setCollectionEnabled(false);
    monitor.setCollectionEnabled(true);
    monitor.start();
    monitor.track('authorized.current');
    await monitor.flush();
    monitor.stop();
  });
  expect(batches.flat().map((event) => event.type)).toEqual([
    'authorized.current',
  ]);
});
