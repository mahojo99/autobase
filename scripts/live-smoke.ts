import { resolve } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import assert from 'node:assert/strict';
import { Runtime } from '../src/runtime/runtime';
import type { Bot, Task } from '../src/shared/contracts';
const dir = resolve('.cache/live-verification');
mkdirSync(dir, { recursive: true });
const runtime = new Runtime(dir, 'personal', (e) => {
  if (e.kind !== 'delta') return;
  process.stdout.write('.');
});
await runtime.start();
try {
  const readiness = runtime.snapshot().engines.find((e) => e.engine === 'codex');
  console.log(JSON.stringify(readiness));
  assert.equal(readiness?.state, 'ready');
  await runtime.command({
    action: 'update_bot',
    botId: 'orchestrator',
    patch: { model: 'gpt-6-astra', effort: 'xhigh' },
  });
  const task = (await runtime.command({
    action: 'send',
    botId: 'orchestrator',
    text: 'This is an authorized bounded live Relay integration check. Use relay_create_bot to create a persistent bot named Evidence Clerk whose role is checking supplied facts and whose instructions are to cite supplied sources. Do not use any other external tools or delegate yet. Use relay_finish to report success with the created bot ID as evidence, then answer in one sentence saying what you created.',
  })) as Task;
  const deadline = Date.now() + 300000;
  let latest = task;
  while (
    !['completed', 'failed', 'cancelled', 'interrupted'].includes(latest.state) &&
    Date.now() < deadline
  ) {
    await delay(500);
    latest = runtime.store.need<Task>('tasks', task.id);
  }
  const snap = runtime.snapshot();
  writeFileSync(
    resolve('.cache/live-first-result.json'),
    JSON.stringify(
      {
        task: latest,
        runs: snap.runs.filter((r) => r.taskId === task.id),
        events: snap.events.filter((e) => e.taskId === task.id),
        bots: snap.bots,
        readiness,
      },
      null,
      2,
    ),
  );
  console.log('\n' + JSON.stringify(latest, null, 2));
  assert.equal(latest.state, 'completed');
  assert.ok(snap.bots.some((b) => b.name === 'Evidence Clerk'));
  assert.ok(snap.runs.find((r) => r.taskId === task.id)?.providerSession);
  assert.ok(snap.events.some((e) => e.taskId === task.id && e.kind === 'bot_created'));
} finally {
  await runtime.stop();
}
const restarted = new Runtime(dir, 'personal');
assert.ok(restarted.store.all<Bot>('bots').some((b) => b.name === 'Evidence Clerk'));
console.log(
  'LIVE PASS: real Codex response, dynamic bot creation, artifact, and restart persistence.',
);
await restarted.stop();
