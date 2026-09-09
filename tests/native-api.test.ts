import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { request as httpRequest } from 'node:http';
import { mkdirSync, mkdtempSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { startToolBridge } from '../src/runtime/engines/mcp-bridge';
import { ApiAdapter } from '../src/runtime/engines/api';
import { ClaudeNativeAdapter } from '../src/runtime/engines/claude-native';
import type { EngineInput } from '../src/runtime/engines/types';
import { Store } from '../src/runtime/store';
import type { Bot } from '../src/shared/contracts';

mkdirSync(resolve('.cache/native-tests'), { recursive: true });
function setup(t: any) {
  const dir = mkdtempSync(resolve('.cache/native-tests/session-'));
  const store = new Store(dir, 'demo');
  t.after(() => store.close());
  const bot = store.need<Bot>('bots', 'orchestrator');
  bot.model = 'fixture-model';
  store.saveBot(bot);
  const task = store.createTask(bot, 'Protocol fixture, no model calls');
  const run = store.claim(task.id, 'fixture', '')!.run;
  const controller = new AbortController(),
    deltas: string[] = [],
    usages: unknown[] = [];
  const input: EngineInput = {
    cwd: dir,
    prompt: 'Fixture',
    instructions: 'Fixture',
    run,
    tools: [
      {
        name: 'relay_list_bots',
        description: 'List',
        schema: { type: 'object', properties: {}, additionalProperties: false },
      },
    ],
    signal: controller.signal,
    maxTurns: 4,
    onText: (text) => deltas.push(text),
    onActivity: () => {},
    onSession: (id) => {
      run.providerSession = id;
    },
    onUsage: (u) => usages.push(u),
    callTool: async () => [{ id: 'orchestrator' }],
    ask: async () => 'Deny',
  };
  return { dir, input, controller, deltas, usages };
}

test('Native MCP bridge enforces per-run authorization, browser/host rejection, and replay receipts', async (t) => {
  const { input, controller } = setup(t);
  let calls = 0;
  input.callTool = async () => {
    calls++;
    return { source: 'real local runtime fixture' };
  };
  const bridge = await startToolBridge(input);
  t.after(() => bridge.close());
  const headers = {
    Authorization: `Bearer ${bridge.token}`,
    Accept: 'application/json, text/event-stream',
    'Content-Type': 'application/json',
  };
  const request = {
    jsonrpc: '2.0',
    id: 45,
    method: 'tools/call',
    params: { name: 'relay_list_bots', arguments: {} },
  };
  assert.equal((await fetch(bridge.url, { method: 'POST' })).status, 403);
  for (const extra of [
    { Origin: 'https://attacker.invalid' },
    { Authorization: 'Bearer wrong' },
  ] as Record<string, string>[])
    assert.equal(
      (
        await fetch(bridge.url, {
          method: 'POST',
          headers: { ...headers, ...extra },
          body: JSON.stringify(request),
        })
      ).status,
      403,
    );
  const invalidHostStatus = await new Promise<number | undefined>((resolveStatus, reject) => {
    const req = httpRequest(
      bridge.url,
      { method: 'POST', headers: { ...headers, Host: 'attacker.invalid' } },
      (res) => {
        res.resume();
        resolveStatus(res.statusCode);
      },
    );
    req.on('error', reject);
    req.end(JSON.stringify(request));
  });
  assert.equal(invalidHostStatus, 403);
  const client = new Client({ name: 'fixture', version: '1' });
  await client.connect(
    new StreamableHTTPClientTransport(new URL(bridge.url), { requestInit: { headers } }),
  );
  t.after(() => client.close());
  assert.deepEqual(
    (await client.listTools()).tools.map((t) => t.name),
    ['relay_list_bots'],
  );
  const results = await Promise.all(
    [1, 2].map(() =>
      fetch(bridge.url, { method: 'POST', headers, body: JSON.stringify(request) }).then((r) =>
        r.json(),
      ),
    ),
  );
  assert.deepEqual(results[0], results[1]);
  assert.equal(calls, 1);
  const changed: any = await (
    await fetch(bridge.url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        ...request,
        params: { ...request.params, arguments: { changed: true } },
      }),
    })
  ).json();
  assert.match(changed.error.message, /reused/);
  assert.equal(calls, 1);
  await assert.rejects(
    client.callTool({ name: 'Bash', arguments: { command: 'whoami' } }),
    /outside this run/,
  );
  assert.equal((await fetch(bridge.url, { method: 'POST', headers, body: '{bad' })).status, 400);
  const second = await startToolBridge(input);
  t.after(() => second.close());
  assert.equal(
    (await fetch(second.url, { method: 'POST', headers, body: JSON.stringify(request) })).status,
    403,
  );
  controller.abort();
  await delay(30);
  await assert.rejects(
    fetch(bridge.url, { method: 'POST', headers, body: JSON.stringify(request) }),
  );
});

function nativeFixture(code: string): typeof spawn {
  return ((_exe: any, args: string[], options: any) => {
    assert.equal(args[args.indexOf('--tools') + 1], '');
    assert.equal(args[args.indexOf('--setting-sources') + 1], '');
    assert.equal(options.shell, false);
    assert.equal(options.env.ANTHROPIC_API_KEY, undefined);
    return spawn(process.execPath, ['-e', code], options);
  }) as typeof spawn;
}
test('Claude native protocol normalizes streamed text and usage without inventing subscription charges', async (t) => {
  const { dir, input, deltas, usages } = setup(t);
  const events = [
    {
      type: 'system',
      subtype: 'init',
      tools: ['mcp__relay__relay_list_bots'],
      mcp_servers: [{ name: 'relay', status: 'connected' }],
      session_id: 'fixture-session',
      model: 'fixture-model',
    },
    { type: 'stream_event', event: { delta: { type: 'text_delta', text: 'Fixture result' } } },
    {
      type: 'result',
      subtype: 'success',
      result: 'Fixture result',
      usage: { input_tokens: 7, output_tokens: 4 },
      total_cost_usd: 12,
    },
  ];
  const adapter = new ClaudeNativeAdapter(
    dir,
    () => process.execPath,
    nativeFixture(
      `process.stdin.resume(); process.stdin.on('end', () => {for(const e of ${JSON.stringify(events)}) console.log(JSON.stringify(e));});`,
    ),
  );
  assert.equal((await adapter.run(input)).text, 'Fixture result');
  assert.deepEqual(deltas, ['Fixture result']);
  assert.deepEqual(usages, [{ input: 7, output: 4 }]);
  assert.equal(input.run.providerSession, 'fixture-session');
  assert.equal(
    readdirSync(dir).some((f) => f.startsWith('mcp-')),
    false,
  );
});

test('Claude native rejects unexpected host tools and cleans up on cancellation', async (t) => {
  const { dir, input, controller } = setup(t);
  const unexpected = new ClaudeNativeAdapter(
    dir,
    () => process.execPath,
    nativeFixture(
      `console.log(JSON.stringify({type:'system',subtype:'init',tools:['Bash']}));setInterval(()=>{},1000);`,
    ),
  );
  await assert.rejects(unexpected.run(input), /unexpected tools/);
  const pending = new ClaudeNativeAdapter(
    dir,
    () => process.execPath,
    nativeFixture('setInterval(()=>{},1000);'),
  ).run(input);
  await delay(100);
  controller.abort();
  await assert.rejects(pending, /cancelled/);
  assert.equal(
    readdirSync(dir).some((f) => f.startsWith('mcp-')),
    false,
  );
});

for (const provider of ['grok', 'gemini'] as const) {
  test(`${provider} API fixture executes runtime functions, preserves signatures, and sums reported usage`, async (t) => {
    const { input, usages } = setup(t);
    let requests = 0,
      calls = 0;
    input.callTool = async (name, args, id) => {
      calls++;
      assert.equal(name, 'relay_list_bots');
      assert.deepEqual(args, {});
      assert.equal(id, 'api:fixture-call');
      return { bots: ['Optimus Prime'] };
    };
    const message = {
      role: 'assistant',
      content: null,
      tool_calls: [
        {
          id: 'fixture-call',
          type: 'function',
          function: { name: 'relay_list_bots', arguments: '{}' },
          extra_content: { google: { thought_signature: 'opaque-fixture-signature' } },
        },
      ],
    };
    const request: typeof fetch = async (url, init) => {
      requests++;
      const body = JSON.parse(init!.body as string);
      assert.match(
        String(url),
        provider === 'grok'
          ? /^https:\/\/api.x.ai\//
          : /^https:\/\/generativelanguage.googleapis.com\//,
      );
      assert.equal(init!.redirect, 'error');
      assert.equal(body.tools[0].function.name, 'relay_list_bots');
      if (requests === 2) {
        assert.deepEqual(body.messages[2], message);
        assert.match(body.messages[3].content, /Optimus Prime/);
      }
      return Response.json({
        id: 'fixture-response',
        model: 'fixture-model',
        choices: [
          {
            finish_reason: requests === 1 ? 'tool_calls' : 'stop',
            message: requests === 1 ? message : { role: 'assistant', content: 'Found your bot.' },
          },
        ],
        usage: { prompt_tokens: 3, completion_tokens: 2 },
      });
    };
    const adapter = new ApiAdapter(provider, () => 'fixture-key', request);
    assert.equal((await adapter.readiness()).state, 'installed');
    assert.equal((await adapter.run(input)).text, 'Found your bot.');
    assert.equal(calls, 1);
    assert.deepEqual(usages.at(-1), { input: 6, output: 4 });
  });
}

test('API adapters fail closed for missing keys, authentication, malformed tools, truncation and cancellation', async (t) => {
  const { input, controller } = setup(t);
  let requests = 0,
    calls = 0;
  input.callTool = async () => {
    calls++;
  };
  const offline = new ApiAdapter(
    'grok',
    () => undefined,
    async () => {
      requests++;
      return Response.json({});
    },
  );
  assert.equal((await offline.readiness()).state, 'authentication_required');
  await assert.rejects(offline.run(input), /API key required/);
  assert.equal(requests, 0);
  const unauthorized = new ApiAdapter(
    'gemini',
    () => 'fixture-key',
    async () => new Response('secret echoed in body', { status: 401 }),
  );
  await assert.rejects(
    unauthorized.run(input),
    (e) => /HTTP 401/.test(String(e)) && !/secret echoed/.test(String(e)),
  );
  for (const [finish_reason, tool_calls] of [
    ['length', undefined],
    ['tool_calls', [{ type: 'function', id: '1', function: { name: 'Bash', arguments: '{}' } }]],
    [
      'tool_calls',
      [{ type: 'function', id: '1', function: { name: 'relay_list_bots', arguments: '{bad' } }],
    ],
  ] as const) {
    const adapter = new ApiAdapter(
      'grok',
      () => 'fixture-key',
      async () =>
        Response.json({ choices: [{ finish_reason, message: { role: 'assistant', tool_calls } }] }),
    );
    await assert.rejects(adapter.run(input));
  }
  assert.equal(calls, 0);
  const blocked = new ApiAdapter(
    'gemini',
    () => 'fixture-key',
    async (_url, init) =>
      new Promise((_resolve, reject) =>
        init!.signal!.addEventListener('abort', () => reject(new Error('Aborted')), { once: true }),
      ),
  );
  const pending = blocked.run(input);
  controller.abort();
  await assert.rejects(pending, /Aborted/);
});
