import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { Runtime } from '../src/runtime/runtime';
import type { Bot, Decision, Outcome, Run, Task } from '../src/shared/contracts';
import type { EngineAdapter, EngineInput, EngineResult } from '../src/runtime/engines/types';

mkdirSync(resolve('.cache/runtime-tests'), { recursive: true });
const dir = () => mkdtempSync(resolve('.cache/runtime-tests/session-'));
const outcome = (text = 'Fixture result'): Outcome => ({
  status: 'success',
  summary: text,
  evidence: ['Supplied fixture input'],
  uncertainty: ['Simulated engine'],
  blockers: [],
  artifacts: [],
});
class Fixture implements EngineAdapter {
  version = 'test fixture';
  constructor(readonly handler: (input: EngineInput) => Promise<EngineResult>) {}
  async readiness() {
    return {
      engine: 'demo' as const,
      state: 'ready' as const,
      version: this.version,
      detail: 'Fixture only',
      models: [],
    };
  }
  run(input: EngineInput) {
    return this.handler(input);
  }
}
async function waitFor(fn: () => boolean, ms = 10000) {
  const until = Date.now() + ms;
  while (!fn()) {
    if (Date.now() > until) throw new Error('Condition timed out');
    await delay(30);
  }
}
async function settled(r: Runtime, id: string) {
  await waitFor(() =>
    ['completed', 'failed', 'cancelled', 'interrupted'].includes(
      r.store.need<Task>('tasks', id).state,
    ),
  );
  return r.store.need<Task>('tasks', id);
}

test('Offline demo performs durable two-helper delegation and synthesizes actual local outcomes', async () => {
  const root = dir();
  const r = new Runtime(root, 'demo');
  await r.start();
  const task = (await r.command({
    action: 'send',
    botId: 'orchestrator',
    text: 'Delegate a research comparison',
  })) as Task;
  assert.equal((await settled(r, task.id)).state, 'completed');
  assert.equal(r.children(task.id).length, 2);
  assert.ok(r.children(task.id).every((c) => c.state === 'completed'));
  assert.ok(r.snapshot().artifacts.some((a) => a.name === 'demo-comparison.md'));
  const botIds = r.snapshot().bots.map((b) => b.id);
  await r.stop();
  const reopened = new Runtime(root, 'demo');
  assert.deepEqual(
    reopened.snapshot().bots.map((b) => b.id),
    botIds,
  );
  assert.equal(reopened.snapshot().tasks.length, 3);
  await reopened.stop();
});
test('Permission ceiling, helper depth, guessed task identity and runtime-only authority', async () => {
  let helperChecked = false;
  const fixture = new Fixture(async (input) => {
    if (input.run.snapshot.id !== 'orchestrator') {
      assert.deepEqual(input.run.snapshot.scope, { files: false, web: false });
      await assert.rejects(
        input.callTool(
          'relay_delegate',
          { botId: 'orchestrator', objective: 'cycle', criteria: 'bad' },
          'nested',
        ),
        /Helpers/,
      );
      await assert.rejects(
        input.callTool(
          'relay_update_bot',
          { botId: 'orchestrator', patch: { role: 'evil' } },
          'update',
        ),
        /Helpers/,
      );
      helperChecked = true;
      return { text: 'Checked', outcome: outcome() };
    }
    await assert.rejects(
      input.callTool(
        'relay_delegate',
        { botId: 'orchestrator', objective: 'self', criteria: 'bad' },
        'self',
      ),
      /Self-delegation/,
    );
    const bot = (await input.callTool(
      'relay_create_bot',
      { name: 'Scoped helper', role: 'Read', instructions: 'Inspect' },
      'create',
    )) as Bot;
    await input.callTool(
      'relay_delegate',
      { botId: bot.id, objective: 'Bounded assignment', criteria: 'Check scope' },
      'delegate',
    );
    await input.callTool('relay_wait_children', {}, 'wait');
    return { text: 'Parent synthesized the checked outcome', outcome: outcome() };
  });
  const r = new Runtime(dir(), 'demo', undefined, undefined, { demo: fixture });
  await r.start();
  await assert.rejects(
    r.callTool('forged-task', 'relay_list_bots', {}, 'call'),
    /authorized execution/,
  );
  const task = (await r.command({
    action: 'send',
    botId: 'orchestrator',
    text: 'Check scoped delegation',
  })) as Task;
  assert.equal((await settled(r, task.id)).state, 'completed');
  assert.equal(helperChecked, true);
  await r.stop();
});
test('Failed helper produces explicit failed parent; retry preserves both attempts', async () => {
  const r = new Runtime(dir(), 'demo');
  await r.start();
  const parent = (await r.command({
    action: 'send',
    botId: 'orchestrator',
    text: 'Show helper failure and recovery',
  })) as Task;
  assert.equal((await settled(r, parent.id)).state, 'failed');
  const child = r.children(parent.id).find((t) => t.state === 'failed')!;
  assert.ok(child);
  await r.command({ action: 'retry', taskId: child.id });
  assert.equal((await settled(r, child.id)).state, 'completed');
  const attempts = r.snapshot().runs.filter((x) => x.taskId === child.id);
  assert.equal(attempts.length, 2);
  assert.equal(attempts[0].state, 'failed');
  assert.equal(attempts[1].state, 'completed');
  assert.equal(r.store.need<Task>('tasks', parent.id).state, 'failed');
  await r.stop();
});
test('Changed approvals are invalid, denial is first-class and the exact request survives snapshot reload', async () => {
  const r = new Runtime(dir(), 'demo');
  await r.start();
  const task = (await r.command({
    action: 'send',
    botId: 'orchestrator',
    text: 'Show an approval',
  })) as Task;
  await waitFor(() => r.snapshot().decisions.some((d) => d.state === 'pending'));
  const d = r.snapshot().decisions[0];
  assert.equal(((await r.command({ action: 'snapshot' })) as any).decisions[0].id, d.id);
  assert.throws(() => r.answer(d.id, '0'.repeat(64), 'Allow once'), /invalid/);
  const altered = { ...d, target: 'https://different.example.com' };
  r.store.saveDecision(altered);
  assert.throws(() => r.answer(d.id, d.fingerprint, 'Allow once'), /invalid/);
  r.store.saveDecision(d);
  assert.throws(() => r.answer(d.id, d.fingerprint, 'always'), /exact supported/);
  r.answer(d.id, d.fingerprint, 'Deny');
  assert.equal((await settled(r, task.id)).state, 'completed');
  assert.match(r.store.latestRun(task.id)!.text, /denied/);
  assert.throws(() => r.answer(d.id, d.fingerprint, 'Allow once'), /stale/);
  await r.stop();
});
test('Cancellation stops parent and descendants including a child waiting for approval', async () => {
  const fixture = new Fixture(async (input) => {
    if (input.run.snapshot.id !== 'orchestrator') {
      await input.ask('approval', 'Read page', 'https://example.com', 'Fixture', [
        'Allow once',
        'Deny',
      ]);
      return { text: 'late', outcome: outcome() };
    }
    const b = (await input.callTool(
      'relay_create_bot',
      { name: 'Helper', role: 'Reader', instructions: 'Read' },
      'b',
    )) as Bot;
    await input.callTool(
      'relay_delegate',
      { botId: b.id, objective: 'Needs approval', criteria: 'Read' },
      'd',
    );
    await input.callTool('relay_wait_children', {}, 'w');
    return { text: 'Parent', outcome: outcome() };
  });
  const r = new Runtime(dir(), 'demo', undefined, undefined, { demo: fixture });
  await r.start();
  const t = (await r.command({
    action: 'send',
    botId: 'orchestrator',
    text: 'Cancel tree',
  })) as Task;
  await waitFor(() => r.snapshot().decisions.some((d) => d.state === 'pending'));
  const d = r.snapshot().decisions[0];
  r.cancel(t.id);
  await waitFor(() => r.snapshot().runs.every((run) => run.endedAt !== null));
  assert.equal(r.store.need<Task>('tasks', t.id).state, 'cancelled');
  assert.ok(r.children(t.id).every((c) => c.state === 'cancelled'));
  assert.throws(() => r.answer(d.id, d.fingerprint, 'Allow once'), /stale/);
  await r.stop();
});
test('Late provider output cannot overwrite cancellation', async () => {
  const fixture = new Fixture(async (input) => {
    await delay(250);
    input.onText('late result');
    return { text: 'late result', outcome: outcome() };
  });
  const r = new Runtime(dir(), 'demo', undefined, undefined, { demo: fixture });
  await r.start();
  const t = (await r.command({
    action: 'send',
    botId: 'orchestrator',
    text: 'Cancel race',
  })) as Task;
  r.cancel(t.id);
  await delay(400);
  assert.equal(r.store.need<Task>('tasks', t.id).state, 'cancelled');
  assert.equal(r.snapshot().messages.filter((m) => m.role === 'assistant').length, 0);
  await r.stop();
});
test('Text-only provider completion without structured success is failed, not fabricated completion', async () => {
  const r = new Runtime(dir(), 'demo', undefined, undefined, {
    demo: new Fixture(async () => ({ text: 'I could not do it.' })),
  });
  await r.start();
  const t = (await r.command({ action: 'send', botId: 'orchestrator', text: 'Do work' })) as Task;
  assert.equal((await settled(r, t.id)).state, 'failed');
  assert.match(r.store.need<Task>('tasks', t.id).error!, /not confirmed/);
  await r.stop();
});
test('Engine switches create an explicit handoff, preserve conversation and cannot mix demo/live state', async () => {
  const r = new Runtime(dir(), 'demo');
  await r.start();
  await assert.rejects(
    r.command({ action: 'update_bot', botId: 'orchestrator', patch: { engine: 'codex' } }),
    /separate/,
  );
  const first = (await r.command({
    action: 'send',
    botId: 'orchestrator',
    text: 'Remember the brief',
  })) as Task;
  await settled(r, first.id);
  await r.command({
    action: 'update_bot',
    botId: 'orchestrator',
    patch: { model: 'another-fixture-model' },
  });
  const second = (await r.command({
    action: 'send',
    botId: 'orchestrator',
    text: 'Continue with that brief',
  })) as Task;
  await settled(r, second.id);
  const a = r.store.latestRun(first.id)!;
  const b = r.store.latestRun(second.id)!;
  assert.notEqual(a.providerSession, b.providerSession);
  assert.match(b.handoff, /Remember the brief/);
  assert.match(b.handoff, /new compatible provider session/);
  assert.equal(a.snapshot.model, '');
  assert.equal(b.snapshot.model, 'another-fixture-model');
  await r.stop();
});
