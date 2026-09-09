import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createInterface } from 'node:readline';
import { existsSync, readdirSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import { safeError } from './types';

export function findCodex(): string | null {
  if (process.env.RELAY_CODEX_PATH && existsSync(process.env.RELAY_CODEX_PATH))
    return process.env.RELAY_CODEX_PATH;
  const candidates = (process.env.PATH ?? '').split(delimiter).map((p) => join(p, 'codex.exe'));
  const npmRoot = join(process.env.APPDATA ?? '', 'npm', 'node_modules', '@openai');
  for (const root of [
    join(npmRoot, 'codex', 'vendor'),
    join(npmRoot, 'codex', 'node_modules', '@openai', 'codex-win32-x64', 'vendor'),
    join(npmRoot, 'codex-win32-x64', 'vendor'),
  ]) {
    if (existsSync(root))
      for (const dir of readdirSync(root)) {
        candidates.push(join(root, dir, 'codex', 'codex.exe'));
        candidates.push(join(root, dir, 'bin', 'codex.exe'));
      }
  }
  return candidates.find((p) => existsSync(p)) ?? null;
}

export class RpcClient {
  readonly child: ChildProcessWithoutNullStreams;
  private nextId = 1;
  private pending = new Map<
    number,
    { resolve: (v: any) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }
  >();
  onNotification: (method: string, params: any) => void = () => {};
  onRequest: (method: string, params: any) => Promise<any> = async () => {
    throw new Error('Unsupported provider request');
  };
  onExit: (error: Error) => void = () => {};
  private closed = false;
  constructor(executable: string, args: string[], cwd: string, env = process.env) {
    this.child = spawn(executable, args, {
      cwd,
      env,
      stdio: 'pipe',
      windowsHide: true,
      shell: false,
    });
    const lines = createInterface({ input: this.child.stdout });
    lines.on('line', (line) => {
      if (line.length > 4_000_000)
        return this.fail(new Error('Provider protocol message exceeds limit.'));
      let msg: any;
      try {
        msg = JSON.parse(line);
      } catch {
        return this.fail(new Error('Invalid JSON from provider protocol.'));
      }
      if (msg.method && msg.id !== undefined) {
        void this.onRequest(msg.method, msg.params).then(
          (result) => this.send({ id: msg.id, result }),
          (error) => this.send({ id: msg.id, error: { code: -32603, message: safeError(error) } }),
        );
      } else if (msg.method) this.onNotification(msg.method, msg.params);
      else {
        const p = this.pending.get(msg.id);
        if (!p) return;
        this.pending.delete(msg.id);
        clearTimeout(p.timer);
        if (msg.error) p.reject(new Error(safeError(msg.error.message)));
        else p.resolve(msg.result);
      }
    });
    // Drain diagnostics without collecting credentials, native configuration, or unbounded logs.
    this.child.stderr.on('data', () => {});
    this.child.on('error', (e) => this.fail(e));
    this.child.on('exit', (code) => {
      if (!this.closed)
        this.fail(new Error(`Provider process exited (${code ?? 'signal'}) before completion.`));
    });
  }
  private fail(error: Error) {
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(error);
    }
    this.pending.clear();
    this.onExit(error);
  }
  send(message: unknown) {
    if (!this.closed && this.child.stdin.writable)
      this.child.stdin.write(JSON.stringify(message) + '\n');
  }
  call<T = any>(method: string, params: unknown, timeout = 30000): Promise<T> {
    if (this.closed) return Promise.reject(new Error('Provider is closed.'));
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${method} timed out.`));
      }, timeout);
      this.pending.set(id, { resolve, reject, timer });
      this.send({ id, method, params });
    });
  }
  async initialize() {
    const result = await this.call('initialize', {
      clientInfo: { name: 'relay_desktop', title: 'Relay', version: '0.1.0' },
      capabilities: { experimentalApi: true },
    });
    this.send({ method: 'initialized', params: {} });
    return result;
  }
  close() {
    if (this.closed) return;
    this.closed = true;
    this.fail(new Error('Provider connection closed.'));
    this.child.stdin.end();
    // Only this app-owned process is terminated. No global process-name kill.
    const timer = setTimeout(() => {
      if (this.child.exitCode === null) this.child.kill();
    }, 1000);
    timer.unref();
  }
}
