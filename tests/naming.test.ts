import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { Runtime } from '../src/runtime/runtime';
import { SPECIALIST_NAMES } from '../src/shared/branding';
import type { Bot, Task } from '../src/shared/contracts';
import type { EngineAdapter } from '../src/runtime/engines/types';

test('Names are allocated once, independently of role, persist, and can be reused only after archival', async (t) => {
  mkdirSync(resolve('.cache/naming-tests'), { recursive: true });
  const dir = mkdtempSync(resolve('.cache/naming-tests/session-'));
  let created: Bot[] = [];
  const fixture: EngineAdapter = {
    version: 'fixture',
    readiness: async () => ({
      engine: 'demo',
      version: 'fixture',
      state: 'ready',
      detail: 'Offline',
      models: [],
    }),
    run: async (input) => {
      const args = {
        role: 'Same freely chosen role',
        instructions: 'Check supplied facts',
        persistent: true,
      };
      const first = (await input.callTool('relay_create_bot', args, 'first')) as Bot;
      assert.deepEqual(await input.callTool('relay_create_bot', args, 'first'), first);
      created.push(first);
      for (let i = 1; i < 5; i++)
        created.push((await input.callTool('relay_create_bot', args, `name-${i}`)) as Bot);
      assert.deepEqual(new Set(created.map((b) => b.name)), new Set(SPECIALIST_NAMES));
      assert.ok(created.every((b) => b.role === args.role));
      await assert.rejects(input.callTool('relay_create_bot', args, 'full'), /All five/);
      await input.callTool(
        'relay_update_bot',
        { botId: first.id, patch: { archived: true } },
        'archive',
      );
      const replacement = (await input.callTool('relay_create_bot', args, 'replacement')) as Bot;
      assert.equal(replacement.name, first.name);
      assert.notEqual(replacement.id, first.id);
      await assert.rejects(
        input.callTool(
          'relay_update_bot',
          { botId: first.id, patch: { archived: false } },
          'unarchive',
        ),
        /already belongs/,
      );
      await input.callTool(
        'relay_update_bot',
        { botId: replacement.id, patch: { role: 'A different role' } },
        'role',
      );
      created = [...created.slice(1), { ...replacement, role: 'A different role' }];
      return {
        text: 'Fixture complete',
        outcome: {
          status: 'success',
          summary: 'Allocated',
          evidence: [],
          uncertainty: [],
          blockers: [],
          artifacts: [],
        },
      };
    },
  };
  let stopped = false;
  const runtime = new Runtime(dir, 'demo', undefined, undefined, { demo: fixture });
  t.after(() => (stopped ? undefined : runtime.stop()));
  assert.deepEqual(
    runtime.snapshot().bots.map((b) => b.name),
    ['Optimus Prime'],
  );
  await runtime.start();
  const task = (await runtime.command({
    action: 'send',
    botId: 'orchestrator',
    text: 'Create specialists',
  })) as Task;
  const until = Date.now() + 6000;
  while (
    ['queued', 'running'].includes(runtime.store.need<Task>('tasks', task.id).state) &&
    Date.now() < until
  )
    await delay(20);
  const result = runtime.store.need<Task>('tasks', task.id);
  assert.equal(result.state, 'completed', result.error ?? 'Timed out');
  await assert.rejects(
    runtime.command({
      action: 'update_bot',
      botId: created[0].id,
      patch: { name: created[1].name },
    }),
    /already belongs/,
  );
  await assert.rejects(
    runtime.command({ action: 'update_bot', botId: 'orchestrator', patch: { name: 'Jazz' } }),
    /already belongs|orchestrator/,
  );
  await runtime.stop();
  stopped = true;
  const restarted = new Runtime(dir, 'demo');
  assert.deepEqual(
    restarted
      .snapshot()
      .bots.filter((b) => b.id !== 'orchestrator' && !b.archived)
      .map((b) => [b.id, b.name, b.role]),
    created.map((b) => [b.id, b.name, b.role]),
  );
  await restarted.stop();
});
