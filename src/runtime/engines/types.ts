import type { Outcome, Readiness, Run } from '../../shared/contracts';
export type ToolDefinition = { name: string; description: string; schema: Record<string, unknown> };
export type EngineInput = {
  cwd: string;
  prompt: string;
  instructions: string;
  run: Run;
  tools: ToolDefinition[];
  signal: AbortSignal;
  maxTurns: number;
  onText: (delta: string) => void;
  onActivity: (kind: string, text: string) => void;
  onSession: (id: string, model?: string) => void;
  onUsage: (usage: NonNullable<Run['usage']>) => void;
  callTool: (name: string, args: unknown, callId: string) => Promise<unknown>;
  ask: (
    kind: 'approval' | 'question',
    action: string,
    target: string,
    reason: string,
    options: string[],
  ) => Promise<string>;
};
export type EngineResult = { text: string; outcome?: Outcome };
export interface EngineAdapter {
  readonly version: string;
  readiness(): Promise<Readiness>;
  run(input: EngineInput): Promise<EngineResult>;
}
export function safeError(error: unknown): string {
  return (error instanceof Error ? error.message : String(error))
    .replace(/\b(sk-[A-Za-z0-9_-]+|Bearer\s+\S+)/gi, '[redacted]')
    .replace(/(api[_-]?key|authorization|token)["']?\s*[:=]\s*["']?[^\s,}\n]+/gi, '$1=[redacted]')
    .slice(0, 4000);
}
