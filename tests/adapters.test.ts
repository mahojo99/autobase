import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { ClaudeAdapter } from '../src/runtime/engines/claude';
import { CodexAdapter, codexArgs } from '../src/runtime/engines/codex';
import { RpcClient } from '../src/runtime/engines/rpc';
import { safeError, type EngineInput } from '../src/runtime/engines/types';
import { definitions } from '../src/runtime/tools';
import { Store } from '../src/runtime/store';
import type { Bot } from '../src/shared/contracts';
mkdirSync(resolve('.cache/adapter-tests'), { recursive: true });
function input(): { value: EngineInput; close: () => void; deltas: string[]; usage: any[] } {
  const dir = mkdtempSync(resolve('.cache/adapter-tests/session-'));
  const s = new Store(dir, 'demo');
  const bot = s.need<Bot>('bots', 'orchestrator');
  bot.model = 'explicit-fixture-model';
  s.saveBot(bot);
  const task = s.createTask(bot, 'Fixture task');
  const run = s.claim(task.id, 'fixture', '')!.run;
  const deltas: string[] = [],
    usage: any[] = [];
  return {
    close: () => s.close(),
    deltas,
    usage,
    value: {
      cwd: dir,
      prompt: 'Fixture',
      instructions: 'Fixture system instructions',
      run,
      tools: definitions(),
      signal: new AbortController().signal,
      maxTurns: 6,
      onText: (t) => deltas.push(t),
      onActivity: () => {},
      onSession: (id) => {
        run.providerSession = id;
      },
      onUsage: (u) => usage.push(u),
      callTool: async () => ({ verified: 'fixture' }),
      ask: async () => 'Deny',
    },
  };
}
test('Claude readiness is credential-blocked and never uses an existing subscription token', async () => {
  const adapter = new ClaudeAdapter(() => undefined);
  assert.equal((await adapter.readiness()).state, 'authentication_required');
  const i = input();
  assert.throws(() => adapter.options(i.value), /API key required/);
  i.close();
});
test('Official Claude SDK MCP server registers tools and dispatches a real in-process MCP request', async () => {
  const i = input();
  let called = false;
  i.value.callTool = async (name, args) => {
    assert.equal(name, 'relay_list_bots');
    assert.deepEqual(args, {});
    called = true;
    return [{ id: 'fixture-bot' }];
  };
  const adapter = new ClaudeAdapter(() => 'sk-ant-fixture-not-a-real-credential');
  const options = adapter.options(i.value);
  assert.deepEqual(options.tools, []);
  assert.deepEqual(options.settingSources, []);
  assert.equal(options.env?.CLAUDE_CODE_OAUTH_TOKEN, undefined);
  assert.equal(options.env?.OPENAI_API_KEY, undefined);
  assert.equal(
    (
      await options.canUseTool!(
        'Bash',
        { command: 'whoami' },
        { signal: i.value.signal, toolUseID: 'fixture', requestId: 'request-fixture' },
      )
    )?.behavior,
    'deny',
  );
  const sdk = options.mcpServers!.relay as any;
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'relay-contract-test', version: '1' });
  await sdk.instance.connect(serverTransport);
  await client.connect(clientTransport);
  assert.ok((await client.listTools()).tools.some((t) => t.name === 'relay_delegate'));
  const result = await client.callTool({ name: 'relay_list_bots', arguments: {} });
  assert.equal(called, true);
  assert.match(JSON.stringify(result), /fixture-bot/);
  await client.close();
  await sdk.instance.close();
  i.close();
});
test('Claude normalized stream uses terminal result and provider-reported usage (fixture events)', async () => {
  const i = input();
  let closed = false;
  const query = (() => ({
    async *[Symbol.asyncIterator]() {
      yield { type: 'system', subtype: 'init', session_id: 'fixture-session' };
      yield {
        type: 'stream_event',
        event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hello' } },
      };
      yield {
        type: 'result',
        subtype: 'success',
        is_error: false,
        result: 'Hello final',
        usage: { input_tokens: 12, output_tokens: 4 },
        total_cost_usd: 0.01,
      };
    },
    close() {
      closed = true;
    },
  })) as any;
  const adapter = new ClaudeAdapter(() => 'sk-ant-fixture-not-real', query);
  const result = await adapter.run(i.value);
  assert.equal(result.text, 'Hello final');
  assert.deepEqual(i.deltas, ['Hello']);
  assert.deepEqual(i.usage, [{ input: 12, output: 4, costUsd: 0.01 }]);
  assert.equal(closed, true);
  i.close();
});
test('Claude fixture authentication error is terminal and closes query without retry', async () => {
  const i = input();
  let calls = 0,
    closed = 0;
  const query = (() => {
    calls++;
    return {
      async *[Symbol.asyncIterator]() {
        yield {
          type: 'result',
          subtype: 'error_during_execution',
          is_error: true,
          usage: { input_tokens: 0, output_tokens: 0 },
          total_cost_usd: 0,
          errors: ['Authentication required'],
        };
      },
      close() {
        closed++;
      },
    };
  }) as any;
  await assert.rejects(
    new ClaudeAdapter(() => 'sk-ant-fixture-not-real', query).run(i.value),
    /Authentication required/,
  );
  assert.equal(calls, 1);
  assert.equal(closed, 1);
  i.close();
});
test('Codex App Server protocol fixture sends dynamic schemas and rejects identity mismatch', async () => {
  const i = input();
  const calls: { method: string; params: any }[] = [];
  let toolCalls = 0;
  let closed = false;
  const rpc = {
    onNotification: (_m: string, _p: any) => {},
    onRequest: async (_m: string, _p: any): Promise<any> => ({}),
    onExit: (_e: Error) => {},
    async initialize() {},
    close() {
      closed = true;
    },
    async call(method: string, params: any) {
      calls.push({ method, params });
      if (method === 'account/read') return { account: { type: 'chatgpt' } };
      if (method === 'config/read')
        return { config: { mcp_servers: { inherited_private_integration: {} } } };
      if (method === 'thread/start') return { thread: { id: 'fixture-thread' } };
      if (method === 'turn/start') {
        rpc.onNotification('turn/started', {
          threadId: 'fixture-thread',
          turn: { id: 'fixture-turn' },
        });
        await assert.rejects(
          rpc.onRequest('item/tool/call', {
            threadId: 'other-thread',
            turnId: 'fixture-turn',
            callId: 'bad',
            tool: 'relay_list_bots',
            arguments: {},
          }),
          /identity/,
        );
        const answer = await rpc.onRequest('item/tool/call', {
          threadId: 'fixture-thread',
          turnId: 'fixture-turn',
          callId: 'ok',
          tool: 'relay_list_bots',
          arguments: {},
        });
        assert.equal(answer.success, true);
        const denied = await rpc.onRequest('item/commandExecution/requestApproval', {
          threadId: 'fixture-thread',
          turnId: 'fixture-turn',
          command: 'danger',
        });
        assert.equal(denied.decision, 'decline');
        rpc.onNotification('item/agentMessage/delta', {
          threadId: 'fixture-thread',
          delta: 'Fixture final',
        });
        rpc.onNotification('turn/completed', {
          threadId: 'fixture-thread',
          turn: { status: 'completed' },
        });
        return {};
      }
    },
  };
  i.value.callTool = async () => {
    toolCalls++;
    return [];
  };
  const adapter = new CodexAdapter(i.value.cwd, () => rpc as unknown as RpcClient);
  const result = await adapter.run(i.value);
  assert.equal(result.text, 'Fixture final');
  assert.equal(toolCalls, 1);
  assert.equal(closed, true);
  const thread = calls.find((c) => c.method === 'thread/start')!.params;
  assert.equal(thread.sandbox, 'read-only');
  assert.equal(thread.config['mcp_servers.inherited_private_integration.enabled'], false);
  assert.equal(thread.dynamicTools[0].type, 'function');
  assert.ok(codexArgs.includes('shell_tool'));
  assert.ok(codexArgs.includes('plugins'));
  i.close();
});
test('Protocol process exit before a terminal outcome fails; closing owns only its subprocess', async () => {
  const i = input();
  const rpc = new RpcClient(process.execPath, ['-e', 'process.exit(7)'], i.value.cwd);
  await assert.rejects(rpc.initialize(), /exited/);
  rpc.close();
  i.close();
});
test('Secret diagnostics redact known key and bearer formats', () => {
  const sanitized = safeError(
    new Error('key sk-ant-supersecretvalue Authorization: Bearer abcdefg api_key=private'),
  );
  assert.doesNotMatch(sanitized, /supersecretvalue|abcdefg|=private/);
});
