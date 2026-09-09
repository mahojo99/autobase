import type { Readiness } from '../../shared/contracts';
import type { EngineAdapter, EngineInput, EngineResult } from './types';
import { safeError } from './types';

const endpoints = {
  grok: 'https://api.x.ai/v1/chat/completions',
  gemini: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
} as const;

/** Supported compatibility APIs. Only runtime functions are exposed; no native host tools. */
export class ApiAdapter implements EngineAdapter {
  readonly version: string;
  constructor(
    readonly provider: keyof typeof endpoints,
    readonly getKey: () => string | undefined,
    readonly request: typeof fetch = fetch,
  ) {
    this.version = `${provider} Chat Completions compatibility API (2026-09-09)`;
  }
  async readiness(): Promise<Readiness> {
    return {
      engine: this.provider,
      state: this.getKey() ? 'installed' : 'authentication_required',
      version: this.version,
      models: [],
      detail: this.getKey()
        ? 'API key configured. Enter a model ID in bot settings. API billing applies; connection is verified on first task.'
        : `Add a ${this.provider === 'grok' ? 'xAI' : 'Google AI Studio'} API key. This connection uses API billing, not a chat subscription.`,
    };
  }
  async run(input: EngineInput): Promise<EngineResult> {
    const key = this.getKey();
    if (!key)
      throw new Error(
        `${this.provider} API key required. Add it in Settings; API billing applies.`,
      );
    if (!input.run.snapshot.model)
      throw new Error('Enter an explicit provider model ID in bot settings.');
    const history: Record<string, any>[] = [
      { role: 'system', content: input.instructions },
      { role: 'user', content: input.prompt },
    ];
    let text = '',
      session = false;
    const usage = { input: 0, output: 0 };
    for (let turn = 0; turn < input.maxTurns; turn++) {
      input.signal.throwIfAborted();
      input.onActivity('provider', `${this.provider} API turn ${turn + 1}; awaiting response.`);
      const response = await this.request(endpoints[this.provider], {
        method: 'POST',
        redirect: 'error',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model: input.run.snapshot.model,
          messages: history,
          stream: false,
          tools: input.tools.map((t) => ({
            type: 'function',
            function: { name: t.name, description: t.description, parameters: t.schema },
          })),
        }),
        signal: AbortSignal.any([input.signal, AbortSignal.timeout(180000)]),
      });
      if (!response.ok) {
        await response.body?.cancel();
        // Provider error bodies may echo credentials or submitted context. Never persist them.
        const advice = [401, 403].includes(response.status)
          ? 'Check the API key and account access.'
          : response.status === 429
            ? 'Provider quota or rate limit reached; retry explicitly later.'
            : 'Check model availability and API configuration. No automatic retry was made.';
        throw new Error(`${this.provider} API HTTP ${response.status}. ${advice}`);
      }
      const reader = response.body?.getReader();
      if (!reader) throw new Error('Provider returned an empty response.');
      const chunks: Uint8Array[] = [];
      let bytes = 0;
      try {
        for (;;) {
          const chunk = await reader.read();
          if (chunk.done) break;
          bytes += chunk.value.byteLength;
          if (bytes > 4_000_000) {
            await reader.cancel();
            throw new Error('Provider response exceeds limit.');
          }
          chunks.push(chunk.value);
        }
      } finally {
        reader.releaseLock();
      }
      input.signal.throwIfAborted();
      let result: any;
      try {
        result = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      } catch {
        throw new Error('Provider returned invalid JSON.');
      }
      const choice = result.choices?.[0];
      const message = choice?.message;
      if (message?.role !== 'assistant' || !['stop', 'tool_calls'].includes(choice.finish_reason))
        throw new Error('Provider response was incomplete, refused, or exceeded its output limit.');
      if (!session && typeof result.id === 'string') {
        input.onSession(result.id, result.model);
        session = true;
      }
      if (result.usage) {
        usage.input += Number(result.usage.prompt_tokens) || 0;
        usage.output += Number(result.usage.completion_tokens) || 0;
        input.onUsage({ ...usage });
      }
      // Preserve the complete assistant message, including Gemini thought signatures in
      // tool_calls[].extra_content. These stay in this run's memory, outside the transcript.
      history.push(message);
      if (typeof message.content === 'string' && message.content) {
        const delta = (text ? '\n\n' : '') + message.content;
        text += delta;
        input.onText(delta);
      }
      const calls = message.tool_calls;
      if (calls === undefined || calls === null || (Array.isArray(calls) && calls.length === 0)) {
        if (choice.finish_reason !== 'stop' || !text.trim())
          throw new Error('Provider finished without a result.');
        return { text };
      }
      if (!Array.isArray(calls) || calls.length > 100)
        throw new Error('Invalid provider tool batch.');
      for (const call of calls) {
        input.signal.throwIfAborted();
        if (
          call.type !== 'function' ||
          typeof call.id !== 'string' ||
          call.id.length > 200 ||
          !input.tools.some((t) => t.name === call.function?.name)
        )
          throw new Error('Provider requested a tool outside this run.');
        let args: unknown;
        try {
          args = JSON.parse(call.function.arguments);
        } catch {
          throw new Error('Provider returned malformed tool arguments.');
        }
        input.onActivity('provider_tool', call.function.name);
        let value: unknown;
        try {
          value = await input.callTool(call.function.name, args, `api:${call.id}`);
        } catch (e) {
          value = { error: safeError(e) };
        }
        input.signal.throwIfAborted();
        history.push({
          role: 'tool',
          tool_call_id: call.id,
          content: JSON.stringify(value ?? null),
        });
      }
    }
    throw new Error('Provider turn limit reached. Task did not finish.');
  }
}
