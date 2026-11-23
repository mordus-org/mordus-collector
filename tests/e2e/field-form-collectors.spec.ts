import { expect, test } from '@playwright/test';
import type { MonitorEvent } from '@/types/events';

declare global {
  interface Window {
    monitorEvents: MonitorEvent[];
  }
}

test('captures field confirmations and form actions without values', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByRole('status')).toContainText('Monitor criado');

  await page.getByLabel('Nome exibido').fill('Private Name');
  expect(
    await page.evaluate(
      () =>
        window.monitorEvents.filter((event) => event.category === 'field')
          .length,
    ),
  ).toBe(0);
  await page.getByLabel('Nome exibido').blur();
  await page.getByLabel('Plano').selectOption('pro');
  await page.getByLabel('Atualizações').check();
  await page.getByLabel('Contato por e-mail').check();
  await page.getByLabel('Senha').fill('private-password');
  await page.getByLabel('Token').fill('private-token');
  await page.getByRole('button', { name: 'Salvar perfil' }).click();
  await page.getByLabel('Nome exibido').focus();
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Limpar perfil' }).click();

  const events = await page.evaluate(() => window.monitorEvents);
  const fieldsAndForms = events.filter((event) =>
    ['field', 'form'].includes(event.category),
  );

  expect(
    fieldsAndForms.map((event) => ({
      type: event.type,
      identifier: event.element?.identifier,
    })),
  ).toEqual([
    { type: 'field.change', identifier: 'profile.name' },
    { type: 'field.selection', identifier: 'profile.plan' },
    { type: 'field.selection', identifier: 'profile.updates' },
    { type: 'field.selection', identifier: 'profile.contact-email' },
    { type: 'form.submit', identifier: 'profile.form' },
    { type: 'form.submit', identifier: 'profile.form' },
    { type: 'form.reset', identifier: 'profile.form' },
  ]);
  expect(JSON.stringify(events)).not.toMatch(
    /Private Name|private-password|private-token|"pro"/,
  );

  await page.evaluate(() => window.clickMonitor.stop());
  await page.getByLabel('Nome exibido').fill('After Stop');
  await page.getByLabel('Nome exibido').blur();
  expect(await page.evaluate(() => window.monitorEvents.length)).toBe(
    events.length,
  );
});
