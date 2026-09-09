import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { Runtime } from '../src/runtime/runtime';
import { RpcClient } from '../src/runtime/engines/rpc';
import { Store } from '../src/runtime/store';
import type { ContextRecord, Task, Schedule } from '../src/shared/contracts';
import type { EngineAdapter, EngineInput } from '../src/runtime/engines/types';
mkdirSync(resolve('.cache/boundary-tests'), { recursive: true });
const dir = () => mkdtempSync(resolve('.cache/boundary-tests/session-'));
async function waitFor(fn: () => boolean) {
  const until = Date.now() + 8000;
  while (!fn()) {
    if (Date.now() > until) throw new Error('Condition timeout');
    await delay(25);
  }
}
const ok = (text: string) => ({
  text,
  outcome: {
    status: 'success' as const,
    summary: text,
    evidence: ['fixture'],
    uncertainty: [],
    blockers: [],
    artifacts: [],
  },
});
function fixture(handler: (input: EngineInput) => Promise<ReturnType<typeof ok>>): EngineAdapter {
  return {
    version: 'fixture',
    readiness: async () => ({
      engine: 'demo',
      state: 'ready',
      version: 'fixture',
      detail: 'No provider calls',
      models: [],
    }),
    run: handler,
  };
}

test('Folder grant is frozen per run when the owner changes the selected project', async () => {
  const first = dir(),
    second = dir();
  writeFileSync(join(first, 'brief.txt'), 'First folder');
  writeFileSync(join(second, 'brief.txt'), 'Second folder');
  let release!: () => void,
    started = false;
  const gate = new Promise<void>((r) => {
    release = r;
  });
  const r = new Runtime(dir(), 'demo', undefined, undefined, {
    demo: fixture(async (input) => {
      started = true;
      await gate;
      const file = (await input.callTool('relay_read_file', { path: 'brief.txt' }, 'read')) as {
        text: string;
      };
      assert.equal(file.text, 'First folder');
      return ok(file.text);
    }),
  });
  await r.start();
  r.setFolder(first);
  const t = (await r.command({
    action: 'send',
    botId: 'orchestrator',
    text: 'Read selected folder',
  })) as Task;
  await waitFor(() => started);
  r.setFolder(second);
  release();
  await waitFor(() => r.store.need<Task>('tasks', t.id).state === 'completed');
  assert.equal(r.store.latestRun(t.id)!.folder, first);
  await r.stop();
});
test('Deleting a result removes its files, source messages, derived retrieval and run content', async () => {
  const phrase = 'Unique deletion boundary phrase';
  const r = new Runtime(dir(), 'demo', undefined, undefined, {
    demo: fixture(async () => ok(phrase)),
  });
  await r.start();
  const t = (await r.command({
    action: 'send',
    botId: 'orchestrator',
    text: 'Produce the deletion fixture',
  })) as Task;
  await waitFor(() => r.store.need<Task>('tasks', t.id).state === 'completed');
  const artifact = r.snapshot().artifacts[0];
  const file = join(r.store.dir, 'artifacts', artifact.relativePath);
  assert.ok(existsSync(file));
  assert.ok(r.store.search(phrase).length > 0);
  const source = r.snapshot().memories.find((c) => c.kind === 'result' && c.sourceId === t.id)!;
  await r.command({ action: 'context_edit', id: source.id, delete: true });
  assert.equal(existsSync(file), false);
  assert.equal(r.store.search(phrase).length, 0);
  assert.equal(r.store.latestRun(t.id)!.text, '');
  assert.equal(r.snapshot().messages.length, 0);
  assert.equal(r.snapshot().artifacts.length, 0);
  await r.stop();
});
test('Known credentials are excluded from durable records, FTS, artifacts and messages', async () => {
  const r = new Runtime(dir(), 'demo');
  const secret = 'sk-ant-fixture-sensitive-string';
  await assert.rejects(
    r.command({ action: 'send', botId: 'orchestrator', text: `Use ${secret}` }),
    /credential was detected/,
  );
  await r.command({ action: 'memory', kind: 'fact', text: `Found ${secret}` });
  assert.doesNotMatch(JSON.stringify(r.snapshot()), /fixture-sensitive-string/);
  assert.equal(r.store.search('fixture-sensitive-string').length, 0);
  await r.stop();
});
test('Closing the owned protocol process leaves an unrelated process alive', async () => {
  const unrelated = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], {
    windowsHide: true,
    stdio: 'ignore',
  });
  const rpc = new RpcClient(process.execPath, ['-e', 'setInterval(()=>{},1000)'], dir());
  try {
    await delay(100);
    rpc.close();
    await waitFor(() => rpc.child.exitCode !== null || rpc.child.signalCode !== null);
    assert.equal(unrelated.exitCode, null);
    assert.equal(unrelated.signalCode, null);
    assert.ok(unrelated.pid);
    process.kill(unrelated.pid!, 0);
  } finally {
    unrelated.kill();
    rpc.close();
  }
});

test('Switching Codex to Claude preserves visible history but starts a distinct compatible session (fixtures)', async () => {
  const adapter = (name: 'codex' | 'claude'): EngineAdapter => ({
    version: `${name} fixture`,
    readiness: async () => ({
      engine: name,
      state: 'ready',
      version: 'fixture',
      detail: 'No provider calls',
      models: [],
    }),
    run: async (input) => {
      input.onSession(`${name}-${input.run.id}`, `${name}-fixture-model`);
      return ok(`${name} fixture answer`);
    },
  });
  const r = new Runtime(dir(), 'personal', undefined, undefined, {
    codex: adapter('codex'),
    claude: adapter('claude'),
  });
  await r.start();
  const first = (await r.command({
    action: 'send',
    botId: 'orchestrator',
    text: 'First engine request',
  })) as Task;
  await waitFor(() => r.store.need<Task>('tasks', first.id).state === 'completed');
  await r.command({
    action: 'update_bot',
    botId: 'orchestrator',
    patch: { engine: 'claude', model: 'configured-claude-model' },
  });
  const second = (await r.command({
    action: 'send',
    botId: 'orchestrator',
    text: 'Continue on second engine',
  })) as Task;
  await waitFor(() => r.store.need<Task>('tasks', second.id).state === 'completed');
  const a = r.store.latestRun(first.id)!,
    b = r.store.latestRun(second.id)!;
  assert.equal(a.snapshot.engine, 'codex');
  assert.equal(b.snapshot.engine, 'claude');
  assert.notEqual(a.providerSession, b.providerSession);
  assert.match(b.handoff, /codex fixture answer/);
  assert.equal(b.resolvedModel, 'claude-fixture-model');
  await r.stop();
});

test('Editing a schedule retains its durable identity and previous occurrence history', async () => {
  const r = new Runtime(dir(), 'demo');
  const original = (await r.command({
    action: 'schedule',
    botId: 'orchestrator',
    objective: 'Old objective',
    spec: { kind: 'daily', at: '09:00', timezone: 'Europe/Oslo' },
  })) as Schedule;
  const updated = (await r.command({
    action: 'schedule',
    id: original.id,
    botId: 'orchestrator',
    objective: 'Updated objective',
    spec: { kind: 'weekdays', at: '10:00', timezone: 'America/New_York' },
  })) as Schedule;
  assert.equal(updated.id, original.id);
  assert.equal(r.snapshot().schedules.length, 1);
  assert.equal(updated.spec.timezone, 'America/New_York');
  assert.notEqual(updated.nextAt, original.nextAt);
  await r.stop();
});

test('Conversational configuration can select an already-configured engine without escalating permissions', async () => {
  const codex: EngineAdapter = {
    version: 'codex fixture',
    readiness: async () => ({
      engine: 'codex',
      state: 'ready',
      version: 'fixture',
      detail: 'Fixture',
      models: [],
    }),
    run: async (input) => {
      await input.callTool(
        'relay_update_bot',
        { botId: 'orchestrator', patch: { engine: 'claude', model: 'claude-fixture' } },
        'configured-engine',
      );
      await assert.rejects(
        input.callTool(
          'relay_update_bot',
          { botId: 'orchestrator', patch: { archived: true } },
          'archive',
        ),
        /cannot be archived/,
      );
      return ok('Future configuration updated');
    },
  };
  const claude: EngineAdapter = {
    version: 'claude fixture',
    readiness: async () => ({
      engine: 'claude',
      state: 'installed',
      version: 'fixture',
      detail: 'Configured fixture',
      models: [],
    }),
    run: async () => ok('Not invoked'),
  };
  const r = new Runtime(dir(), 'personal', undefined, undefined, { codex, claude });
  await r.start();
  const t = (await r.command({
    action: 'send',
    botId: 'orchestrator',
    text: 'Use the configured second engine next time',
  })) as Task;
  await waitFor(() => r.store.need<Task>('tasks', t.id).state === 'completed');
  assert.equal(r.snapshot().bots[0].engine, 'claude');
  assert.equal(r.store.latestRun(t.id)!.snapshot.engine, 'codex');
  assert.deepEqual(r.snapshot().bots[0].scope, { files: false, web: false });
  await r.stop();
});
