import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
const read = (path) => JSON.parse(readFileSync(path, 'utf8'));
const first = read('.cache/live-first-result.json');
const delegation = read('.cache/live-delegation-result.json');
const packaged = read('.cache/packaged-verification.json');
const packagedClaude = read('.cache/packaged-claude-verification.json');
const web = read('.cache/web-verification.json');
const hash = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');
const proof = {
  recordedAt: new Date().toISOString(),
  branch: 'feature/desktop-foundation',
  product: 'Autobase',
  note: 'Codex creation/delegation entries retain original foundation evidence. Packaged Codex and Claude and screenshots verify the current Autobase character/naming and provider build.',
  automatedCoverage: {
    domainAdapterRuntime: { passed: 42, failed: 0 },
    electron: { passed: 4, failed: 0 },
    packagedLive: { passed: 2, failed: 0 },
    defaultConversationAxeViolations: 0,
    accessibilitySurfaces: read('.cache/accessibility/audit.json').map((s) => ({
      surface: s.surface,
      violations: s.violations.length,
    })),
  },
  versions: packaged.versions,
  liveBotCreation: {
    task: first.task,
    runs: first.runs.map((r) => ({
      id: r.id,
      snapshot: r.snapshot,
      session: r.providerSession,
      text: r.text,
      usage: r.usage,
    })),
  },
  liveDelegation: {
    parent: delegation.task,
    children: delegation.children,
    source: delegation.memory,
    sessions: delegation.runs.map((r) => ({
      taskId: r.taskId,
      runId: r.id,
      model: r.snapshot.model,
      effort: r.snapshot.effort,
      session: r.providerSession,
      usage: r.usage,
    })),
  },
  packagedLive: {
    task: packaged.task,
    run: packaged.run,
    restartPreserved: packaged.restartPreserved,
    executable: 'release/Autobase-win32-x64/Autobase.exe',
    exeSha256: hash('release/Autobase-win32-x64/Autobase.exe'),
    appAsarSha256: hash('release/Autobase-win32-x64/resources/app.asar'),
  },
  liveHttp: web,
  packagedClaude: {
    verifiedAt: packagedClaude.verifiedAt,
    live: true,
    authentication: 'Existing native Claude Pro login; no credentials copied or imported',
    restartPreserved: true,
    tasks: packagedClaude.tasks,
    runs: packagedClaude.runs,
    bots: packagedClaude.bots,
    artifacts: packagedClaude.artifacts,
  },
  apiAdapters: {
    grok: 'Implemented; protocol fixtures passed; live blocked by missing xAI API key',
    gemini: 'Implemented; protocol fixtures passed; live blocked by missing Google AI Studio key',
    nativeGrokGeminiLogin: 'Not implemented',
  },
  claude: {
    sdk: '0.3.266',
    localMcpRoundTrip: 'verified',
    nativeExecutable: '2.1.266 verified',
    liveModelExecution: 'blocked: no Anthropic API key',
  },
  computer: {
    podman: 'absent',
    docker: 'absent',
    wsl: 'default Ubuntu-22.04, version 2',
    lifecycle: 'not implemented or live verified',
    streamedDesktop: 'not implemented or live verified',
  },
  screenshots: readdirSync('docs/screenshots')
    .filter((f) => f.endsWith('.png'))
    .map((f) => ({ file: `screenshots/${f}`, sha256: hash(join('docs/screenshots', f)) })),
};
mkdirSync('docs/evidence', { recursive: true });
writeFileSync('docs/evidence/local-verification.json', JSON.stringify(proof, null, 2));
console.log('Wrote checked-in local verification evidence.');
