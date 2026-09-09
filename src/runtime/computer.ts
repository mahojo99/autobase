import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { ComputerState } from '../shared/contracts';
const exec = promisify(execFile);
export async function probeComputer(): Promise<ComputerState> {
  try {
    const version = (
      await exec('podman', ['--version'], { timeout: 8000, windowsHide: true })
    ).stdout.trim();
    const machines = JSON.parse(
      (
        await exec('podman', ['machine', 'list', '--format', 'json'], {
          timeout: 8000,
          windowsHide: true,
        })
      ).stdout,
    );
    return {
      state: 'stopped',
      runtime: 'podman',
      version,
      detail: machines.some((m: any) => m.Running)
        ? 'Podman machine is running. Autobase computer image and browser bridge are not provisioned. No guest is connected.'
        : 'Podman installed; a running Linux machine is required. No guest is connected.',
    };
  } catch (e) {
    return {
      state: 'unavailable',
      runtime: null,
      version: null,
      detail:
        (e as NodeJS.ErrnoException).code === 'ENOENT'
          ? 'Podman is not installed. Install Podman Desktop and its Windows WSL 2 or Hyper-V prerequisites to enable an optional Linux computer. Normal bot work is available.'
          : 'Podman probe failed. Check podman machine list in a terminal. No guest is connected.',
    };
  }
}
