import { createShoppingServer } from '../../scripts/serve-shopping.mjs';
import { expect, test } from '@playwright/test';
import type { Server } from 'node:http';
import type { Monitor } from '@/core/Monitor';

declare global {
  interface Window {
    demoMonitor: { start(): void; stop(): void; flush(): Promise<void> };
    demoMetrics: { actions: number; longestActionMs: number };
    listenerCounts: Map<string, number>;
  }
}

let server: Server;
let address: string;

test.beforeAll(async () => {
  server = createShoppingServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as { port: number }).port;
  address = `http://127.0.0.1:${port}`;
});

test.afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

test('delivers the shopping journey without form values or duplicates', async ({
  page,
}) => {
  await page.goto(address);
  await page.locator('#ignored').click();
  await page.locator('#products').click();
  await page.locator('#product span').click();
  await page.locator('#add span').click();
  await page.locator('#checkout').click();
  await page.locator('#note').fill('private-note');
  await page.locator('#note').blur();
  await page.locator('#password').fill('private-password');
  await page.locator('#order button').click();
  await page.evaluate(async () => window.demoMonitor.flush());

  const { events } = await (
    await page.request.get(`${address}/api/monitor/events`)
  ).json();
  const types = events.map((event: { type: string }) => event.type);
  const views = events.filter(
    (event: { type: string }) => event.type === 'page.view',
  );
  const paths = views.map(
    (event: { page: { path: string } }) => event.page.path,
  );
  const identifiers = events.flatMap(
    (event: { element?: { identifier: string } }) =>
      event.element ? [event.element.identifier] : [],
  );

  expect(paths).toEqual(['/', '/products', '/product', '/cart', '/checkout']);
  expect(
    views
      .slice(1)
      .map(
        (event: { page: { previousPath?: string } }) => event.page.previousPath,
      ),
  ).toEqual(paths.slice(0, -1));
  expect(identifiers).toEqual(
    expect.arrayContaining([
      'shop.products',
      'product.open',
      'cart.add',
      'checkout.open',
      'checkout.note',
      'checkout.submit',
    ]),
  );
  expect(
    new Set(events.map((event: { eventId: string }) => event.eventId)).size,
  ).toBe(events.length);
  expect(types.indexOf('cart.item_added')).toBeLessThan(
    types.indexOf('checkout.completed'),
  );

  expect(types).toContain('cart.item_added');
  expect(types).toContain('checkout.completed');
  expect(types).toContain('form.submit');
  expect(
    types.filter((type: string) => type === 'cart.item_added'),
  ).toHaveLength(1);
  expect(
    events.some(
      (event: { element?: { identifier: string } }) =>
        event.element?.identifier === 'shop.ignored',
    ),
  ).toBe(false);
  expect(JSON.stringify(events)).not.toContain('private-note');
  expect(JSON.stringify(events)).not.toContain('private-password');
  expect(await page.locator('h1').textContent()).toBe('Pedido recebido');
  expect(
    await page.evaluate(() => window.demoMetrics.longestActionMs),
  ).toBeLessThan(100);
});

test('keeps the application usable after monitor stop and restart', async ({
  page,
}) => {
  await page.goto(address);
  await page.evaluate(async () => window.demoMonitor.flush());
  const before = await (
    await page.request.get(`${address}/api/monitor/events`)
  ).json();
  await page.evaluate(() => window.demoMonitor.stop());
  await page.locator('#products').click();
  await page.locator('#product').click();
  await page.locator('#add').click();
  await expect(page.locator('h1')).toHaveText('Carrinho');
  expect(await page.evaluate(() => window.demoMetrics.actions)).toBe(3);

  await page.locator('#checkout').click();
  await page.locator('#note').fill('off-private-note');
  await page.locator('#order button').click();
  await expect(page.locator('h1')).toHaveText('Pedido recebido');
  const after = await (
    await page.request.get(`${address}/api/monitor/events`)
  ).json();
  expect(after.events).toHaveLength(before.events.length);

  await page.evaluate(() => window.demoMonitor.start());
  await page.locator('#home').click();
  await expect(page.locator('h1')).toHaveText('Início');
});

test('keeps listener volume stable across controlled instances', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const counts = new Map<string, number>();
    const add = EventTarget.prototype.addEventListener;
    const remove = EventTarget.prototype.removeEventListener;

    EventTarget.prototype.addEventListener = function (
      type,
      listener,
      options,
    ) {
      counts.set(type, (counts.get(type) ?? 0) + 1);
      return add.call(this, type, listener, options);
    };
    EventTarget.prototype.removeEventListener = function (
      type,
      listener,
      options,
    ) {
      counts.set(type, (counts.get(type) ?? 0) - 1);
      return remove.call(this, type, listener, options);
    };
    Object.assign(window, { listenerCounts: counts });
  });

  await page.goto(address);
  const initial = await page.evaluate(() =>
    [...window.listenerCounts.entries()].sort(),
  );

  await page.evaluate(() => {
    const MonitorConstructor = window.demoMonitor.constructor as typeof Monitor;
    const second = new MonitorConstructor({
      projectId: 'shopping-secondary',
      endpoint: '/api/monitor/events',
      collectionEnabled: true,
    });
    second.start();
    second.stop();
    window.demoMonitor.stop();
    window.demoMonitor.start();
  });

  expect(
    await page.evaluate(() => [...window.listenerCounts.entries()].sort()),
  ).toEqual(initial);
});
