# Autobase

A simple, dark Windows desktop app for getting work done with a team of bots. Talk to **Optimus Prime**, your persistent orchestrator. It creates specialists such as **Bumblebee**, **Wheeljack**, and **Ratchet**, delegates bounded tasks, retrieves shared context, and brings back real results.

The core app is implemented and locally verified. Real Codex chat, conversational bot creation, two-helper delegation, memory retrieval, artifacts, and packaged-app persistence passed live checks. Native Claude Code also passed a real task through the owner's Claude Pro login. Separate Claude, Grok, and Gemini API adapters are implemented; their live API calls require keys. The optional virtual computer milestone is incomplete. See the [verification matrix](docs/verification.md) for live, fixture, and unverified coverage.

![Autobase conversation](docs/screenshots/01-conversation.png)

## Run the Windows package

Open `release\Autobase-win32-x64\Autobase.exe`. Keep the entire directory together. This is a portable, unsigned local application; no installer or public release was published.

The default screen is Optimus Prime’s conversation. Work details stay closed until requested; files and helper summaries appear inline. Choose **Try offline demo** for deterministic scenarios in a separate database. No simulated response is routed through a live engine.

There are **six names** in the current roster: **Optimus Prime**, **Bumblebee**, **Ratchet**, **Wheeljack**, **Arcee**, and **Jazz**. A fresh workspace starts with Optimus Prime only. Creating a specialist assigns an unused name automatically, independently of its role, with a corresponding black-and-white character portrait. Bumblebee is one possible name, not a compulsory starter bot. The current pool permits five active specialists; archive an unused specialist to free a name. Historical bots and results remain distinct by stable ID.

## Develop and verify

Use Node **24.20.0**. The preparation machine's global Node 20.17.0 is retained. Install a project-local runtime, then invoke npm through it:

```powershell
npm install --prefix .tooling --no-audit --no-fund node@24.20.0
.\scripts\run.ps1 ci --include=optional
.\scripts\run.ps1 run dev
```

`dev` builds and launches Electron. Restart after source edits; hot reload is not implemented. `.\scripts\run.ps1 start` opens an existing build.

```powershell
.\scripts\run.ps1 run verify
.\scripts\run.ps1 run package
.\scripts\run.ps1 run test:packaged
```

`verify` runs TypeScript, domain/adapter/runtime tests, a production build, and Electron tests. **`test:packaged` makes live Codex and Claude Code requests through existing native logins, including two Claude helpers.** It requires the package and ready native authentication. Tests use isolated `.cache` directories.

Additional deliberately live checks:

```powershell
.\scripts\run.ps1 run test:live
.\scripts\run.ps1 run test:live:delegation
.\scripts\run.ps1 run test:live:claude
.\.tooling\node_modules\node\bin\node.exe node_modules/tsx/dist/cli.mjs scripts/web-smoke.ts
```

Run `test:live` before `test:live:delegation`; the latter uses the specialist created by the first. Codex live checks use `gpt-6-astra` with `xhigh`; native Claude checks use the provider default with medium effort. In-app model choice remains editable.

## Engines and access

- **Codex:** CLI **0.153.4**, pinned experimental App Server/dynamic tools. Run `codex login` with supported native ChatGPT authentication. Autobase does not copy tokens or use ambient paid OpenAI API keys. Models come from the provider catalog. `RELAY_CODEX_PATH` can identify a native `codex.exe` if automatic discovery fails.
- **Claude Code · Claude plan:** installed, unmodified native CLI **2.1.263**, with native account authentication. Sign in through Settings or `claude auth login`, then check readiness. Existing Claude Pro authentication was used successfully without copying or reading credential files. Plan limits apply. The SDK's API connection remains separate. See [Anthropic's native-hosting conditions](https://code.claude.com/docs/en/legal-and-compliance).
- **Claude Agent · API billing:** official SDK **0.3.266** and bundled runtime. Enter an Anthropic API key in Settings and an explicit supported model ID in bot configuration. Keys use Windows DPAPI. No paid Claude API call was made.
- **Grok / Gemini · API billing:** real tool-calling adapters through provider-supported Chat Completions compatibility endpoints. Add an xAI or Google AI Studio key and an explicit model ID. They use separate API billing, not Grok or Google chat subscriptions. Protocol, authorization and cancellation are fixture-tested; live model execution is key-blocked. Responses display per completed provider turn; token-by-token streaming and native Grok/Gemini sign-in are not implemented.
- **Tools:** shared context, selected-folder text reads, public HTTPS text retrieval, bot/task operations, exact-action decisions, schedules, and managed artifacts. Shell commands and host desktop control are not exposed.

Selecting a project folder grants read access to the orchestrator. Web reads require an exact one-time approval unless the owner grants that bot public-web scope. Child permissions cannot exceed the parent's. Provider-reported usage is displayed where available; unavailable cost is labelled explicitly.

## Data and availability

The Autobase rename retains the existing data directory, normally `%APPDATA%\Relay` on Windows. The original default bot is renamed to Optimus Prime once; custom names and past run snapshots are preserved. Personal and Demo have separate SQLite databases and artifact directories. Bots, conversations, run attempts, decisions, and schedules survive restart.

Closing Autobase exits its runtime. Active work becomes interrupted and requires inspection before retry; uncertain side effects are not replayed. Schedules require Autobase and the computer to be available. Missed occurrences coalesce into at most one catch-up per schedule and do not overlap existing work.

## Handoff

- [Architecture and material choices](docs/architecture.md)
- [Verification, commands, evidence, and concrete blockers](docs/verification.md)
- [Five-minute demo script](docs/demo-script.md)
- [Screenshots](docs/screenshots)
- [Product requirements](docs/PRD.md), [build handoff](docs/BUILD-PROMPT.md), and [references](docs/REFERENCES.md)
- [Third-party notices](THIRD_PARTY_NOTICES.md)

Remaining external dependencies are API keys for the optional Claude/Grok/Gemini API paths and an intentionally provisioned local computer runtime. Podman/Docker and a guest desktop were not installed by this build. Guest lifecycle, desktop streaming, and browser automation remain an explicitly incomplete optional milestone.
