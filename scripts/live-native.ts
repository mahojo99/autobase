import { resolve } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import assert from 'node:assert/strict';
import { Runtime } from '../src/runtime/runtime';
import type { Bot, Engine, Task } from '../src/shared/contracts';
const engine = (process.argv[2] || 'claude-code') as Engine;
const dir = resolve(`.cache/live-${engine}-${Date.now()}`);
mkdirSync(dir, { recursive: true });
const runtime = new Runtime(dir, 'personal');
await runtime.start();
try {
  const readiness = runtime.snapshot().engines.find((e) => e.engine === engine);
  console.log(JSON.stringify(readiness));
  assert.ok(['ready', 'installed'].includes(readiness?.state ?? ''));
  await runtime.command({
    action: 'update_bot',
    botId: 'orchestrator',
    patch: { engine, model: '', effort: 'medium' },
  });
  const task = (await runtime.command({
    action: 'send',
    botId: 'orchestrator',
    text: 'Authorized bounded Autobase integration check. Use relay_create_bot to create a persistent bot named Bumblebee with role checking supplied facts. Compute 17 times 19 yourself. Save the result in a small markdown artifact using relay_write_artifact. Call relay_finish with success, the real created bot ID and artifact ID as evidence, then answer concisely. No delegation or external tools on this check.',
  })) as Task;
  const deadline = Date.now() + 240000;
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
    resolve(`.cache/live-${engine}-result.json`),
    JSON.stringify(
      {
        verifiedAt: new Date().toISOString(),
        engine,
        readiness,
        dir,
        task: latest,
        runs: snap.runs,
        events: snap.events,
        bots: snap.bots,
        artifacts: snap.artifacts,
      },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify({
      state: latest.state,
      error: latest.error,
      outcome: latest.outcome,
      runs: snap.runs.map((r) => ({ text: r.text, model: r.resolvedModel, usage: r.usage })),
    }),
  );
  assert.equal(latest.state, 'completed');
  assert.ok(snap.bots.some((b) => b.name === 'Bumblebee'));
  assert.ok(snap.artifacts.length);
  assert.match(snap.runs[0].text, /323/);
} finally {
  await runtime.stop();
}
const restarted = new Runtime(dir, 'personal');
assert.ok(restarted.store.all<Bot>('bots').some((b) => b.name === 'Bumblebee'));
await restarted.stop();
console.log(`LIVE PASS: ${engine}, actual bot creation, artifact, structured result, restart.`);
