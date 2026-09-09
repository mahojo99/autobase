import { resolve } from 'node:path';
import { writeFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import assert from 'node:assert/strict';
import { Runtime } from '../src/runtime/runtime';
import type { ContextRecord, Task } from '../src/shared/contracts';
const runtime = new Runtime(resolve('.cache/live-verification'), 'personal', (e) => {
  if (e.kind === 'delta') process.stdout.write('.');
});
await runtime.start();
try {
  await runtime.command({ action: 'settings', patch: { maxRunSeconds: 480 } });
  const memory = (await runtime.command({
    action: 'memory',
    kind: 'decision',
    text: 'Relay acceptance brief: keep the persistent orchestrator as the conversational entry point. Helpers return evidence and limitations. The owner chose local schedules that require the computer to stay awake.',
  })) as ContextRecord;
  const task = (await runtime.command({
    action: 'send',
    botId: 'orchestrator',
    text: `Bounded live orchestration check. Retrieve the owner decision about the Relay acceptance brief using relay_search_context and relay_read_context. List bots; use Evidence Clerk as a researcher, and create one persistent reviewer named Brief Reviewer. Delegate exactly two small assignments: Evidence Clerk should identify two benefits of this supplied decision; Brief Reviewer should identify one limitation. Each assignment must contain the retrieved decision text and source ID ${memory.id}, with no other file or web access. Use relay_wait_children, then synthesize their actual structured outcomes in at most 150 words with the source and child task IDs. Write a comparison.md artifact and relay_finish. Do not claim external research or send messages outside Relay.`,
  })) as Task;
  const deadline = Date.now() + 485000;
  let latest = task;
  while (
    !['completed', 'failed', 'cancelled', 'interrupted'].includes(latest.state) &&
    Date.now() < deadline
  ) {
    await delay(500);
    latest = runtime.store.need<Task>('tasks', task.id);
  }
  const snap = runtime.snapshot();
  const children = snap.tasks.filter((t) => t.parentId === task.id);
  const ids = [task.id, ...children.map((c) => c.id)];
  writeFileSync(
    resolve('.cache/live-delegation-result.json'),
    JSON.stringify(
      {
        task: latest,
        children,
        runs: snap.runs.filter((r) => ids.includes(r.taskId)),
        events: snap.events.filter((e) => e.taskId && ids.includes(e.taskId)),
        memory,
      },
      null,
      2,
    ),
  );
  console.log('\n' + JSON.stringify({ task: latest, children }, null, 2));
  assert.equal(latest.state, 'completed');
  assert.equal(children.length, 2);
  assert.ok(children.every((c) => c.state === 'completed'));
  assert.ok(
    snap.events.some((e) => e.taskId === task.id && e.text.startsWith('relay_search_context')),
  );
  assert.ok(
    snap.events.some((e) => e.taskId === task.id && e.text.startsWith('relay_read_context')),
  );
  assert.ok(snap.artifacts.some((a) => a.taskId === task.id && a.name === 'comparison.md'));
  console.log(
    'LIVE PASS: two real Codex helpers, scoped memory retrieval, parent synthesis and real artifact.',
  );
} finally {
  await runtime.stop();
}
