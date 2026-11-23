import { expect, test } from '@playwright/test';

test('loads the compiled SDK and creates a monitor without telemetry', async ({
  page,
}) => {
  const runtimeErrors: string[] = [];
  const telemetryRequests: string[] = [];

  page.on('pageerror', (error) => runtimeErrors.push(error.message));
  page.on('request', (request) => {
    if (
      request.resourceType() === 'fetch' ||
      request.resourceType() === 'xhr' ||
      request.resourceType() === 'ping'
    ) {
      telemetryRequests.push(request.url());
    }
  });

  await page.goto('/');
  await expect(page.getByRole('status')).toHaveText(
    'Monitor criado para vanilla-app — schema 1',
  );

  await page.getByLabel('Nome de exemplo').fill('private-example');
  await page.getByRole('button', { name: 'Ação de exemplo' }).click();
  await page.getByLabel('Nome de exemplo').blur();

  expect(runtimeErrors).toEqual([]);
  expect(telemetryRequests).toEqual([]);
});
