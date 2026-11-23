import { expect, test } from '@playwright/test';

test('observes SPA transitions and restores history on stop', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.assign(window, { originalPushState: window.history.pushState });
  });
  await page.goto('/');
  await expect(page.getByRole('status')).toContainText('Monitor criado');
  await page.evaluate(() => {
    window.history.pushState(null, '', '/products?token=private');
    window.clickMonitor.notifyRoute('/products/:id');
    window.history.replaceState(null, '', '/checkout');
    window.history.pushState(null, '', '/complete');
  });
  await page.goBack();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.monitorEvents
            .filter((event) => event.type === 'page.view')
            .at(-1)?.page.path,
      ),
    )
    .toBe('/checkout');
  await page.goForward();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.monitorEvents
            .filter((event) => event.type === 'page.view')
            .at(-1)?.page.path,
      ),
    )
    .toBe('/complete');
  await page.evaluate(() => {
    window.location.hash = '/receipt?token=private';
  });
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.monitorEvents
            .filter((event) => event.type === 'page.view')
            .at(-1)?.page.path,
      ),
    )
    .toBe('/complete#/receipt');
  const pages = await page.evaluate(() =>
    window.monitorEvents
      .filter((event) => event.type === 'page.view')
      .map((event) => event.page),
  );
  expect(pages.map((context) => context.path)).toEqual([
    '/',
    '/products',
    '/checkout',
    '/complete',
    '/checkout',
    '/complete',
    '/complete#/receipt',
  ]);
  expect(pages.slice(1).map((context) => context.previousPath)).toEqual(
    pages.slice(0, -1).map((context) => context.path),
  );
  expect(JSON.stringify(pages)).not.toContain('private');
  expect(
    await page.evaluate(() => {
      window.clickMonitor.stop();
      return (
        window.history.pushState === Reflect.get(window, 'originalPushState')
      );
    }),
  ).toBe(true);
});
