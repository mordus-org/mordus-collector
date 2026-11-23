import { expect, test } from '@playwright/test';
import type { Monitor } from '@/core/Monitor';

test('captures manual events and browser failures without sensitive text', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByRole('status')).toContainText('Monitor criado');
  await page.evaluate(() => {
    const monitor = window.clickMonitor as Monitor;
    monitor.track('cart.item_added', {
      source: 'page',
      password: 'private-value',
    });
    setTimeout(() => {
      throw new TypeError('private-person@example.test');
    }, 0);
    void Promise.reject(new RangeError('private-value'));
  });
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.monitorEvents.filter((event) => event.category === 'error')
            .length,
      ),
    )
    .toBe(2);
  const events = await page.evaluate(() =>
    window.monitorEvents.filter(
      (event) => event.category === 'error' || event.category === 'custom',
    ),
  );
  expect(
    events.find((event) => event.type === 'cart.item_added')?.metadata,
  ).toEqual({ source: 'page' });
  expect(
    events
      .filter((event) => event.category === 'error')
      .map((event) => event.type)
      .sort(),
  ).toEqual(['error.javascript', 'error.unhandledrejection']);
  expect(JSON.stringify(events)).not.toContain('private');
  const beforeStop = events.length;
  await page.evaluate(() => {
    window.clickMonitor.stop();
    window.dispatchEvent(new ErrorEvent('error', { message: 'private-value' }));
  });
  expect(
    await page.evaluate(
      () =>
        window.monitorEvents.filter(
          (event) => event.category === 'error' || event.category === 'custom',
        ).length,
    ),
  ).toBe(beforeStop);
});
