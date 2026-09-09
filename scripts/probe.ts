import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { CodexAdapter } from '../src/runtime/engines/codex';
const dir = resolve('.cache/provider-work');
mkdirSync(dir, { recursive: true });
console.log(JSON.stringify(await new CodexAdapter(dir).readiness(), null, 2));
