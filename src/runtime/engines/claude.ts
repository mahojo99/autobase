import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  query,
  tool,
  createSdkMcpServer,
  type Options,
  type SDKMessage,
} from '@anthropic-ai/claude-agent-sdk';
import type { Readiness } from '../../shared/contracts';
import { toolSchemas, type ToolName } from '../tools';
import type { EngineAdapter, EngineInput, EngineResult } from './types';
import { safeError } from './types';

export class ClaudeAdapter implements EngineAdapter {
  readonly version = 'Claude Agent SDK 0.3.266';
  constructor(
    readonly getKey: () => string | undefined,
    readonly queryFn = query,
  ) {}
  async readiness(): Promise<Readiness> {
    return {
      engine: 'claude',
      state: this.getKey() ? 'installed' : 'authentication_required',
      version: this.version,
      detail: this.getKey()
        ? 'API key configured. Select an explicit Claude model to run; API billing applies. Connection is verified on first task.'
        : 'Add your Anthropic API key in Settings. API billing applies. claude.ai subscription login is not offered.',
      models: [],
    };
  }
  options(input: EngineInput): Options {
    const key = this.getKey();
    if (!key)
      throw new Error('Anthropic API key required. Configure it in Settings; API billing applies.');
    if (!input.run.snapshot.model)
      throw new Error(
        'Enter an explicit Claude model ID in bot settings. No live model catalog has been verified.',
      );
    const controller = new AbortController();
    input.signal.addEventListener('abort', () => controller.abort(), { once: true });
    if (input.signal.aborted) controller.abort();
    const configDir = join(input.cwd, 'claude-config');
    mkdirSync(configDir, { recursive: true });
    const mcp = createSdkMcpServer({
      name: 'relay',
      version: '0.1.0',
      tools: input.tools.map((t) =>
        tool(t.name, t.description, toolSchemas[t.name as ToolName].shape, async (args, extra) => {
          try {
            const requestId =
              (extra as { requestId?: string } | undefined)?.requestId ?? randomUUID();
            const result = await input.callTool(t.name, args, String(requestId));
            return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
          } catch (e) {
            return { isError: true, content: [{ type: 'text' as const, text: safeError(e) }] };
          }
        }),
      ),
    });
    return {
      cwd: input.cwd,
      model: input.run.snapshot.model,
      systemPrompt: input.instructions,
      maxTurns: input.maxTurns,
      abortController: controller,
      settingSources: [],
      tools: [],
      agents: {},
      plugins: [],
      persistSession: false,
      mcpServers: { relay: mcp },
      allowedTools: input.tools.map((t) => `mcp__relay__${t.name}`),
      permissionMode: 'default',
      includePartialMessages: true,
      canUseTool: async (name) => ({
        behavior: 'deny',
        message: `Unsupported tool ${name}. Use Autobase's validated MCP tools.`,
      }),
      env: {
        PATH: process.env.PATH,
        SystemRoot: process.env.SystemRoot,
        TEMP: process.env.TEMP,
        TMP: process.env.TMP,
        USERPROFILE: process.env.USERPROFILE,
        ANTHROPIC_API_KEY: key,
        CLAUDE_CONFIG_DIR: configDir,
        CLAUDE_AGENT_SDK_CLIENT_APP: 'relay/0.1.0',
      },
    };
  }
  async run(input: EngineInput): Promise<EngineResult> {
    const stream = this.queryFn({ prompt: input.prompt, options: this.options(input) });
    let text = '';
    let resultText = '';
    let success = false;
    try {
      for await (const msg of stream) {
        if (input.signal.aborted) throw new Error('Run cancelled.');
        const m = msg as SDKMessage;
        if (m.type === 'system' && m.subtype === 'init') {
          input.onSession(m.session_id, m.model);
          input.onActivity(
            'provider',
            'Claude Agent session initialized using API authentication.',
          );
        }
        if (
          m.type === 'stream_event' &&
          m.event.type === 'content_block_delta' &&
          m.event.delta.type === 'text_delta'
        ) {
          text += m.event.delta.text;
          input.onText(m.event.delta.text);
        }
        if (m.type === 'assistant')
          for (const block of m.message.content) {
            if (block.type === 'tool_use') input.onActivity('provider_tool', block.name);
          }
        if (m.type === 'result') {
          input.onUsage({
            input: m.usage.input_tokens,
            output: m.usage.output_tokens,
            costUsd: m.total_cost_usd,
          });
          if (m.subtype !== 'success' || m.is_error)
            throw new Error(
              m.subtype === 'success' ? m.result : `${m.subtype}: ${m.errors.join('; ')}`,
            );
          resultText = m.result;
          success = true;
        }
      }
      if (!success || !(resultText || text).trim())
        throw new Error('Claude stopped without a successful terminal result.');
      if (!text) input.onText(resultText);
      return { text: resultText || text };
    } finally {
      stream.close();
    }
  }
}
