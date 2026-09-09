import { _electron as electron } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
mkdirSync(resolve('.cache/accessibility'), { recursive: true });
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({
  args: ['.'],
  env: { ...env, RELAY_DATA_DIR: mkdtempSync(resolve('.cache/accessibility/session-')) },
});
try {
  const page = await app.firstWindow();
  await page.getByRole('heading', { name: 'Optimus Prime' }).waitFor();
  const surfaces: { surface: string; violations: unknown[] }[] = [];
  const audit = async (surface: string) => {
    const result = await new AxeBuilder({ page })
      .setLegacyMode(true)
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    surfaces.push({ surface, violations: result.violations });
  };
  await audit('conversation');
  await page.getByRole('button', { name: 'Configure bot', exact: true }).click();
  await page.getByRole('dialog', { name: 'Configure bot' }).waitFor();
  await audit('bot configuration');
  await page.screenshot({ path: 'docs/screenshots/08-bot-configuration.png' });
  await page.getByRole('button', { name: 'Close configuration' }).click();
  await page.getByRole('button', { name: 'Toggle details pane' }).click();
  await page.locator('.details-pane').waitFor();
  await audit('conversation with details');
  for (const surface of ['Work', 'Shared context', 'Schedules', 'Manage bots', 'Settings']) {
    await page.getByRole('button', { name: surface, exact: true }).click();
    await page.locator('.page-title').waitFor();
    await audit(surface);
  }
  await page.screenshot({ path: 'docs/screenshots/07-settings.png' });
  writeFileSync(resolve('.cache/accessibility/audit.json'), JSON.stringify(surfaces, null, 2));
  console.log(
    JSON.stringify(
      surfaces.map((s) => ({ surface: s.surface, violations: s.violations.length })),
      null,
      2,
    ),
  );
  if (surfaces.some((s) => s.violations.length))
    throw new Error('Desktop accessibility violations; see .cache/accessibility/audit.json');
} finally {
  await app.close();
}
