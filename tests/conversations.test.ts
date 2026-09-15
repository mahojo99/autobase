import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { Runtime } from '../src/runtime/runtime';
import { conversationContext, workspaceContext } from '../src/runtime/context';
import { SPECIALIST_NAMES } from '../src/shared/branding';
import type { Bot, Outcome, Task } from '../src/shared/contracts';
import type { EngineAdapter, EngineInput, EngineResult } from '../src/runtime/engines/types';

mkdirSync(resolve('.cache/conversation-tests'), { recursive: true });
const dir = () => mkdtempSync(resolve('.cache/conversation-tests/session-'));
const result = (text: string): EngineResult => ({
  text,
  outcome: {
    status: 'success',
    summary: text,
    evidence: ['Runtime test fixture'],
    uncertainty: ['Simulated provider'],
    blockers: [],
    artifacts: [],
  } satisfies Outcome,
});
class Fixture implements EngineAdapter {
  version = 'Conversation test fixture';
  constructor(readonly handler: (input: EngineInput) => Promise<EngineResult>) {}
  async readiness() {
    return {
      engine: 'demo' as const,
      state: 'ready' as const,
      version: this.version,
      detail: 'Fixture',
      models: [],
    };
  }
  run(input: EngineInput) {
    return this.handler(input);
  }
}
async function waitFor(fn: () => boolean) {
  const deadline = Date.now() + 10000;
  while (!fn()) {
    if (Date.now() > deadline) throw new Error('Condition timed out');
    await delay(20);
  }
}
const create = (r: Runtime, role: string) =>
  r.command({ action: 'create_bot', role, instructions: '' }) as Promise<Bot>;
const send = (r: Runtime, bot: Bot, text: string) =>
  r.command({ action: 'send', botId: bot.id, text }) as Promise<Task>;
async function complete(r: Runtime, task: Task) {
  await waitFor(() =>
    ['completed', 'failed', 'cancelled'].includes(r.store.need<Task>('tasks', task.id).state),
  );
  assert.equal(
    r.store.need<Task>('tasks', task.id).state,
    'completed',
    r.store.need<Task>('tasks', task.id).error ?? '',
  );
}

test('Owner creates independent named bots without a provider turn, with durable separate conversations', async () => {
  let calls = 0;
  const fixture = new Fixture(async (input) => {
    calls++;
    if (input.run.snapshot.role === 'Writer')
      await input.ask('question', 'Audience?', 'Writing', 'Fixture', ['Engineer']);
    return result(`Finished ${input.run.snapshot.role}`);
  });
  const root = dir();
  const r = new Runtime(root, 'demo', undefined, undefined, { demo: fixture });
  try {
    await r.start();
    const writer = await create(r, 'Writer');
    const reviewer = await create(r, 'Reviewer');
    assert.equal(calls, 0);
    assert.ok([writer, reviewer].every((bot) => SPECIALIST_NAMES.includes(bot.name as any)));
    assert.notEqual(writer.name, reviewer.name);
    assert.equal(writer.temporary, false);
    assert.deepEqual(writer.scope, { files: false, web: false });
    await assert.rejects(
      r.command({ action: 'create_bot', role: 'API bot', instructions: '', engine: 'grok' }),
      /demo/i,
    );
    const first = await send(r, writer, 'Draft a brief');
    await waitFor(() => r.store.need<Task>('tasks', first.id).state === 'waiting_input');
    const second = await send(r, reviewer, 'Review independently');
    await complete(r, second);
    assert.equal(r.store.need<Task>('tasks', first.id).state, 'waiting_input');
    const decision = r.snapshot().decisions.find((d) => d.taskId === first.id)!;
    r.answer(decision.id, decision.fingerprint, 'Engineer');
    await complete(r, first);
    assert.equal(conversationContext(r.store, writer.id).messages.length, 2);
    assert.ok(conversationContext(r.store, writer.id).messages.every((m) => m.taskId === first.id));
  } finally {
    await r.stop();
  }
  const reopened = new Runtime(root, 'demo');
  try {
    assert.equal(reopened.snapshot().bots.length, 3);
    assert.equal(reopened.snapshot().messages.length, 4);
    assert.ok(reopened.snapshot().tasks.every((t) => t.state === 'completed'));
  } finally {
    await reopened.stop();
  }
});

test('Guiding a delegated bot expires approval, retains its task and parent, and rejects stale attempt callbacks', async () => {
  let oldInput: EngineInput | undefined;
  const fixture = new Fixture(async (input) => {
    if (input.run.snapshot.id === 'orchestrator') {
      const bot = (await input.callTool(
        'relay_create_bot',
        { role: 'Research', instructions: 'Read', persistent: false },
        'create',
      )) as Bot;
      await input.callTool(
        'relay_delegate',
        { botId: bot.id, objective: 'Research brief', criteria: 'Evidence' },
        'delegate',
      );
      const children = (await input.callTool('relay_wait_children', {}, 'wait')) as Task[];
      return result(children[0].outcome!.summary);
    }
    if (input.run.attempt === 1) {
      oldInput = input;
      await input.callTool(
        'relay_write_artifact',
        { name: 'partial.md', content: 'A retained partial finding' },
        'artifact',
      );
      input.onText('Partial research before guidance');
      await input.ask('approval', 'Read page', 'https://example.com', 'Fixture', [
        'Allow once',
        'Deny',
      ]);
      throw new Error('The original approval should never resume');
    }
    const handoff = JSON.parse(input.run.handoff);
    assert.equal(handoff.ownerGuidance.at(-1).text, 'Use only the supplied brief');
    assert.match(handoff.previousAttempt, /Partial research/);
    assert.match(JSON.stringify(handoff.previousActions), /partial.md/);
    assert.deepEqual(input.run.snapshot.scope, { files: false, web: false });
    await assert.rejects(
      oldInput!.callTool('relay_finish', result('forged').outcome!, 'late'),
      /authorized/,
    );
    await assert.rejects(
      oldInput!.ask('approval', 'Late', 'late', 'late', ['Allow']),
      /no longer active/,
    );
    oldInput!.onSession('stale-session');
    oldInput!.onText('stale answer');
    return result('Revised research used the supplied brief');
  });
  const r = new Runtime(dir(), 'demo', undefined, undefined, { demo: fixture });
  try {
    await r.start();
    const parent = await send(r, r.snapshot().bots[0], 'Delegate research');
    await waitFor(() => r.snapshot().decisions.some((d) => d.state === 'pending'));
    const child = r.children(parent.id)[0];
    const decision = r.snapshot().decisions[0];
    assert.equal(r.store.need<Bot>('bots', child.botId).temporary, true);
    await r.command({ action: 'guide', taskId: child.id, text: 'Use only the supplied brief' });
    assert.throws(() => r.answer(decision.id, decision.fingerprint, 'Allow once'), /stale/);
    await complete(r, parent);
    assert.equal(r.children(parent.id).length, 1);
    assert.equal(r.children(parent.id)[0].id, child.id);
    const runs = r.snapshot().runs.filter((run) => run.taskId === child.id);
    assert.deepEqual(
      runs.map((run) => run.state),
      ['interrupted', 'completed'],
    );
    assert.ok(runs.every((run) => run.providerSession !== 'stale-session'));
    assert.match(r.store.need<Task>('tasks', parent.id).outcome!.summary, /Revised research/);
    assert.equal(r.snapshot().messages.filter((m) => m.kind === 'guidance').length, 1);
    await assert.rejects(
      r.command({ action: 'guide', taskId: child.id, text: 'Too late' }),
      /finished/,
    );
  } finally {
    await r.stop();
  }
});

test('Guiding a waiting parent keeps existing helpers running and includes assigned work in the continuation', async () => {
  const fixture = new Fixture(async (input) => {
    if (input.run.snapshot.id !== 'orchestrator') {
      await input.ask('question', 'Proceed?', 'Helper', 'Fixture', ['Yes']);
      return result('Retained helper result');
    }
    if (input.run.attempt === 1) {
      const bot = (await input.callTool(
        'relay_create_bot',
        { role: 'Helper', instructions: 'Help' },
        'create',
      )) as Bot;
      await input.callTool(
        'relay_delegate',
        { botId: bot.id, objective: 'Existing assignment', criteria: 'Finish' },
        'delegate',
      );
    } else {
      const handoff = JSON.parse(input.run.handoff);
      assert.equal(handoff.assignedWork.length, 1);
      assert.equal(handoff.assignedWork[0].state, 'waiting_input');
      assert.equal(handoff.ownerGuidance[0].text, 'Summarize in one sentence');
    }
    const children = (await input.callTool('relay_wait_children', {}, 'wait')) as Task[];
    return result(children[0].outcome!.summary);
  });
  const r = new Runtime(dir(), 'demo', undefined, undefined, { demo: fixture });
  try {
    await r.start();
    const parent = await send(r, r.snapshot().bots[0], 'Delegate');
    await waitFor(() => r.snapshot().decisions.some((d) => d.state === 'pending'));
    const child = r.children(parent.id)[0];
    const childRun = r.store.latestRun(child.id)!.id;
    await r.command({ action: 'guide', taskId: parent.id, text: 'Summarize in one sentence' });
    await waitFor(() => r.store.latestRun(parent.id)?.attempt === 2);
    assert.equal(r.store.latestRun(child.id)!.id, childRun);
    const decision = r.snapshot().decisions.find((d) => d.taskId === child.id)!;
    assert.equal(decision.state, 'pending');
    r.answer(decision.id, decision.fingerprint, 'Yes');
    await complete(r, parent);
    assert.equal(r.snapshot().runs.filter((run) => run.taskId === child.id).length, 1);
  } finally {
    await r.stop();
  }
});

test('Cancellation during guidance wins over late provider output and prevents a new attempt', async () => {
  const fixture = new Fixture(async (input) => {
    await delay(150);
    input.onText('late');
    return result('late');
  });
  const r = new Runtime(dir(), 'demo', undefined, undefined, { demo: fixture });
  try {
    await r.start();
    const bot = await create(r, 'Writer');
    const task = await send(r, bot, 'Start');
    await r.command({ action: 'guide', taskId: task.id, text: 'Revise' });
    await r.command({ action: 'cancel', taskId: task.id });
    await delay(300);
    assert.equal(r.store.need<Task>('tasks', task.id).state, 'cancelled');
    assert.equal(r.snapshot().runs.length, 1);
    assert.equal(r.snapshot().messages.filter((m) => m.role === 'assistant').length, 0);
  } finally {
    await r.stop();
  }
});

test('Rapid guidance is retained while an attempt stops; it runs before separately queued work with valid large context', async () => {
  let running = 0;
  const order: string[] = [];
  const finalGuidance = 'x'.repeat(29970) + ' final-owner-instruction';
  const fixture = new Fixture(async (input) => {
    assert.equal(++running, 1, 'A bot must never run overlapping attempts');
    order.push(`${input.run.taskId}:${input.run.attempt}`);
    try {
      if (input.prompt.includes('CURRENT REQUEST\nOriginal task\n')) {
        if (input.run.attempt === 1) {
          try {
            await input.ask('question', 'Wait?', 'Original task', 'Fixture', ['Continue']);
          } finally {
            await delay(150);
          }
        }
        const handoff = JSON.parse(input.run.handoff);
        assert.equal(handoff.ownerGuidance.at(-1).text, finalGuidance);
        assert.equal(handoff.ownerGuidance.length, 2);
        return result('Continued original task');
      }
      return result('Separate queued task');
    } finally {
      running--;
    }
  });
  const r = new Runtime(dir(), 'demo', undefined, undefined, { demo: fixture });
  try {
    await r.start();
    const bot = await create(r, 'Writer');
    const first = await send(r, bot, 'Original task');
    await waitFor(() => r.snapshot().decisions.some((d) => d.state === 'pending'));
    const separate = await send(r, bot, 'Separate work');
    assert.equal(separate.state, 'queued');
    await r.command({ action: 'guide', taskId: first.id, text: 'First revision' });
    await r.command({ action: 'guide', taskId: first.id, text: finalGuidance });
    await complete(r, separate);
    await complete(r, first);
    assert.deepEqual(order, [`${first.id}:1`, `${first.id}:2`, `${separate.id}:1`]);
    assert.equal(r.snapshot().messages.filter((m) => m.kind === 'guidance').length, 2);
  } finally {
    await r.stop();
  }
});

test('Creating a bot on a different engine resets provider-specific model and effort without copying permissions', async () => {
  const r = new Runtime(dir(), 'personal');
  try {
    const base = r.store.need<Bot>('bots', 'orchestrator');
    r.store.saveBot({
      ...base,
      engine: 'codex',
      model: 'gpt-6-astra',
      effort: 'xhigh',
      scope: { files: true, web: true },
    });
    const bot = (await r.command({
      action: 'create_bot',
      role: 'Writer',
      instructions: '',
      engine: 'claude-code',
    })) as Bot;
    assert.equal(bot.model, '');
    assert.equal(bot.effort, 'medium');
    assert.deepEqual(bot.scope, { files: false, web: false });
  } finally {
    await r.stop();
  }
});

test('Optimus sees shared bot conversations and results, with retrieval respecting exclusions and workspace isolation', async () => {
  let writer: Bot;
  const fixture = new Fixture(async (input) => {
    if (input.run.snapshot.id !== 'orchestrator') return result('The codename is Bluebird.');
    const handoff = JSON.parse(input.run.handoff);
    assert.match(JSON.stringify(handoff.overview.recentConversations), /Bluebird/);
    assert.match(JSON.stringify(handoff.overview.recentWork), /The codename is Bluebird/);
    const conversation = (await input.callTool(
      'relay_read_conversation',
      { botId: writer.id },
      'read',
    )) as ReturnType<typeof conversationContext>;
    assert.ok(conversation.messages.some((m) => m.text.includes('Bluebird') && m.sourceId));
    assert.doesNotMatch(JSON.stringify(conversation), /excluded-marker|unindexed-marker/);
    await assert.rejects(
      input.callTool('relay_read_conversation', { botId: 'another-workspace-bot' }, 'foreign'),
      /not found|Missing/i,
    );
    return result('Workspace codename: Bluebird.');
  });
  const r = new Runtime(dir(), 'demo', undefined, undefined, { demo: fixture });
  try {
    await r.start();
    writer = await create(r, 'Writer');
    await complete(r, await send(r, writer, 'Our codename is Bluebird.'));
    const excluded = r.store.message(writer.id, 'user', 'excluded-marker');
    r.store.editContext(excluded.id, { excluded: true });
    await r.command({ action: 'settings', patch: { indexConversations: false } });
    r.store.message(writer.id, 'user', 'unindexed-marker');
    await r.command({ action: 'settings', patch: { indexConversations: true } });
    assert.doesNotMatch(
      JSON.stringify(workspaceContext(r.store)),
      /excluded-marker|unindexed-marker/,
    );
    await complete(r, await send(r, r.snapshot().bots[0], 'What is our codename?'));
  } finally {
    await r.stop();
  }
});
