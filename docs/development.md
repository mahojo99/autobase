# Development

Autobase is a Windows desktop app built with Electron, React, TypeScript and SQLite. Optimus Prime is the persistent orchestrator. New bots receive an available Autobot name and portrait independently of their role: Bumblebee, Ratchet, Wheeljack, Arcee or Jazz.

## Run locally

To try a released build without development tools, use the PowerShell command in the [README](../README.md). The installer downloads the public release, verifies its SHA-256 digest and launches it from `%LOCALAPPDATA%\Autobase`. It needs no administrator access, Git or Node.js. Live providers still require their installed CLIs and sign-in; the offline demo runs immediately.

From PowerShell, with Git and npm installed:

```powershell
git clone https://github.com/mahojo99/autobase.git
cd autobase
npm install --prefix .tooling node@24.20.0
.\scripts\run.ps1 ci
.\scripts\run.ps1 run dev
```

The project uses Node 24.20.0 without replacing the global runtime. Dependencies are pinned in `package-lock.json`.

## Providers

Install [Codex CLI](https://github.com/openai/codex) or [Claude Code](https://code.claude.com/docs/en/setup), then use Settings to sign in through that provider's native flow. Autobase does not copy login tokens. The tested boundaries are Codex 0.153.4 (experimental App Server) and Claude Code 2.1.263. Compatible subscription access depends on the provider and account.

Claude Agent SDK, Grok and Gemini are separate API options requiring keys and API billing. They do not use Grok or Google subscriptions. Keys entered in Settings use Windows-backed encryption.

## Verify and package

```powershell
.\scripts\run.ps1 run verify
.\scripts\run.ps1 run package
.\scripts\run.ps1 run test:packaged
```

`verify` runs TypeScript, runtime/adapter tests, the production build and Electron tests. Packaged tests make real Codex and Claude Code calls using existing native authentication. Other live checks are under `scripts/live-*.ts`; `scripts/audit-desktop.ts` checks accessibility. Tests use isolated data and write evidence to ignored `.cache/` directories.

Packaging creates `release/Autobase-win32-x64/Autobase.exe` and `release/Autobase-windows-x64.zip`. Keep the extracted folder together. The Windows build is unsigned.

## Runtime and limits

The sandboxed renderer uses narrow typed IPC. A separate runtime owns bot configuration, task execution, permissions, provider processes, schedules, artifacts and SQLite context retrieval. Delegation is bounded to two concurrent helpers at one level; archived bots retain their history. Personal data stays under `%APPDATA%\Relay\personal` for compatibility. Offline demo data is separate.

Codex and native Claude Code have passed live orchestration and restart checks. API adapters have protocol/fixture coverage; live Anthropic, xAI and Gemini API checks still require keys. Fresh browser sign-in requires the user to complete the provider flow.

Schedules require the app running and the computer awake. Interrupted work requires an explicit retry. There is no unrestricted shell, host desktop access or working virtual computer backend; the computer option currently probes prerequisites only.
