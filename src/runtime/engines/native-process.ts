import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import { homedir } from 'node:os';
import { safeError } from './types';

export function nativeEnvironment(): NodeJS.ProcessEnv {
  // Authentication stays in the native provider's credential store. No ambient API
  // keys, custom endpoints, injected hooks, or other agent-session variables.
  const names = [
    'PATH',
    'SystemRoot',
    'WINDIR',
    'TEMP',
    'TMP',
    'USERPROFILE',
    'APPDATA',
    'LOCALAPPDATA',
    'HOMEDRIVE',
    'HOMEPATH',
    'COMSPEC',
    'LANG',
  ];
  return Object.fromEntries(
    names.map((k) => [k, process.env[k]]).filter(([, v]) => v !== undefined),
  );
}
export function findNative(name: 'claude' | 'grok'): string | null {
  const override = process.env[`RELAY_${name.toUpperCase()}_PATH`];
  const candidates = [
    override,
    join(homedir(), '.local', 'bin', `${name}.exe`),
    ...(process.env.PATH ?? '').split(delimiter).map((p) => join(p, `${name}.exe`)),
  ];
  return candidates.find((p): p is string => !!p && existsSync(p)) ?? null;
}
export async function captureNative(
  executable: string,
  args: string[],
  cwd: string,
  timeout = 15000,
) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(executable, args, {
      cwd,
      env: nativeEnvironment(),
      windowsHide: true,
      shell: false,
    });
    let output = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error('Native provider check timed out.'));
    }, timeout);
    child.stdout.on('data', (chunk) => {
      output += chunk.toString();
      if (output.length > 1_000_000) {
        child.kill();
        reject(new Error('Provider check exceeded output limit.'));
      }
    });
    child.stderr.on('data', () => {});
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(new Error(safeError(error)));
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      code === 0
        ? resolve(output)
        : reject(new Error(`Native provider check exited (${code}). Sign in with its CLI.`));
    });
  });
}
