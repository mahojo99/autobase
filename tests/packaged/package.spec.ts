import { test, expect, _electron as electron } from '@playwright/test';
import { mkdirSync, mkdtempSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { Snapshot, Task } from '../../src/shared/contracts';
const executablePath = resolve('release/Relay-win32-x64/Relay.exe');
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

test('Packaged Windows app: SQLite, native SDK executable, live Codex, close/reopen persistence', async () => {
  mkdirSync(resolve('.cache/packaged-tests'), { recursive: true });
  const dataDir = mkdtempSync(resolve('.cache/packaged-tests/session-'));
  const app = await electron.launch({ executablePath, env: { ...env, RELAY_DATA_DIR: dataDir } });
  let page = await app.firstWindow();
  await expect(
    page.getByRole('heading', { name: 'Your workspace, in conversation.' }),
  ).toBeVisible();
  const versions = await app.evaluate(() => ({
    electron: process.versions.electron,
    node: process.versions.node,
    chrome: process.versions.chrome,
  }));
  const sdkNative = resolve(
    'release/Relay-win32-x64/resources/app.asar.unpacked/node_modules/@anthropic-ai/claude-agent-sdk-win32-x64/claude.exe',
  );
  expect(existsSync(sdkNative)).toBe(true);
  const sdkVersion = (
    await promisify(execFile)(sdkNative, ['--version'], { windowsHide: true, timeout: 15000 })
  ).stdout.trim();
  expect(sdkVersion).toContain('2.1.266');
  await expect
    .poll(async () =>
      page.evaluate(
        async () =>
          (await window.relay.invoke<Snapshot>('personal', { action: 'snapshot' })).engines.find(
            (e) => e.engine === 'codex',
          )?.state,
      ),
    )
    .toBe('ready');
  await page.evaluate(async () => {
    await window.relay.invoke('personal', {
      action: 'update_bot',
      botId: 'orchestrator',
      patch: { model: 'gpt-6-astra', effort: 'xhigh' },
    });
    (window as any).streamCount = 0;
    window.relay.subscribe((e) => {
      if (e.kind === 'delta') (window as any).streamCount++;
    });
  });
  await page
    .getByRole('textbox', { name: 'Message Relay' })
    .fill(
      'This is a bounded live packaged-app check. Compute 17 × 19 without external tools. Call relay_finish with the answer and the arithmetic as evidence, then give one short sentence.',
    );
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect
    .poll(
      async () =>
        page.evaluate(
          async () =>
            (await window.relay.invoke<Snapshot>('personal', { action: 'snapshot' })).tasks[0]
              ?.state,
        ),
      { timeout: 150000 },
    )
    .toBe('completed');
  expect(await page.evaluate(() => (window as any).streamCount)).toBeGreaterThan(0);
  const before = await page.evaluate(() =>
    window.relay.invoke<Snapshot>('personal', { action: 'snapshot' }),
  );
  expect(before.messages.some((m) => m.role === 'assistant' && m.text.includes('323'))).toBe(true);
  expect(before.runs[0].providerSession).toBeTruthy();
  const artifactPath = await page.evaluate(
    (id) => window.relay.invoke<string>('personal', { action: 'artifact_path', id }),
    before.artifacts[0].id,
  );
  expect(existsSync(artifactPath)).toBe(true);
  await page.screenshot({ path: 'docs/screenshots/06-packaged-live-codex.png' });
  await app.close();
  expect(existsSync(join(dataDir, 'personal/relay.sqlite'))).toBe(true);
  const restart = await electron.launch({
    executablePath,
    env: { ...env, RELAY_DATA_DIR: dataDir },
  });
  page = await restart.firstWindow();
  await expect(
    page.getByRole('heading', { name: 'Your workspace, in conversation.' }),
  ).toBeVisible();
  const after = await page.evaluate(() =>
    window.relay.invoke<Snapshot>('personal', { action: 'snapshot' }),
  );
  expect(after.tasks[0].state).toBe('completed');
  expect(after.runs[0].id).toBe(before.runs[0].id);
  expect(after.messages).toEqual(before.messages);
  await restart.close();
  writeFileSync(
    resolve('.cache/packaged-verification.json'),
    JSON.stringify(
      {
        versions,
        executablePath,
        dataDir,
        sdkNative,
        task: before.tasks[0],
        run: before.runs[0],
        artifactPath,
        restartPreserved: true,
        live: true,
      },
      null,
      2,
    ),
  );
});
