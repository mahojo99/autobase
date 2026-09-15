import { test, expect, _electron as electron } from '@playwright/test';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Bot, Snapshot } from '../../src/shared/contracts';

const executablePath = resolve('release/Autobase-win32-x64/Autobase.exe');
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

test('Packaged native subscriptions: direct bot conversations, guidance and Optimus shared recall', async () => {
  test.setTimeout(480000);
  mkdirSync(resolve('.cache/packaged-tests'), { recursive: true });
  const dataDir = mkdtempSync(resolve('.cache/packaged-tests/conversations-'));
  const app = await electron.launch({ executablePath, env: { ...env, RELAY_DATA_DIR: dataDir } });
  let before: Snapshot;
  try {
    const page = await app.firstWindow();
    await expect(page.getByRole('heading', { name: 'Optimus Prime' })).toBeVisible();
    await expect
      .poll(async () =>
        page.evaluate(
          async () =>
            (
              await window.relay.invoke<Snapshot>('personal', { action: 'snapshot' })
            ).engines.filter(
              (e) => ['codex', 'claude-code'].includes(e.engine) && e.state === 'ready',
            ).length,
        ),
      )
      .toBe(2);
    const bots: Bot[] = [];
    for (const [engine, marker] of [
      ['claude-code', 'Bluebird'],
      ['codex', 'Silverpine'],
    ] as const) {
      const bot = await page.evaluate(
        async (engine) =>
          window.relay.invoke<Bot>('personal', {
            action: 'create_bot',
            role: `${engine} writer`,
            instructions: 'Keep answers short. Use the runtime tools to record real outcomes.',
            engine,
          }),
        engine,
      );
      bots.push(bot);
      if (engine === 'codex')
        await page.evaluate(
          async (id) =>
            window.relay.invoke('personal', {
              action: 'update_bot',
              botId: id,
              patch: { model: 'gpt-6-astra', effort: 'medium' },
            }),
          bot.id,
        );
      await page.getByRole('button', { name: `${bot.name} ${bot.role}`, exact: true }).click();
      const composer = page.getByRole('textbox', { name: `Message ${bot.name}` });
      await composer.fill(
        `Bounded local integration check. My project codename is ${marker}. Call relay_ask_user now with question "Which format should I use?", reason "Waiting for the owner's guidance", and options ["One sentence", "Bullets"]. Wait for my answer before drafting. Do not delegate or access external sources. After answering, record the actual result with relay_finish.`,
      );
      await page.getByRole('button', { name: 'Send message', exact: true }).click();
      await expect(page.getByText('Which format should I use?', { exact: true })).toBeVisible({
        timeout: 120000,
      });
      const first = await page.evaluate(
        async (id) =>
          (await window.relay.invoke<Snapshot>('personal', { action: 'snapshot' })).tasks.find(
            (t) => t.botId === id,
          )!,
        bot.id,
      );
      await composer.fill(
        'Updated instructions: use one sentence that includes the project codename I gave you. Do not ask another question. Call relay_finish with success and the codename as evidence, then answer.',
      );
      await page.getByRole('button', { name: 'Send guidance', exact: true }).click();
      await expect
        .poll(
          async () =>
            page.evaluate(
              async (id) =>
                (
                  await window.relay.invoke<Snapshot>('personal', { action: 'snapshot' })
                ).tasks.find((t) => t.id === id)?.state,
              first.id,
            ),
          { timeout: 120000 },
        )
        .toBe('completed');
      const snapshot = await page.evaluate(() =>
        window.relay.invoke<Snapshot>('personal', { action: 'snapshot' }),
      );
      const runs = snapshot.runs.filter((r) => r.taskId === first.id);
      expect(runs.map((r) => r.state)).toEqual(['interrupted', 'completed']);
      expect(runs.every((r) => r.providerSession)).toBe(true);
      expect(runs[0].providerSession).not.toBe(runs[1].providerSession);
      expect(
        snapshot.decisions.filter((d) => d.taskId === first.id).every((d) => d.state === 'expired'),
      ).toBe(true);
      expect(snapshot.tasks.filter((t) => t.botId === bot.id)).toHaveLength(1);
      await expect(page.locator('.assistant-message .prose')).toContainText(marker);
      await page.screenshot({ path: `.cache/screenshots/12-packaged-${engine}-guidance.png` });
    }
    await page
      .getByRole('button', { name: 'Optimus Prime Your orchestrator', exact: true })
      .click();
    await page.evaluate(() =>
      window.relay.invoke('personal', {
        action: 'update_bot',
        botId: 'orchestrator',
        patch: { model: 'gpt-6-astra', effort: 'medium' },
      }),
    );
    await page
      .getByRole('textbox', { name: 'Message Optimus Prime' })
      .fill(
        `What project codename did I give ${bots[0].name}, and what codename did I give ${bots[1].name}? Use relay_read_conversation to verify both conversations and cite their message source IDs in relay_finish evidence. Answer briefly. No delegation or external access.`,
      );
    await page.getByRole('button', { name: 'Send message', exact: true }).click();
    await expect
      .poll(
        async () =>
          page.evaluate(
            async () =>
              (await window.relay.invoke<Snapshot>('personal', { action: 'snapshot' })).tasks.find(
                (t) => t.botId === 'orchestrator',
              )?.state,
          ),
        { timeout: 120000 },
      )
      .toBe('completed');
    before = await page.evaluate(() =>
      window.relay.invoke<Snapshot>('personal', { action: 'snapshot' }),
    );
    const task = before.tasks.find((t) => t.botId === 'orchestrator')!;
    expect(task.outcome!.summary).toContain('Bluebird');
    expect(task.outcome!.summary).toContain('Silverpine');
    expect(
      before.events.filter(
        (e) =>
          e.taskId === task.id &&
          e.kind === 'tool_result' &&
          e.text.startsWith('relay_read_conversation'),
      ).length,
    ).toBeGreaterThanOrEqual(2);
    expect(before.tasks).toHaveLength(3);
    await page.screenshot({ path: '.cache/screenshots/13-packaged-optimus-shared-recall.png' });
    writeFileSync(
      resolve('.cache/packaged-conversations-verification.json'),
      JSON.stringify(
        { verifiedAt: new Date().toISOString(), live: true, dataDir, snapshot: before },
        null,
        2,
      ),
    );
  } finally {
    await app.close();
  }
  const reopened = await electron.launch({
    executablePath,
    env: { ...env, RELAY_DATA_DIR: dataDir },
  });
  try {
    const page = await reopened.firstWindow();
    await expect(page.getByRole('heading', { name: 'Optimus Prime' })).toBeVisible();
    const after = await page.evaluate(() =>
      window.relay.invoke<Snapshot>('personal', { action: 'snapshot' }),
    );
    expect(after.bots).toEqual(before!.bots);
    expect(after.tasks).toEqual(before!.tasks);
    expect(after.messages).toEqual(before!.messages);
    expect(after.runs).toEqual(before!.runs);
  } finally {
    await reopened.close();
  }
});
