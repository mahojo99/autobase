import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, symlinkSync } from 'node:fs';
import { resolve, join } from 'node:path';
import type { Bot, ContextRecord, Decision, Run, Task, Schedule } from '../src/shared/contracts';
import { Store, now, digest } from '../src/runtime/store';
import { nextOccurrence, tickSchedules, addSchedule } from '../src/runtime/scheduler';
import {
  artifactPath,
  createArtifact,
  isWithin,
  publicAddress,
  readWorkspace,
} from '../src/runtime/files';
import { toolSchemas } from '../src/runtime/tools';
mkdirSync(resolve('.cache/unit-tests'), { recursive: true });
const dir = () => mkdtempSync(resolve('.cache/unit-tests/store-'));

test('SQLite migration, foreign keys, transactional claims and retained attempts across restart', () => {
  const root = dir();
  const a = new Store(root, 'demo');
  const b = new Store(root, 'demo');
  assert.equal(a.db.prepare('SELECT count(*) AS n FROM migrations').get()!.n, 1);
  const bot = a.need<Bot>('bots', 'orchestrator');
  const t = a.createTask(bot, 'One atomic assignment');
  const first = a.claim(t.id, 'fixture', 'handoff')!;
  assert.ok(first.run.id);
  assert.equal(b.claim(t.id, 'fixture', ''), null);
  assert.throws(() => a.transition(t.id, 'queued'), /Illegal/);
  a.transition(t.id, 'failed', 'transient fixture failure');
  a.transition(t.id, 'queued');
  const second = b.claim(t.id, 'fixture', 'retry handoff')!;
  assert.equal(second.run.attempt, 2);
  assert.notEqual(second.run.id, first.run.id);
  assert.equal(a.all<Run>('runs')[0].state, 'failed');
  assert.throws(
    () =>
      a.db
        .prepare('INSERT INTO tasks VALUES(?,?,?,?,?)')
        .run('bad', 'unknown-bot', null, 'queued', '{}'),
    /FOREIGN KEY/,
  );
  a.close();
  b.close();
  const reopened = new Store(root, 'demo');
  assert.equal(reopened.all('runs').length, 2);
  reopened.close();
});
test('Run configurations are frozen and archives preserve historical ownership', () => {
  const s = new Store(dir(), 'demo');
  const bot = s.need<Bot>('bots', 'orchestrator');
  const t = s.createTask(bot, 'Do a task');
  const run = s.claim(t.id, 'fixture', '')!.run;
  s.saveBot({ ...bot, name: 'Updated', instructions: 'New instructions', archived: true });
  assert.equal(s.need<Run>('runs', run.id).snapshot.name, 'Relay');
  assert.equal(s.need<Task>('tasks', t.id).botId, bot.id);
  assert.throws(() => s.createTask(s.need<Bot>('bots', bot.id), 'Another'), /archived/);
  s.close();
});
test('Receipts deduplicate mutations and reject altered arguments transactionally', () => {
  const s = new Store(dir(), 'demo');
  let count = 0;
  const call = () => s.receipt('call-1', { name: 'Bot' }, () => ({ created: ++count }));
  assert.deepEqual(call(), call());
  assert.equal(count, 1);
  assert.throws(
    () => s.receipt('call-1', { name: 'Different' }, () => ++count),
    /different arguments/,
  );
  assert.throws(
    () =>
      s.receipt('call-2', {}, () => {
        s.put('settings', 'rollback', { test: 1 });
        throw new Error('fail');
      }),
    /fail/,
  );
  assert.equal(s.get('settings', 'rollback'), undefined);
  s.close();
});
test('FTS retrieval carries provenance, scopes guessed IDs, excludes and deletes source content', () => {
  const a = new Store(dir(), 'personal');
  const b = new Store(dir(), 'demo');
  const m = a.message('orchestrator', 'user', 'The durable SQLite decision is important.');
  assert.equal(a.search('SQLite')[0].sourceId, m.id);
  assert.equal(a.search('SQLite')[0].authority, 'user');
  assert.throws(() => b.need('context', m.id), /this workspace/);
  assert.equal(b.search('SQLite').length, 0);
  a.editContext(m.id, { excluded: true });
  assert.equal(a.search('SQLite').length, 0);
  a.editContext(m.id, { excluded: false, text: 'Corrected: local storage.' });
  assert.equal(a.search('SQLite').length, 0);
  assert.equal(a.search('storage')[0].text, 'Corrected: local storage.');
  a.editContext(m.id, { delete: true });
  assert.equal(a.get('messages', m.id), undefined);
  assert.equal(a.search('storage').length, 0);
  assert.deepEqual(a.search('" OR (broken:* )'), []);
  a.close();
  b.close();
});
test('Recovery expires live decisions and does not replay uncertain execution or queued children', () => {
  const s = new Store(dir(), 'demo');
  const bot = s.need<Bot>('bots', 'orchestrator');
  const parent = s.createTask(bot, 'Parent');
  const run = s.claim(parent.id, 'fixture', '')!.run;
  const child = s.createTask(bot, 'Child', { parentId: parent.id, depth: 1 });
  const d: Decision = {
    id: 'd',
    taskId: parent.id,
    runId: run.id,
    kind: 'approval',
    action: 'read',
    target: 'https://example.com',
    reason: 'test',
    options: ['Allow once', 'Deny'],
    fingerprint: 'x',
    answer: null,
    state: 'pending',
    createdAt: now(),
    expiresAt: new Date(Date.now() + 10000).toISOString(),
  };
  s.saveDecision(d);
  s.transition(parent.id, 'waiting_approval');
  s.recover();
  assert.equal(s.need<Task>('tasks', parent.id).state, 'interrupted');
  assert.equal(s.need<Task>('tasks', child.id).state, 'cancelled');
  assert.equal(s.need<Decision>('decisions', d.id).state, 'expired');
  assert.equal(s.claim(parent.id, 'fixture', ''), null);
  s.close();
});
test('One-off schedules claim an occurrence exactly once', () => {
  const s = new Store(dir(), 'demo');
  const at = new Date(Date.now() + 60000);
  const schedule = addSchedule(s, 'orchestrator', 'One scheduled task', {
    kind: 'once',
    at: at.toISOString(),
    timezone: 'Europe/Oslo',
  });
  assert.equal(tickSchedules(s, new Date(at.getTime() + 1000)).length, 1);
  assert.equal(tickSchedules(s, new Date(at.getTime() + 2000)).length, 0);
  assert.equal(s.all('occurrences').length, 1);
  assert.equal(s.need<Schedule>('schedules', schedule.id).enabled, false);
  s.close();
});
test('Schedules coalesce downtime, skip overlap and retain future timezone intent', () => {
  const s = new Store(dir(), 'demo');
  const schedule: Schedule = {
    id: 's',
    botId: 'orchestrator',
    objective: 'Review changes',
    spec: { kind: 'weekdays', at: '09:00', timezone: 'Europe/Oslo' },
    nextAt: '2026-09-01T07:00:00.000Z',
    enabled: true,
    createdAt: now(),
    missed: 0,
  };
  s.put('schedules', 's', schedule);
  assert.equal(tickSchedules(s, new Date('2026-09-09T10:00:00Z')).length, 1);
  assert.equal(s.all('tasks').length, 1);
  assert.equal(s.need<Schedule>('schedules', 's').missed, 6);
  assert.equal(tickSchedules(s, new Date('2026-09-10T10:00:00Z')).length, 0);
  assert.equal(s.all('occurrences').length, 2);
  assert.match(s.all<any>('occurrences')[1].disposition, /previous run still active/);
  s.close();
});
test('DST gaps shift forward; repeated local times fire only once; weekdays skip weekends', () => {
  const spec = { kind: 'daily' as const, at: '02:30', timezone: 'Europe/Oslo' };
  assert.equal(nextOccurrence(spec, new Date('2026-03-28T23:00:00Z')), '2026-03-29T01:30:00.000Z');
  assert.equal(nextOccurrence(spec, new Date('2026-10-24T23:00:00Z')), '2026-10-25T00:30:00.000Z');
  assert.equal(nextOccurrence(spec, new Date('2026-10-25T00:30:00Z')), '2026-10-26T01:30:00.000Z');
  assert.equal(
    nextOccurrence({ ...spec, kind: 'weekdays', at: '09:00' }, new Date('2026-09-11T08:00:00Z')),
    '2026-09-14T07:00:00.000Z',
  );
  assert.throws(() => nextOccurrence({ ...spec, timezone: 'Made/Up' }, new Date()), /timezone/);
});
test('Artifacts are actual content-addressed files; traversal and changed content are rejected', async () => {
  const s = new Store(dir(), 'demo');
  const t = s.createTask(s.need('bots', 'orchestrator'), 'Artifact task');
  const r = s.claim(t.id, 'fixture', '')!.run;
  const a = await createArtifact(s, t.id, r.id, 'result.md', '# Actual result');
  const path = await artifactPath(s, a.id);
  assert.equal(readFileSync(path, 'utf8'), '# Actual result');
  await assert.rejects(createArtifact(s, t.id, r.id, '../escape.md', 'bad'), /filename/);
  await assert.rejects(createArtifact(s, t.id, r.id, 'unsafe.html', '<script>'), /filename/);
  writeFileSync(path, 'tampered');
  await assert.rejects(artifactPath(s, a.id), /changed on disk/);
  s.close();
});
test('Selected-folder reads reject traversal, secrets and escaping Windows junctions', async () => {
  const root = dir();
  const outside = dir();
  writeFileSync(join(root, 'brief.txt'), 'Allowed');
  writeFileSync(join(outside, 'private.txt'), 'Outside');
  assert.equal(((await readWorkspace(root, 'brief.txt')) as any).text, 'Allowed');
  await assert.rejects(readWorkspace(root, '../private.txt'), /relative/);
  await assert.rejects(readWorkspace(root, '.env'), /relative/);
  symlinkSync(outside, join(root, 'linked'), 'junction');
  await assert.rejects(readWorkspace(root, 'linked/private.txt'), /escapes/);
  assert.equal(isWithin(root, root + '-other'), false);
});
test('Public URL policy rejects private/local addresses and permits public IPv4', () => {
  for (const address of [
    '127.0.0.1',
    '10.2.3.4',
    '169.254.169.254',
    '172.16.0.1',
    '192.168.1.1',
    '100.64.0.1',
    '224.1.1.1',
    '::1',
    '::ffff:127.0.0.1',
  ])
    assert.equal(publicAddress(address), false, address);
  assert.equal(publicAddress('93.184.216.34'), true);
});
test('Tool schemas reject caller identity, permission elevation and self-approval fields', () => {
  assert.throws(() =>
    toolSchemas.relay_create_bot.parse({
      name: 'Bot',
      role: 'Reader',
      instructions: 'Read',
      botId: 'orchestrator',
    }),
  );
  assert.throws(() =>
    toolSchemas.relay_update_bot.parse({
      botId: 'b',
      patch: { scope: { web: true, files: true } },
    }),
  );
  assert.throws(() =>
    toolSchemas.relay_delegate.parse({
      botId: 'b',
      objective: 'task',
      criteria: 'success',
      approved: true,
    }),
  );
  assert.equal('relay_approve' in toolSchemas, false);
});
