import { z } from 'zod';

export type Workspace = 'personal' | 'demo';
export type Engine = 'codex' | 'claude-code' | 'claude' | 'grok' | 'gemini' | 'demo';
export type ApiProvider = 'claude' | 'grok' | 'gemini';
export const terminal = ['completed', 'failed', 'cancelled', 'interrupted'] as const;
export type TaskState =
  | 'queued'
  | 'running'
  | 'waiting_input'
  | 'waiting_approval'
  | 'waiting_children'
  | (typeof terminal)[number];
export type Scope = { files: boolean; web: boolean };
export type Bot = {
  id: string;
  name: string;
  role: string;
  instructions: string;
  engine: Engine;
  model: string;
  effort: string;
  scope: Scope;
  archived: boolean;
  temporary: boolean;
  createdAt: string;
};
export type Message = {
  id: string;
  conversationId: string;
  botId: string;
  taskId: string | null;
  role: 'user' | 'assistant' | 'system';
  text: string;
  createdAt: string;
  indexed: boolean;
};
export type Outcome = {
  status: 'success' | 'blocked';
  summary: string;
  evidence: string[];
  uncertainty: string[];
  blockers: string[];
  artifacts: string[];
};
export type Task = {
  id: string;
  botId: string;
  conversationId: string;
  parentId: string | null;
  title: string;
  objective: string;
  criteria: string;
  context: string;
  state: TaskState;
  depth: number;
  scope: Scope;
  createdAt: string;
  updatedAt: string;
  outcome: Outcome | null;
  error: string | null;
  scheduleId: string | null;
};
export type Run = {
  id: string;
  taskId: string;
  attempt: number;
  state: TaskState;
  snapshot: Bot;
  startedAt: string;
  endedAt: string | null;
  providerSession: string | null;
  resolvedModel?: string | null;
  adapterVersion: string;
  text: string;
  usage: { input: number; output: number; costUsd?: number } | null;
  handoff: string;
  folder: string | null;
};
export type Activity = {
  seq: number;
  taskId: string | null;
  runId: string | null;
  kind: string;
  text: string;
  createdAt: string;
};
export type Decision = {
  id: string;
  taskId: string;
  runId: string;
  kind: 'approval' | 'question';
  action: string;
  target: string;
  reason: string;
  fingerprint: string;
  options: string[];
  answer: string | null;
  state: 'pending' | 'answered' | 'expired';
  expiresAt: string;
  createdAt: string;
};
export type Artifact = {
  id: string;
  taskId: string;
  runId: string;
  name: string;
  relativePath: string;
  bytes: number;
  sha256: string;
  createdAt: string;
};
export type ContextRecord = {
  id: string;
  kind: 'decision' | 'preference' | 'fact' | 'hypothesis' | 'message' | 'result' | 'artifact';
  text: string;
  sourceId: string;
  createdAt: string;
  excluded: boolean;
  supersedes: string | null;
  authority: 'user' | 'agent' | 'observed';
  snippet?: string;
};
export const scheduleSpec = z
  .object({
    kind: z.enum(['once', 'daily', 'weekdays']),
    at: z.string().min(1).max(50),
    timezone: z.string().min(1).max(80),
  })
  .strict();
export type ScheduleSpec = z.infer<typeof scheduleSpec>;
export type Schedule = {
  id: string;
  botId: string;
  objective: string;
  spec: ScheduleSpec;
  nextAt: string | null;
  enabled: boolean;
  createdAt: string;
  missed: number;
};
export type Occurrence = {
  id: string;
  scheduleId: string;
  taskId: string | null;
  dueAt: string;
  firedAt: string;
  disposition: string;
};
export type Readiness = {
  engine: Engine;
  state: 'unavailable' | 'installed' | 'authentication_required' | 'ready' | 'error';
  detail: string;
  version: string;
  models: { id: string; name: string; default: boolean; efforts: string[] }[];
};
export type ComputerState = {
  state: 'unavailable' | 'stopped' | 'running' | 'error';
  detail: string;
  runtime: string | null;
  version: string | null;
};
export type Settings = {
  concurrency: number;
  maxHelpers: number;
  maxRunSeconds: number;
  maxToolCalls: number;
  folder: string | null;
  indexConversations: boolean;
};
export type Snapshot = {
  workspace: Workspace;
  dataPath: string;
  bots: Bot[];
  messages: Message[];
  tasks: Task[];
  runs: Run[];
  events: Activity[];
  decisions: Decision[];
  artifacts: Artifact[];
  memories: ContextRecord[];
  schedules: Schedule[];
  occurrences: Occurrence[];
  engines: Readiness[];
  settings: Settings;
  computer: ComputerState;
};
export type Push = {
  workspace: Workspace;
  kind: 'changed' | 'delta' | 'runtime_error';
  taskId?: string;
  runId?: string;
  text?: string;
  seq?: number;
};

const id = z.string().min(1).max(100);
const engine = z.enum(['codex', 'claude-code', 'claude', 'grok', 'gemini', 'demo']);
export const botPatch = z
  .object({
    name: z.string().min(1).max(60).optional(),
    role: z.string().min(1).max(180).optional(),
    instructions: z.string().max(12000).optional(),
    engine: engine.optional(),
    model: z
      .string()
      .max(100)
      .regex(/^[a-zA-Z0-9._:/-]*$/)
      .optional(),
    effort: z.enum(['low', 'medium', 'high', 'xhigh', 'max']).optional(),
    scope: z.object({ files: z.boolean(), web: z.boolean() }).strict().optional(),
    archived: z.boolean().optional(),
  })
  .strict();
export const commandSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('snapshot') }).strict(),
  z.object({ action: z.literal('readiness') }).strict(),
  z
    .object({ action: z.literal('send'), botId: id, text: z.string().trim().min(1).max(30000) })
    .strict(),
  z.object({ action: z.literal('cancel'), taskId: id }).strict(),
  z.object({ action: z.literal('retry'), taskId: id }).strict(),
  z.object({ action: z.literal('update_bot'), botId: id, patch: botPatch }).strict(),
  z
    .object({
      action: z.literal('decision'),
      decisionId: id,
      fingerprint: z.string().length(64),
      answer: z.string().min(1).max(8000),
    })
    .strict(),
  z.object({ action: z.literal('search'), query: z.string().max(500) }).strict(),
  z
    .object({
      action: z.literal('memory'),
      text: z.string().min(1).max(10000),
      kind: z.enum(['decision', 'preference', 'fact']),
      supersedes: id.optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal('context_edit'),
      id,
      text: z.string().max(30000).optional(),
      excluded: z.boolean().optional(),
      delete: z.boolean().optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal('schedule'),
      id: id.optional(),
      botId: id,
      objective: z.string().min(1).max(10000),
      spec: scheduleSpec,
    })
    .strict(),
  z.object({ action: z.literal('schedule_toggle'), id, enabled: z.boolean() }).strict(),
  z
    .object({
      action: z.literal('settings'),
      patch: z
        .object({
          concurrency: z.number().int().min(1).max(3).optional(),
          maxHelpers: z.number().int().min(0).max(2).optional(),
          maxRunSeconds: z.number().int().min(20).max(1800).optional(),
          maxToolCalls: z.number().int().min(4).max(100).optional(),
          indexConversations: z.boolean().optional(),
        })
        .strict(),
    })
    .strict(),
  z.object({ action: z.literal('artifact_path'), id }).strict(),
  z.object({ action: z.literal('computer_probe') }).strict(),
]);
export type Command = z.infer<typeof commandSchema>;
export interface RelayBridge {
  invoke<T = unknown>(workspace: Workspace, command: Command): Promise<T>;
  subscribe(callback: (event: Push) => void): () => void;
  selectFolder(workspace: Workspace): Promise<string | null>;
  setClaudeKey(key: string): Promise<void>;
  setApiKey(provider: ApiProvider, key: string): Promise<void>;
  signIn(engine: 'codex' | 'claude-code'): Promise<void>;
  openArtifact(workspace: Workspace, id: string): Promise<void>;
  openExternal(url: string): Promise<void>;
}
declare global {
  interface Window {
    relay: RelayBridge;
  }
}
