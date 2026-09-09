import { join } from 'node:path';
import { Runtime } from './runtime';
import { safeError } from './engines/types';
import type { Workspace } from '../shared/contracts';

const port = (
  process as unknown as {
    parentPort: {
      postMessage: (v: unknown) => void;
      on: (name: string, cb: (e: { data: any }) => void) => void;
    };
  }
).parentPort;
const dataDir = process.argv[2];
let key: string | undefined;
const runtimes = new Map<Workspace, Runtime>();
function runtime(workspace: Workspace) {
  if (!['personal', 'demo'].includes(workspace)) throw new Error('Invalid workspace');
  let r = runtimes.get(workspace);
  if (!r) {
    r = new Runtime(
      join(dataDir, workspace),
      workspace,
      (event) => port.postMessage({ type: 'event', event }),
      () => key,
    );
    runtimes.set(workspace, r);
    void r.start().catch((e) =>
      port.postMessage({
        type: 'event',
        event: { workspace, kind: 'runtime_error', text: safeError(e) },
      }),
    );
  }
  return r;
}
port.on('message', ({ data }) => {
  void (async () => {
    try {
      let result: unknown;
      if (data.type === 'key') {
        key = data.key || undefined;
        result = true;
      } else if (data.type === 'stop') {
        await Promise.all([...runtimes.values()].map((r) => r.stop()));
        port.postMessage({ id: data.id, result: true });
        process.exit(0);
      } else if (data.type === 'folder') {
        runtime(data.workspace).setFolder(data.folder);
        result = true;
      } else if (data.type === 'command')
        result = await runtime(data.workspace).command(data.command);
      else throw new Error('Unknown runtime message');
      port.postMessage({ id: data.id, result });
    } catch (e) {
      port.postMessage({ id: data.id, error: safeError(e) });
    }
  })();
});
port.postMessage({ type: 'ready' });
