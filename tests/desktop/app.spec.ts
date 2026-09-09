import { test, expect, _electron as electron } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { resolve, join } from 'node:path';
import type { Snapshot, Task } from '../../src/shared/contracts';
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
mkdirSync(resolve('.cache/desktop-tests'), { recursive: true });
mkdirSync(resolve('docs/screenshots'), { recursive: true });

test('Electron isolated renderer, live readiness, demo orchestration, approval, and persistence', async () => {
  const dataDir = mkdtempSync(resolve('.cache/desktop-tests/session-'));
  const app = await electron.launch({ args: ['.'], env: { ...env, RELAY_DATA_DIR: dataDir } });
  let page = await app.firstWindow();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await expect(page.getByRole('heading', { name: 'Optimus Prime' })).toBeVisible();
  expect(await page.evaluate(() => typeof (window as any).require)).toBe('undefined');
  expect(await page.evaluate(() => typeof (window as any).process)).toBe('undefined');
  const accessibility = await new AxeBuilder({ page })
    .setLegacyMode(true)
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(accessibility.violations).toEqual([]);
  await expect(page).toHaveTitle('Autobase');
  await expect(page.locator('.details-pane')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Toggle details pane' })).toHaveAttribute(
    'aria-expanded',
    'false',
  );
  await page.getByRole('button', { name: 'Toggle details pane' }).click();
  await expect(page.locator('.details-pane')).toBeVisible();
  await page.getByRole('button', { name: 'Hide details' }).click();
  await page.getByRole('button', { name: 'Hide sidebar' }).click();
  await expect(page.getByRole('complementary', { name: 'Bots and workspace' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Show sidebar' }).click();
  await expect(page.getByRole('complementary', { name: 'Bots and workspace' })).toBeVisible();
  await page
    .getByRole('complementary', { name: 'Bots and workspace' })
    .getByRole('button', { name: 'Create a bot', exact: true })
    .click();
  await expect(page.getByRole('textbox', { name: 'Message Optimus Prime' })).toBeFocused();
  await expect(page.getByRole('textbox', { name: 'Message Optimus Prime' })).toHaveValue(
    'Create a bot that ',
  );
  await page.getByRole('textbox', { name: 'Message Optimus Prime' }).fill('');
  await page.screenshot({ path: 'docs/screenshots/01-conversation.png' });
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByText('Claude Agent SDK 0.3.266', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Try offline demo', exact: true }).click();
  await page.getByRole('button', { name: 'Optimus Prime Your orchestrator', exact: true }).click();
  await expect(page.getByText('OFFLINE DEMO', { exact: true })).toBeVisible();
  await page
    .getByRole('textbox', { name: 'Message Optimus Prime' })
    .fill('Delegate a comparison to a researcher and reviewer');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(
    page.getByText('The research and review assignments are complete.', { exact: false }).first(),
  ).toBeVisible();
  await expect
    .poll(async () =>
      page.evaluate(async () => {
        const s = await window.relay.invoke<Snapshot>('demo', { action: 'snapshot' });
        return s.tasks.filter((t) => t.state === 'completed').length;
      }),
    )
    .toBe(3);
  await page.screenshot({ path: 'docs/screenshots/02-delegation-demo.png' });
  const helpers = page.locator('.helper-group');
  await expect(helpers).not.toHaveAttribute('open');
  await helpers.locator('summary').click();
  await helpers.getByRole('button').first().click();
  await expect(page.getByRole('dialog', { name: 'Task detail' })).toBeVisible();
  await page.getByRole('button', { name: 'Close task detail' }).click();
  await page.getByRole('button', { name: 'Bumblebee Research and evidence', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Bumblebee', exact: true })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Message Bumblebee' })).toBeVisible();
  await expect(page.locator('.welcome')).toHaveCount(0);
  await expect(page.locator('.transcript .task-card')).toHaveCount(1);
  await page.getByRole('button', { name: 'Optimus Prime Your orchestrator', exact: true }).click();
  await page.getByRole('textbox', { name: 'Message Optimus Prime' }).fill('Show an approval');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.getByRole('button', { name: 'Allow once', exact: true })).toBeVisible();
  await page.screenshot({ path: 'docs/screenshots/03-approval-demo.png' });
  await page.getByRole('button', { name: 'Deny', exact: true }).click();
  await expect(
    page.getByText('The request was denied. No page was read.', { exact: false }).first(),
  ).toBeVisible();
  const before = await page.evaluate(() =>
    window.relay.invoke<Snapshot>('demo', { action: 'snapshot' }),
  );
  expect(before.bots.some((b) => b.name === 'Bumblebee')).toBe(true);
  expect(before.bots.some((b) => b.name === 'Ratchet')).toBe(true);
  await app.close();
  const restarted = await electron.launch({
    args: ['.'],
    env: { ...env, RELAY_DATA_DIR: dataDir },
  });
  page = await restarted.firstWindow();
  await expect(page.getByRole('heading', { name: 'Optimus Prime' })).toBeVisible();
  const personal = await page.evaluate(() =>
    window.relay.invoke<Snapshot>('personal', { action: 'snapshot' }),
  );
  expect(personal.tasks).toHaveLength(0);
  expect(personal.bots.map((b) => b.name)).toEqual(['Optimus Prime']);
  const after = await page.evaluate(() =>
    window.relay.invoke<Snapshot>('demo', { action: 'snapshot' }),
  );
  expect(after.bots.map((b) => b.id)).toEqual(before.bots.map((b) => b.id));
  expect(after.tasks.map((t) => t.id)).toEqual(before.tasks.map((t) => t.id));
  expect(after.decisions.some((d) => d.answer === 'Deny')).toBe(true);
  await restarted.close();
  expect(errors).toEqual([]);
});

test('An actual Electron exit interrupts waiting work and expires its exact pending decision', async () => {
  const dataDir = mkdtempSync(resolve('.cache/desktop-tests/crash-'));
  const app = await electron.launch({ args: ['.'], env: { ...env, RELAY_DATA_DIR: dataDir } });
  let page = await app.firstWindow();
  await expect(page.getByRole('heading', { name: 'Optimus Prime' })).toBeVisible();
  await page.getByRole('button', { name: 'Try offline demo', exact: true }).click();
  await page.getByRole('textbox', { name: 'Message Optimus Prime' }).fill('Show an approval');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.getByRole('button', { name: 'Allow once' })).toBeVisible();
  const before = await page.evaluate(() =>
    window.relay.invoke<Snapshot>('demo', { action: 'snapshot' }),
  );
  await app.evaluate(({ app }) => app.exit(42)).catch(() => {});
  const restart = await electron.launch({ args: ['.'], env: { ...env, RELAY_DATA_DIR: dataDir } });
  page = await restart.firstWindow();
  await expect(page.getByRole('heading', { name: 'Optimus Prime' })).toBeVisible();
  const after = await page.evaluate(() =>
    window.relay.invoke<Snapshot>('demo', { action: 'snapshot' }),
  );
  expect(after.tasks[0].state).toBe('interrupted');
  expect(after.decisions[0].state).toBe('expired');
  expect(after.decisions[0].id).toBe(before.decisions[0].id);
  expect(after.runs).toHaveLength(1);
  await restart.close();
});

test('Desktop keyboard focus, IPC validation and encrypted credential round trip', async () => {
  const app = await electron.launch({
    args: ['.'],
    env: { ...env, RELAY_DATA_DIR: mkdtempSync(resolve('.cache/desktop-tests/security-')) },
  });
  const page = await app.firstWindow();
  await expect(page.getByRole('heading', { name: 'Optimus Prime' })).toBeVisible();
  await page.getByRole('button', { name: 'Configure bot', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Configure bot' });
  await expect(dialog).toBeVisible();
  await page.getByRole('button', { name: 'Save configuration' }).focus();
  await page.keyboard.press('Tab');
  expect(
    await page.evaluate(() =>
      document.querySelector('[role="dialog"]')!.contains(document.activeElement),
    ),
  ).toBe(true);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await page.keyboard.press('Control+k');
  await expect(page.getByRole('textbox', { name: 'Message Optimus Prime' })).toBeFocused();
  const rejection = await page.evaluate(async () => {
    try {
      await window.relay.invoke('personal', { action: 'shell', command: 'whoami' } as any);
      return false;
    } catch {
      return true;
    }
  });
  expect(rejection).toBe(true);
  for (const [provider, key] of [
    ['claude', 'sk-ant-fixture-only-api-key'],
    ['grok', 'xai-fixture-only-api-key'],
    ['gemini', 'AIzaFixtureOnlyApiKeyNotARealSecret'],
  ] as const) {
    await page.evaluate(
      async ({ provider, key }) => {
        await window.relay.setApiKey(provider, key);
        await window.relay.invoke('personal', { action: 'readiness' });
      },
      { provider, key },
    );
    const snapshot = await page.evaluate(() =>
      window.relay.invoke<Snapshot>('personal', { action: 'snapshot' }),
    );
    expect(snapshot.engines.find((e) => e.engine === provider)?.state).toBe('installed');
    expect(JSON.stringify(snapshot)).not.toContain(key);
    await page.evaluate((provider) => window.relay.setApiKey(provider, ''), provider);
  }
  expect(
    await page.evaluate(async () => {
      try {
        await window.relay.signIn('shell' as any);
        return false;
      } catch {
        return true;
      }
    }),
  ).toBe(true);
  const encrypted = await app.evaluate(({ safeStorage }) => {
    const bytes = safeStorage.encryptString('fixture-only-secret');
    return {
      available: safeStorage.isEncryptionAvailable(),
      recovered: safeStorage.decryptString(bytes),
      plaintextStored: bytes.includes(Buffer.from('fixture-only-secret')),
    };
  });
  expect(encrypted).toEqual({
    available: true,
    recovered: 'fixture-only-secret',
    plaintextStored: false,
  });
  await app.close();
});

test('Desktop context correction, schedule, failure/retry and smaller window', async () => {
  const app = await electron.launch({
    args: ['.'],
    env: { ...env, RELAY_DATA_DIR: mkdtempSync(resolve('.cache/desktop-tests/session-')) },
  });
  const page = await app.firstWindow();
  await expect(page.getByRole('heading', { name: 'Optimus Prime' })).toBeVisible();
  await page.getByRole('button', { name: 'Try offline demo', exact: true }).click();
  await page.getByRole('button', { name: 'Shared context', exact: true }).click();
  await page.getByLabel('Confirmed memory').fill('Keep the orchestrator as the entry point.');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(
    page.getByText('Keep the orchestrator as the entry point.', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Schedules', exact: true }).click();
  await page.getByLabel('What should happen?').fill('Summarize the demo brief');
  await page.getByRole('button', { name: 'Create local schedule' }).click();
  await expect(page.getByRole('heading', { name: 'Summarize the demo brief' })).toBeVisible();
  await page.getByRole('button', { name: 'Optimus Prime Your orchestrator', exact: true }).click();
  await page
    .getByRole('textbox', { name: 'Message Optimus Prime' })
    .fill('Demonstrate helper failure and recovery');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect
    .poll(async () =>
      page.evaluate(
        async () =>
          (await window.relay.invoke<Snapshot>('demo', { action: 'snapshot' })).tasks.filter(
            (t) => t.state === 'failed',
          ).length,
      ),
    )
    .toBe(2);
  const childId = await page.evaluate(
    async () =>
      (await window.relay.invoke<Snapshot>('demo', { action: 'snapshot' })).tasks.find(
        (t) => t.parentId && t.state === 'failed',
      )!.id,
  );
  await page.evaluate(
    (id) => window.relay.invoke('demo', { action: 'retry', taskId: id }),
    childId,
  );
  await expect
    .poll(async () =>
      page.evaluate(
        async (id) =>
          (await window.relay.invoke<Snapshot>('demo', { action: 'snapshot' })).tasks.find(
            (t) => t.id === id,
          )!.state,
        childId,
      ),
    )
    .toBe('completed');
  await page.getByRole('button', { name: 'Work', exact: true }).click();
  await page.screenshot({ path: 'docs/screenshots/04-recovery-demo.png' });
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1000, 740));
  await page.getByRole('button', { name: 'Optimus Prime Your orchestrator', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Message Optimus Prime' })).toBeVisible();
  await page.screenshot({ path: 'docs/screenshots/05-compact-demo.png' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await app.close();
});
