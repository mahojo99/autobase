import { test, expect, _electron as electron } from '@playwright/test';
import { mkdirSync, mkdtempSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { Snapshot, Task } from '../../src/shared/contracts';
import { SPECIALIST_NAMES } from '../../src/shared/branding';
const executablePath = resolve('release/Autobase-win32-x64/Autobase.exe');
mkdirSync(resolve('.cache/screenshots'), { recursive: true });
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

test('Packaged Windows app: SQLite, native SDK executable, live Codex, close/reopen persistence', async () => {
  mkdirSync(resolve('.cache/packaged-tests'), { recursive: true });
  const dataDir = mkdtempSync(resolve('.cache/packaged-tests/session-'));
  const app = await electron.launch({ executablePath, env: { ...env, RELAY_DATA_DIR: dataDir } });
  let page = await app.firstWindow();
  await expect(page.getByRole('heading', { name: 'Optimus Prime' })).toBeVisible();
  const versions = await app.evaluate(() => ({
    electron: process.versions.electron,
    node: process.versions.node,
    chrome: process.versions.chrome,
  }));
  const sdkNative = resolve(
    'release/Autobase-win32-x64/resources/app.asar.unpacked/node_modules/@anthropic-ai/claude-agent-sdk-win32-x64/claude.exe',
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
    .getByRole('textbox', { name: 'Message Optimus Prime' })
    .fill(
      'This is a bounded live Autobase packaged-app check. Use relay_create_bot to create one persistent research bot named Bumblebee, with instructions to check supplied facts against evidence. Compute 17 × 19 without web or file access. Call relay_finish with the answer, arithmetic, and created bot ID as evidence, then give one short sentence. Do not delegate.',
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
  expect(before.bots.find((b) => b.id === 'orchestrator')?.name).toBe('Optimus Prime');
  expect(before.bots.some((b) => b.name === 'Bumblebee' && !b.temporary)).toBe(true);
  const artifactPath = await page.evaluate(
    (id) => window.relay.invoke<string>('personal', { action: 'artifact_path', id }),
    before.artifacts[0].id,
  );
  expect(existsSync(artifactPath)).toBe(true);
  await page.screenshot({ path: '.cache/screenshots/06-packaged-live-codex.png' });
  await app.close();
  expect(existsSync(join(dataDir, 'personal/relay.sqlite'))).toBe(true);
  const restart = await electron.launch({
    executablePath,
    env: { ...env, RELAY_DATA_DIR: dataDir },
  });
  page = await restart.firstWindow();
  await expect(page.getByRole('heading', { name: 'Optimus Prime' })).toBeVisible();
  const after = await page.evaluate(() =>
    window.relay.invoke<Snapshot>('personal', { action: 'snapshot' }),
  );
  expect(after.tasks[0].state).toBe('completed');
  expect(after.runs[0].id).toBe(before.runs[0].id);
  expect(after.messages).toEqual(before.messages);
  expect(after.bots).toEqual(before.bots);
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

test('Packaged Claude subscription: automatic names, two real helpers, shared context and restart', async () => {
  test.setTimeout(360000);
  mkdirSync(resolve('.cache/packaged-tests'), { recursive: true });
  const dataDir = mkdtempSync(resolve('.cache/packaged-tests/claude-'));
  const app = await electron.launch({ executablePath, env: { ...env, RELAY_DATA_DIR: dataDir } });
  let before: Snapshot;
  try {
    const page = await app.firstWindow();
    await expect(page.getByRole('heading', { name: 'Optimus Prime' })).toBeVisible();
    await expect
      .poll(async () =>
        page.evaluate(
          async () =>
            (await window.relay.invoke<Snapshot>('personal', { action: 'snapshot' })).engines.find(
              (e) => e.engine === 'claude-code',
            )?.state,
        ),
      )
      .toBe('ready');
    await page.evaluate(async () => {
      await window.relay.invoke('personal', {
        action: 'update_bot',
        botId: 'orchestrator',
        patch: { engine: 'claude-code', model: '', effort: 'medium' },
      });
      await window.relay.invoke('personal', {
        action: 'memory',
        kind: 'decision',
        text: 'Autobase verification decision: names identify bots; roles are independently editable. Only Optimus Prime exists in a fresh workspace.',
      });
      await window.relay.invoke('personal', { action: 'settings', patch: { maxRunSeconds: 300 } });
    });
    await page
      .getByRole('textbox', { name: 'Message Optimus Prime' })
      .fill(
        'Authorized bounded live Claude subscription check. Retrieve the Autobase verification decision with relay_search_context and relay_read_context. Create exactly two persistent specialists, one fact checker and one reviewer. Omit their names so the runtime assigns unused Autobot names. Delegate exactly two small tasks: the fact checker computes 17 times 19; the reviewer checks that arithmetic and the supplied decision. Pass the retrieved decision and its source ID to each. No external tools or file reads. Wait for the real child results, synthesize under 100 words, save verification.md and call relay_finish with the actual bot IDs, child IDs and source ID as evidence.',
      );
    await page.getByRole('button', { name: 'Send message' }).click();
    await expect
      .poll(
        async () =>
          page.evaluate(
            async () =>
              (await window.relay.invoke<Snapshot>('personal', { action: 'snapshot' })).tasks.find(
                (t) => !t.parentId,
              )?.state,
          ),
        { timeout: 310000 },
      )
      .toBe('completed');
    before = await page.evaluate(() =>
      window.relay.invoke<Snapshot>('personal', { action: 'snapshot' }),
    );
    const helpers = before.bots.filter((b) => b.id !== 'orchestrator');
    expect(helpers).toHaveLength(2);
    expect(new Set(helpers.map((b) => b.name)).size).toBe(2);
    expect(helpers.every((b) => SPECIALIST_NAMES.includes(b.name as any) && !b.temporary)).toBe(
      true,
    );
    expect(before.tasks.filter((t) => t.parentId && t.state === 'completed')).toHaveLength(2);
    expect(
      before.runs.every(
        (r) => r.snapshot.engine === 'claude-code' && r.providerSession && r.resolvedModel,
      ),
    ).toBe(true);
    expect(before.runs.every((r) => r.usage?.costUsd === undefined)).toBe(true);
    expect(before.events.some((e) => e.text.startsWith('relay_read_context'))).toBe(true);
    expect(before.messages.some((m) => m.role === 'assistant' && m.text.includes('323'))).toBe(
      true,
    );
    expect(before.artifacts.some((a) => a.name === 'verification.md')).toBe(true);
    await page.screenshot({ path: '.cache/screenshots/09-packaged-live-claude.png' });
    writeFileSync(
      resolve('.cache/packaged-claude-verification.json'),
      JSON.stringify(
        {
          verifiedAt: new Date().toISOString(),
          live: true,
          dataDir,
          tasks: before.tasks,
          runs: before.runs,
          bots: before.bots,
          artifacts: before.artifacts,
          events: before.events,
        },
        null,
        2,
      ),
    );
  } finally {
    await app.close();
  }
  const restart = await electron.launch({
    executablePath,
    env: { ...env, RELAY_DATA_DIR: dataDir },
  });
  try {
    const page = await restart.firstWindow();
    await expect(page.getByRole('heading', { name: 'Optimus Prime' })).toBeVisible();
    const after = await page.evaluate(() =>
      window.relay.invoke<Snapshot>('personal', { action: 'snapshot' }),
    );
    expect(after.bots).toEqual(before!.bots);
    expect(after.tasks).toEqual(before!.tasks);
    expect(after.runs).toEqual(before!.runs);
  } finally {
    await restart.close();
  }
});
