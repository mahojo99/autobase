import { z } from 'zod';
import { botPatch, scheduleSpec } from '../shared/contracts';

const str = (max = 10000) => z.string().min(1).max(max);
export const toolSchemas = {
  relay_list_bots: z.object({}).strict(),
  relay_create_bot: z
    .object({
      name: str(60),
      role: str(180),
      instructions: str(12000),
      persistent: z.boolean().default(true),
    })
    .strict(),
  relay_update_bot: z.object({ botId: str(100), patch: botPatch.omit({ scope: true }) }).strict(),
  relay_delegate: z
    .object({
      botId: str(100),
      objective: str(12000),
      criteria: str(4000),
      context: z.string().max(16000).default(''),
    })
    .strict(),
  relay_wait_children: z.object({}).strict(),
  relay_read_task: z.object({ taskId: str(100) }).strict(),
  relay_search_context: z.object({ query: z.string().max(500) }).strict(),
  relay_read_context: z.object({ id: str(100) }).strict(),
  relay_remember: z
    .object({ text: str(10000), sourceId: str(100), kind: z.enum(['fact', 'hypothesis']) })
    .strict(),
  relay_ask_user: z
    .object({
      question: str(4000),
      reason: str(2000),
      options: z.array(str(100)).max(5).default([]),
    })
    .strict(),
  relay_write_artifact: z.object({ name: str(120), content: str(1000000) }).strict(),
  relay_read_file: z.object({ path: str(500) }).strict(),
  relay_fetch_page: z.object({ url: z.url().max(2000) }).strict(),
  relay_schedule: z.object({ botId: str(100), objective: str(10000), spec: scheduleSpec }).strict(),
  relay_finish: z
    .object({
      status: z.enum(['success', 'blocked']),
      summary: str(12000),
      evidence: z.array(str(2000)).max(30),
      uncertainty: z.array(str(2000)).max(20),
      blockers: z.array(str(2000)).max(20),
    })
    .strict(),
};
export type ToolName = keyof typeof toolSchemas;
const descriptions: Record<ToolName, string> = {
  relay_list_bots:
    'List real persistent and temporary workspace bots with configuration and identity.',
  relay_create_bot:
    'Create an actual specialist. Persistent means reusable; false means one temporary helper. Inherits current engine and permission ceiling. Internal reversible setup needs no further approval.',
  relay_update_bot:
    'Edit a bot for future runs, or archive a specialist. Engine changes may use already-configured authentication. Cannot grant permissions, archive the orchestrator, or change an existing run snapshot.',
  relay_delegate:
    'Queue one bounded child assignment for another bot; returns its task ID immediately. Maximum one delegation level and two helpers. Use relay_wait_children before synthesis.',
  relay_wait_children:
    'Wait for this task’s children to settle, then receive actual structured outcomes. Failed or cancelled children must be acknowledged. This wait is visible and persisted.',
  relay_read_task: 'Read an authorized task, current status, outcomes, evidence and artifacts.',
  relay_search_context:
    'Search shared workspace history and memory. Results carry source IDs, dates and authority; hypotheses are not user decisions.',
  relay_read_context: 'Read one authorized non-excluded source record returned by search.',
  relay_remember:
    'Record an agent observation or hypothesis with an existing source. Cannot assert a user-confirmed decision.',
  relay_ask_user:
    'Ask for genuinely missing information and wait for the owner. Not needed for ordinary requested bot setup.',
  relay_write_artifact:
    'Create and register a real UTF-8 .md, .txt, .json, or .csv result in app-managed storage.',
  relay_read_file:
    'Read a bounded text file or list a directory within the owner-selected folder, if this task has file scope. Relative paths only. No secret or hidden files.',
  relay_fetch_page:
    'Retrieve a public HTTPS text page with provenance. Requires web scope or an exact one-time owner approval. No login, localhost, private network, or cross-origin redirect.',
  relay_schedule:
    'Create a local one-off, daily or weekday schedule. Use an IANA timezone. Requires the local runtime and computer to remain available. Missed occurrences coalesce.',
  relay_finish:
    'Report the actual outcome before your final response. Mark blocked if success criteria are unmet. Include evidence, limitations and child failures; never fabricate progress.',
};
export function definitions() {
  return (Object.keys(toolSchemas) as ToolName[]).map((name) => ({
    name,
    description: descriptions[name],
    schema: z.toJSONSchema(toolSchemas[name]) as Record<string, unknown>,
  }));
}
