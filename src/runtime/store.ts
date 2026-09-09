import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { redact } from './redaction';
import type {
  Artifact,
  Bot,
  ContextRecord,
  Decision,
  Message,
  Occurrence,
  Outcome,
  Run,
  Schedule,
  Settings,
  Task,
  TaskState,
  Workspace,
} from '../shared/contracts';

export const uid = (prefix: string) => `${prefix}_${randomUUID()}`;
export const now = () => new Date().toISOString();
export const digest = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
const json = (value: unknown) =>
  JSON.stringify(value, (_key, value) => (typeof value === 'string' ? redact(value) : value));
const active = ['running', 'waiting_input', 'waiting_approval', 'waiting_children'];
const legal: Record<TaskState, TaskState[]> = {
  queued: ['running', 'cancelled'],
  running: [
    'waiting_input',
    'waiting_approval',
    'waiting_children',
    'completed',
    'failed',
    'cancelled',
    'interrupted',
  ],
  waiting_input: ['running', 'cancelled', 'failed', 'interrupted'],
  waiting_approval: ['running', 'cancelled', 'failed', 'interrupted'],
  waiting_children: ['running', 'cancelled', 'failed', 'interrupted'],
  completed: [],
  failed: ['queued'],
  cancelled: ['queued'],
  interrupted: ['queued'],
};

export class Store {
  readonly db: DatabaseSync;
  private transactionDepth = 0;
  constructor(
    readonly dir: string,
    readonly workspace: Workspace,
  ) {
    mkdirSync(dir, { recursive: true });
    mkdirSync(join(dir, 'artifacts'), { recursive: true });
    mkdirSync(join(dir, 'work'), { recursive: true });
    this.db = new DatabaseSync(join(dir, 'relay.sqlite'));
    this.db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
    this.db
      .exec(`CREATE TABLE IF NOT EXISTS migrations(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS bots(id TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS conversations(id TEXT PRIMARY KEY, bot_id TEXT NOT NULL REFERENCES bots(id));
      CREATE TABLE IF NOT EXISTS tasks(id TEXT PRIMARY KEY, bot_id TEXT NOT NULL REFERENCES bots(id), parent_id TEXT REFERENCES tasks(id), state TEXT NOT NULL, data TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS tasks_queue ON tasks(state);
      CREATE TABLE IF NOT EXISTS runs(id TEXT PRIMARY KEY, task_id TEXT NOT NULL REFERENCES tasks(id), attempt INTEGER NOT NULL, data TEXT NOT NULL, UNIQUE(task_id,attempt));
      CREATE TABLE IF NOT EXISTS messages(id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL REFERENCES conversations(id), task_id TEXT REFERENCES tasks(id), data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS events(seq INTEGER PRIMARY KEY AUTOINCREMENT, task_id TEXT REFERENCES tasks(id), run_id TEXT REFERENCES runs(id), kind TEXT NOT NULL, text TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS decisions(id TEXT PRIMARY KEY, task_id TEXT NOT NULL REFERENCES tasks(id), run_id TEXT NOT NULL REFERENCES runs(id), data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS artifacts(id TEXT PRIMARY KEY, task_id TEXT NOT NULL REFERENCES tasks(id), run_id TEXT NOT NULL REFERENCES runs(id), data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS context(id TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE VIRTUAL TABLE IF NOT EXISTS context_fts USING fts5(id UNINDEXED,text,tokenize='unicode61');
      CREATE TABLE IF NOT EXISTS schedules(id TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS occurrences(id TEXT PRIMARY KEY, schedule_id TEXT NOT NULL REFERENCES schedules(id), task_id TEXT REFERENCES tasks(id), data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS receipts(id TEXT PRIMARY KEY, args_hash TEXT NOT NULL, result TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS settings(id TEXT PRIMARY KEY, data TEXT NOT NULL);
      INSERT OR IGNORE INTO migrations VALUES(1,datetime('now'));`);
    if (!this.get<Bot>('bots', 'orchestrator')) {
      this.saveBot({
        id: 'orchestrator',
        name: 'Relay',
        role: 'Workspace orchestrator',
        instructions:
          'Coordinate useful work with clear evidence. Create reusable bots when requested. Retrieve shared context before claiming past decisions. Delegate only bounded assignments and synthesize the actual outcomes. Be concise and candid.',
        engine: workspace === 'demo' ? 'demo' : 'codex',
        model: '',
        effort: 'medium',
        scope: { files: false, web: false },
        archived: false,
        temporary: false,
        createdAt: now(),
      });
    }
    if (!this.get<Settings>('settings', 'runtime'))
      this.put('settings', 'runtime', {
        concurrency: 2,
        maxHelpers: 2,
        maxRunSeconds: 300,
        maxToolCalls: 40,
        folder: null,
        indexConversations: true,
      });
  }
  transaction<T>(fn: () => T): T {
    const depth = this.transactionDepth++;
    const savepoint = `relay_${depth}`;
    this.db.exec(depth ? `SAVEPOINT ${savepoint}` : 'BEGIN IMMEDIATE');
    try {
      const result = fn();
      this.db.exec(depth ? `RELEASE ${savepoint}` : 'COMMIT');
      return result;
    } catch (e) {
      this.db.exec(depth ? `ROLLBACK TO ${savepoint}; RELEASE ${savepoint}` : 'ROLLBACK');
      throw e;
    } finally {
      this.transactionDepth--;
    }
  }
  get<T>(table: string, id: string): T | undefined {
    this.table(table);
    const row = this.db.prepare(`SELECT data FROM ${table} WHERE id=?`).get(id) as
      { data: string } | undefined;
    return row ? JSON.parse(row.data) : undefined;
  }
  need<T>(table: string, id: string): T {
    const row = this.get<T>(table, id);
    if (!row) throw new Error('Record not found in this workspace.');
    return row;
  }
  all<T>(table: string): T[] {
    this.table(table);
    return (
      this.db.prepare(`SELECT data FROM ${table} ORDER BY rowid`).all() as { data: string }[]
    ).map((r) => JSON.parse(r.data));
  }
  private table(table: string) {
    if (
      ![
        'bots',
        'tasks',
        'runs',
        'messages',
        'decisions',
        'artifacts',
        'context',
        'schedules',
        'occurrences',
        'settings',
      ].includes(table)
    )
      throw new Error('Invalid table');
  }
  put(table: string, id: string, data: unknown) {
    this.table(table);
    this.db
      .prepare(
        `INSERT INTO ${table}(id,data) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data`,
      )
      .run(id, json(data));
  }
  saveBot(bot: Bot) {
    this.put('bots', bot.id, bot);
    this.db
      .prepare('INSERT OR IGNORE INTO conversations(id,bot_id) VALUES(?,?)')
      .run(`conversation_${bot.id}`, bot.id);
  }
  settings() {
    return this.need<Settings>('settings', 'runtime');
  }
  message(
    botId: string,
    role: Message['role'],
    text: string,
    taskId: string | null = null,
  ): Message {
    this.need<Bot>('bots', botId);
    const m: Message = {
      id: uid('msg'),
      conversationId: `conversation_${botId}`,
      botId,
      role,
      text,
      taskId,
      createdAt: now(),
      indexed: this.settings().indexConversations,
    };
    this.db
      .prepare('INSERT INTO messages VALUES(?,?,?,?)')
      .run(m.id, m.conversationId, taskId, json(m));
    if (m.indexed)
      this.index({
        id: m.id,
        kind: 'message',
        text,
        sourceId: m.id,
        createdAt: m.createdAt,
        excluded: false,
        supersedes: null,
        authority: role === 'user' ? 'user' : 'agent',
      });
    return m;
  }
  createTask(
    bot: Bot,
    objective: string,
    options: Partial<
      Pick<Task, 'parentId' | 'criteria' | 'context' | 'depth' | 'scope' | 'scheduleId'>
    > = {},
  ): Task {
    if (bot.archived) throw new Error('This bot is archived. Restore it before assigning work.');
    const task: Task = {
      id: uid('task'),
      botId: bot.id,
      conversationId: `conversation_${bot.id}`,
      parentId: null,
      title: objective.slice(0, 100),
      objective,
      criteria: 'Answer the request with evidence and explicit limitations.',
      context: '',
      depth: 0,
      scope: bot.scope,
      state: 'queued',
      createdAt: now(),
      updatedAt: now(),
      outcome: null,
      error: null,
      scheduleId: null,
      ...options,
    };
    this.db
      .prepare('INSERT INTO tasks VALUES(?,?,?,?,?)')
      .run(task.id, task.botId, task.parentId, task.state, json(task));
    this.event(
      task.id,
      null,
      'queued',
      task.parentId ? 'Helper assignment queued.' : 'Request queued.',
    );
    return task;
  }
  saveTask(task: Task) {
    this.db
      .prepare('UPDATE tasks SET state=?,data=? WHERE id=?')
      .run(task.state, json(task), task.id);
  }
  transition(id: string, state: TaskState, error: string | null = null) {
    return this.transaction(() => this.transitionInTransaction(id, state, error));
  }
  private transitionInTransaction(id: string, state: TaskState, error: string | null) {
    const task = this.need<Task>('tasks', id);
    if (!legal[task.state].includes(state))
      throw new Error(`Illegal task transition: ${task.state} → ${state}`);
    task.state = state;
    task.updatedAt = now();
    task.error = error;
    this.saveTask(task);
    const run = this.latestRun(id);
    if (
      run &&
      state !== 'queued' &&
      !['completed', 'failed', 'cancelled', 'interrupted'].includes(run.state)
    ) {
      run.state = state;
      if (['completed', 'failed', 'cancelled', 'interrupted'].includes(state)) run.endedAt = now();
      this.saveRun(run);
    }
    this.event(id, run?.id ?? null, state, error ?? state.replaceAll('_', ' '));
    return task;
  }
  claim(id: string, adapterVersion: string, handoff: string): { task: Task; run: Run } | null {
    return this.transaction(() => {
      const task = this.need<Task>('tasks', id);
      if (task.state !== 'queued') return null;
      const bot = this.need<Bot>('bots', task.botId);
      const previous = this.latestRun(id);
      if (bot.archived) {
        this.transition(id, 'cancelled', 'Bot was archived before execution.');
        return null;
      }
      this.transition(id, 'running');
      const run: Run = {
        id: uid('run'),
        taskId: id,
        attempt: (previous?.attempt ?? 0) + 1,
        state: 'running',
        snapshot: structuredClone({ ...bot, scope: task.scope }),
        startedAt: now(),
        endedAt: null,
        providerSession: null,
        adapterVersion,
        text: '',
        usage: null,
        handoff,
        folder: task.scope.files ? this.settings().folder : null,
      };
      this.db.prepare('INSERT INTO runs VALUES(?,?,?,?)').run(run.id, id, run.attempt, json(run));
      this.event(
        id,
        run.id,
        'run_started',
        `${bot.engine} · ${bot.model || 'provider default'} · attempt ${run.attempt}. New provider session; scoped handoff attached.`,
      );
      return { task: this.need<Task>('tasks', id), run };
    });
  }
  latestRun(taskId: string): Run | undefined {
    const row = this.db
      .prepare('SELECT data FROM runs WHERE task_id=? ORDER BY attempt DESC LIMIT 1')
      .get(taskId) as { data: string } | undefined;
    return row ? JSON.parse(row.data) : undefined;
  }
  saveRun(run: Run) {
    this.db.prepare('UPDATE runs SET data=? WHERE id=?').run(json(run), run.id);
  }
  event(taskId: string | null, runId: string | null, kind: string, text: string) {
    const result = this.db
      .prepare('INSERT INTO events(task_id,run_id,kind,text,created_at) VALUES(?,?,?,?,?)')
      .run(taskId, runId, kind, redact(text).slice(0, 16000), now());
    this.db.prepare('DELETE FROM events WHERE seq < (SELECT MAX(seq)-10000 FROM events)').run();
    return Number(result.lastInsertRowid);
  }
  events() {
    return this.db
      .prepare(
        'SELECT seq,task_id AS taskId,run_id AS runId,kind,text,created_at AS createdAt FROM events ORDER BY seq DESC LIMIT 600',
      )
      .all()
      .reverse();
  }
  saveDecision(d: Decision) {
    this.db
      .prepare(
        'INSERT INTO decisions VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data',
      )
      .run(d.id, d.taskId, d.runId, json(d));
  }
  artifact(a: Artifact) {
    this.db.prepare('INSERT INTO artifacts VALUES(?,?,?,?)').run(a.id, a.taskId, a.runId, json(a));
  }
  occurrence(o: Occurrence) {
    this.db
      .prepare('INSERT INTO occurrences VALUES(?,?,?,?)')
      .run(o.id, o.scheduleId, o.taskId, json(o));
  }
  index(record: ContextRecord) {
    record = { ...record, text: redact(record.text) };
    this.put('context', record.id, record);
    this.db.prepare('DELETE FROM context_fts WHERE id=?').run(record.id);
    if (!record.excluded)
      this.db.prepare('INSERT INTO context_fts VALUES(?,?)').run(record.id, record.text);
  }
  search(query: string): ContextRecord[] {
    const words = query.match(/[\p{L}\p{N}_-]+/gu)?.slice(0, 12) ?? [];
    if (!words.length)
      return this.all<ContextRecord>('context')
        .filter((r) => !r.excluded)
        .slice(-20)
        .reverse();
    const rows = this.db
      .prepare(
        "SELECT id,snippet(context_fts,1,'[',']','…',32) AS snippet FROM context_fts WHERE context_fts MATCH ? ORDER BY rank LIMIT 20",
      )
      .all(words.map((w) => `"${w.replaceAll('"', '""')}"`).join(' OR ')) as {
      id: string;
      snippet: string;
    }[];
    return rows.map((r) => ({ ...this.need<ContextRecord>('context', r.id), snippet: r.snippet }));
  }
  editContext(id: string, patch: { text?: string; excluded?: boolean; delete?: boolean }) {
    const old = this.need<ContextRecord>('context', id);
    if (patch.delete) {
      // Derived context and the source message/result are removed together.
      for (const r of this.all<ContextRecord>('context').filter(
        (r) => r.id === id || r.sourceId === old.sourceId,
      )) {
        this.db.prepare('DELETE FROM context_fts WHERE id=?').run(r.id);
        this.db.prepare('DELETE FROM context WHERE id=?').run(r.id);
      }
      if (old.kind === 'message')
        this.db.prepare('DELETE FROM messages WHERE id=?').run(old.sourceId);
      if (old.kind === 'result') {
        const task = this.need<Task>('tasks', old.sourceId);
        task.outcome = null;
        task.objective = '[Deleted by owner]';
        task.title = '[Deleted by owner]';
        this.saveTask(task);
        for (const run of this.all<Run>('runs').filter((r) => r.taskId === task.id)) {
          run.text = '';
          run.handoff = '[Deleted by owner]';
          this.saveRun(run);
        }
      }
    } else {
      const updated = {
        ...old,
        ...patch,
        authority: patch.text !== undefined ? ('user' as const) : old.authority,
      };
      this.index(updated);
      if (old.kind === 'message') {
        const m = this.need<Message>('messages', id);
        m.text = updated.text;
        m.indexed = !updated.excluded;
        this.db.prepare('UPDATE messages SET data=? WHERE id=?').run(json(m), id);
      }
    }
  }
  receipt<T>(id: string, args: unknown, fn: () => T): T {
    return this.transaction(() => {
      const hash = digest(args);
      const existing = this.db
        .prepare('SELECT args_hash,result FROM receipts WHERE id=?')
        .get(id) as { args_hash: string; result: string } | undefined;
      if (existing) {
        if (existing.args_hash !== hash)
          throw new Error('Tool call ID was reused with different arguments.');
        return JSON.parse(existing.result);
      }
      const result = fn();
      this.db.prepare('INSERT INTO receipts VALUES(?,?,?)').run(id, hash, json(result));
      return result;
    });
  }
  recover() {
    return this.transaction(() => {
      const recovered: string[] = [];
      for (const task of this.all<Task>('tasks'))
        if (active.includes(task.state)) {
          this.transition(
            task.id,
            'interrupted',
            'Runtime stopped before completion. Inspect receipts and results, then retry explicitly.',
          );
          recovered.push(task.id);
        }
      for (const d of this.all<Decision>('decisions'))
        if (d.state === 'pending') {
          d.state = 'expired';
          this.saveDecision(d);
        }
      // Descendants of interrupted work are never silently started after relaunch.
      for (const task of this.all<Task>('tasks'))
        if (task.state === 'queued' && task.parentId && recovered.includes(task.parentId))
          this.transition(task.id, 'cancelled', 'Parent interrupted; explicit retry required.');
      return recovered;
    });
  }
  complete(taskId: string, outcome: Outcome) {
    const task = this.need<Task>('tasks', taskId);
    if (task.state !== 'running') return false;
    task.outcome = outcome;
    this.saveTask(task);
    this.transition(
      taskId,
      outcome.status === 'success' ? 'completed' : 'failed',
      outcome.status === 'blocked' ? outcome.blockers.join('\n') || outcome.summary : null,
    );
    this.index({
      id: uid('context'),
      kind: 'result',
      text: `${task.title}\n${outcome.summary}\n${outcome.evidence.join('\n')}\n${outcome.blockers.join('\n')}`,
      sourceId: task.id,
      createdAt: now(),
      excluded: false,
      supersedes: null,
      authority: 'agent',
    });
    return true;
  }
  close() {
    this.db.close();
  }
}
