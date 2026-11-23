import { expect, test } from '@playwright/test';
import type { MonitorEvent } from '@/types/events';

declare global {
  interface Window {
    clickEvents: MonitorEvent[];
    clickMonitor: { stop(): void; notifyRoute(route?: string): void };
  }
}

test('captures one eligible click per action and stops cleanly', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByRole('status')).toContainText('Monitor criado');

  await page.getByRole('button', { name: 'Ação de exemplo' }).click();
  await page.getByTestId('inner-icon').click();
  await page.getByRole('link', { name: 'Link de exemplo' }).click();

  await page.evaluate(() => {
    const button = document.createElement('button');
    button.textContent = 'Ação dinâmica';
    button.setAttribute('data-monitor', 'example.dynamic');
    document.querySelector('#dynamic-root')?.append(button);
  });
  await page.getByRole('button', { name: 'Ação dinâmica' }).click();
  await page.getByRole('button', { name: 'Área ignorada' }).click();

  await page.getByRole('button', { name: 'Ação de exemplo' }).focus();
  await page.keyboard.press('Enter');

  const events = await page.evaluate(() =>
    window.clickEvents
      .filter((event) => event.type === 'element.click')
      .map((event) => ({
        type: event.type,
        identifier: event.element?.identifier,
      })),
  );

  expect(events).toEqual([
    { type: 'element.click', identifier: 'example.action' },
    { type: 'element.click', identifier: 'example.icon' },
    { type: 'element.click', identifier: 'example.link' },
    { type: 'element.click', identifier: 'example.dynamic' },
    { type: 'element.click', identifier: 'example.action' },
  ]);

  const countBeforeStop = await page.evaluate(() => window.clickEvents.length);
  await page.evaluate(() => window.clickMonitor.stop());
  await page.getByRole('button', { name: 'Ação de exemplo' }).click();

  expect(await page.evaluate(() => window.clickEvents.length)).toBe(
    countBeforeStop,
  );
});
