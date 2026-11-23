import { expect, test } from '@playwright/test';
import type { Monitor } from '@/core/Monitor';

test('preserves the tab session across reload and separates new and opener tabs', async ({
  page,
  context,
}) => {
  await page.goto('/');
  await expect(page.getByRole('status')).toContainText('Monitor criado');
  const sessionId = await page.evaluate(
    () => window.monitorEvents[0]?.sessionId,
  );
  expect(sessionId).toBeTruthy();
  await page.reload();
  await expect(page.getByRole('status')).toContainText('Monitor criado');
  expect(await page.evaluate(() => window.monitorEvents[0]?.sessionId)).toBe(
    sessionId,
  );

  const independent = await context.newPage();
  await independent.goto('/');
  await expect(independent.getByRole('status')).toContainText('Monitor criado');
  expect(
    await independent.evaluate(() => window.monitorEvents[0]?.sessionId),
  ).not.toBe(sessionId);

  const popupPromise = page.waitForEvent('popup');
  await page.evaluate(() => window.open('/', '_blank'));
  const popup = await popupPromise;
  await expect(popup.getByRole('status')).toContainText('Monitor criado');
  const childId = await popup.evaluate(
    () => window.monitorEvents[0]?.sessionId,
  );
  expect(childId).not.toBe(sessionId);
  await popup.reload();
  await expect(popup.getByRole('status')).toContainText('Monitor criado');
  expect(await popup.evaluate(() => window.monitorEvents[0]?.sessionId)).toBe(
    childId,
  );
});

test('keeps identity in memory and removes it from future events', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByRole('status')).toContainText('Monitor criado');
  const result = await page.evaluate(() => {
    const monitor = window.clickMonitor as Monitor;
    monitor.identify('opaque-user-42');
    monitor.track('identity.present');
    monitor.resetIdentity();
    monitor.track('identity.cleared');
    return {
      events: window.monitorEvents.filter((event) =>
        event.type.startsWith('identity.'),
      ),
      storage: JSON.stringify(sessionStorage),
    };
  });
  expect(result.events.map((event) => event.userId)).toEqual([
    'opaque-user-42',
    undefined,
  ]);
  expect(result.storage).not.toContain('opaque-user-42');
});
