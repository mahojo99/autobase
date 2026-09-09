import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Readiness } from '../../shared/contracts';
import type { EngineAdapter, EngineInput, EngineResult } from './types';
import { safeError } from './types';
import { captureNative, findNative, nativeEnvironment } from './native-process';
import { startToolBridge } from './mcp-bridge';

export function claudeNativeArgs(input: EngineInput, config: string): string[] {
  return [
    '-p',
    '--output-format',
    'stream-json',
    '--verbose',
    '--include-partial-messages',
    '--no-session-persistence',
    '--restricted',
    '--setting-sources',
    '',
    '--strict-mcp-config',
    '--mcp-config',
    config,
    '--tools',
    '',
    '--disable-slash-commands',
    '--no-chrome',
    '--permission-mode',
    'dontAsk',
    '--permission-prompts',
    'none',
    '--allowedTools',
    input.tools.map((t) => `mcp__relay__${t.name}`).join(','),
    '--settings',
    JSON.stringify({
      disableAllHooks: true,
      autoMemoryEnabled: false,
      claudeMdExcludes: ['**'],
      disableClaudeAiConnectors: true,
      enabledPlugins: {},
    }),
    '--system-prompt',
    input.instructions,
    '--max-turns',
    String(input.maxTurns),
    '--effort',
    input.run.snapshot.effort,
    ...(input.run.snapshot.model ? ['--model', input.run.snapshot.model] : []),
  ];
}

export class ClaudeNativeAdapter implements EngineAdapter {
  readonly version = 'Claude Code native stream-json (tested 2.1.263)';
  constructor(
    readonly cwd: string,
    readonly executable = findNative,
    readonly spawnFn = spawn,
  ) {
    mkdirSync(cwd, { recursive: true });
  }
  async readiness(): Promise<Readiness> {
    const base = { engine: 'claude-code' as const, version: this.version, models: [] };
    const exe = this.executable('claude');
    if (!exe)
      return {
        ...base,
        state: 'unavailable',
        detail:
          'Install Claude Code, then run claude auth login. Autobase uses its native sign-in.',
      };
    try {
      const version = (await captureNative(exe, ['--version'], this.cwd)).trim();
      const help = await captureNative(exe, ['--help'], this.cwd);
      if (
        !['--restricted', '--permission-prompts', '--strict-mcp-config'].every((flag) =>
          help.includes(flag),
        )
      )
        return {
          ...base,
          version,
          state: 'error',
          detail: 'Update Claude Code: this version lacks required runtime restrictions.',
        };
      const auth = JSON.parse(await captureNative(exe, ['auth', 'status'], this.cwd));
      // Do not retain account emails, IDs, credential paths, or credentials.
      if (!auth.loggedIn || auth.authMethod !== 'claude.ai')
        return {
          ...base,
          version,
          state: 'authentication_required',
          detail:
            'Run claude auth login and select your Claude account. API keys have a separate connection below.',
        };
      return {
        ...base,
        version,
        state: 'ready',
        detail:
          'Signed in through Claude Code. Uses your Claude plan and its usage limits. Credentials stay with Claude Code.',
      };
    } catch (e) {
      return { ...base, state: 'authentication_required', detail: safeError(e) };
    }
  }
  async run(input: EngineInput): Promise<EngineResult> {
    const exe = this.executable('claude');
    if (!exe) throw new Error('Claude Code is not installed.');
    const bridge = await startToolBridge(input);
    const config = join(input.cwd, `mcp-${randomUUID()}.json`);
    writeFileSync(
      config,
      JSON.stringify({
        mcpServers: {
          relay: {
            type: 'http',
            url: bridge.url,
            headers: { Authorization: `Bearer ${bridge.token}` },
          },
        },
      }),
      { mode: 0o600 },
    );
    let child: ReturnType<typeof spawn> | undefined;
    try {
      if (input.signal.aborted) throw new Error('Run cancelled.');
      child = this.spawnFn(exe, claudeNativeArgs(input, config), {
        cwd: input.cwd,
        env: nativeEnvironment(),
        stdio: 'pipe',
        windowsHide: true,
        shell: false,
      });
      const owned = child;
      return await new Promise<EngineResult>((resolve, reject) => {
        let buffer = '',
          text = '',
          result = '',
          failure = '',
          success = false;
        const stop = () => {
          owned.kill();
        };
        input.signal.addEventListener('abort', stop, { once: true });
        const consume = (line: string) => {
          if (!line.trim()) return;
          const m = JSON.parse(line);
          if (m.type === 'system' && m.subtype === 'init') {
            const allowed = new Set(input.tools.map((t) => `mcp__relay__${t.name}`));
            if ((m.tools ?? []).some((name: string) => !allowed.has(name)))
              throw new Error('Claude exposed unexpected tools; run stopped.');
            if (
              !(m.mcp_servers ?? []).some(
                (s: any) => s.name === 'relay' && s.status === 'connected',
              )
            )
              throw new Error('Claude could not connect to Autobase tools.');
            input.onSession(m.session_id, m.model);
            input.onActivity('provider', 'Claude Code native session; Claude account sign-in.');
          }
          if (m.type === 'stream_event' && m.event?.delta?.type === 'text_delta') {
            text += m.event.delta.text;
            input.onText(m.event.delta.text);
          }
          if (m.type === 'assistant')
            for (const block of m.message?.content ?? [])
              if (block.type === 'tool_use') input.onActivity('provider_tool', block.name);
          if (m.type === 'result') {
            // Dollar estimates in native output are not charges against a subscription.
            if (m.usage)
              input.onUsage({
                input: m.usage.input_tokens ?? 0,
                output: m.usage.output_tokens ?? 0,
              });
            success = m.subtype === 'success' && !m.is_error;
            result = m.result ?? '';
            if (!success) failure = safeError(m.errors?.join('; ') || result || m.subtype);
          }
        };
        owned.stdout!.on('data', (chunk) => {
          try {
            buffer += chunk.toString();
            if (buffer.length > 4_000_000)
              throw new Error('Provider protocol message exceeds limit.');
            let end: number;
            while ((end = buffer.indexOf('\n')) >= 0) {
              const line = buffer.slice(0, end);
              buffer = buffer.slice(end + 1);
              consume(line);
            }
          } catch (e) {
            failure = safeError(e);
            stop();
          }
        });
        owned.stderr!.on('data', () => {});
        owned.on('error', (e) => {
          failure = safeError(e);
        });
        owned.on('close', (code) => {
          input.signal.removeEventListener('abort', stop);
          try {
            if (buffer.trim()) consume(buffer);
          } catch (e) {
            failure = safeError(e);
          }
          if (input.signal.aborted) reject(new Error('Run cancelled.'));
          else if (failure || code !== 0 || !success || !(result || text).trim())
            reject(
              new Error(failure || `Claude Code exited (${code}) without a successful result.`),
            );
          else {
            if (!text) input.onText(result);
            resolve({ text: result || text });
          }
        });
        owned.stdin!.on('error', () => {});
        owned.stdin!.end(input.prompt);
        if (input.signal.aborted) stop();
      });
    } finally {
      if (child && child.exitCode === null) child.kill();
      await bridge.close();
      rmSync(config, { force: true });
    }
  }
}
