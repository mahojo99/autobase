# Local build verification

Verified on **September 9, 2026**, on Windows, in branch `feature/desktop-foundation`. Implementation remains local. No release, deployment, external message, purchase, provider-token copying, or unrelated repository change was performed.

## Delivered and checked

Portable Windows app: **`release\Autobase-win32-x64\Autobase.exe`**. Keep the entire folder together. The core milestones work with durable SQLite, actual provider adapters, orchestration tools, shared context, approvals, schedules, artifacts and restart recovery. The optional virtual computer milestone is incomplete.

**42/42 domain, protocol, runtime and boundary tests; 4/4 Electron tests; 2/2 packaged live-provider tests; TypeScript and production build passed.** The accessibility audit found zero WCAG 2 A/AA and 2.1 AA violations across eight screens. Fixtures are never counted as live provider calls.

The latest live packaged Claude check used the existing **Claude Pro** native login, resolved **claude-sonnet-5**, and created **Jazz** as Fact Checker and **Wheeljack** as Reviewer with automatic names. Both real child tasks completed, the parent retrieved an owner decision, synthesized the results and wrote `verification.md`. All three runs and bot identities survived close/reopen. The arithmetic result was **17 × 19 = 323**. The reviewer explicitly limited its decision check to internal consistency; it did not claim to independently inspect a fresh workspace. Fresh-workspace behavior is separately covered by local database and Electron tests.

## Commands and results

Commands below were run locally; the Codex-only foundation checks retain their original evidence. Reusable live scripts now request automatic names.

| Command                                                                                                      | Verified result                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| `.\scripts\run.ps1 run typecheck`                                                                            | TypeScript passed                                                                                                                  |
| `.\scripts\run.ps1 test`                                                                                     | 42 passed, 0 failed, 0 skipped                                                                                                     |
| `.\scripts\run.ps1 run build`                                                                                | Production main/preload/runtime and React build passed                                                                             |
| `.\scripts\run.ps1 run test:desktop`                                                                         | 4 passed, including actual IPC, encrypted API-key settings, keyboard focus, abrupt exit, recovery, demo delegation and persistence |
| `.\scripts\run.ps1 run package`                                                                              | Windows x64 portable package produced                                                                                              |
| `.\scripts\run.ps1 run test:packaged`                                                                        | 2 live tests passed: Codex bot creation/streaming/restart and native Claude two-helper/context/artifact/restart                    |
| `.\.tooling\node_modules\node\bin\node.exe node_modules/tsx/dist/cli.mjs scripts/live-native.ts claude-code` | LIVE PASS: native Claude Pro task, actual Bumblebee creation, arithmetic artifact, structured result and runtime restart           |
| `.\.tooling\node_modules\node\bin\node.exe node_modules/tsx/dist/cli.mjs scripts/audit-desktop.ts`           | Zero automated accessibility violations across eight screens                                                                       |
| `.\.tooling\node_modules\node\bin\node.exe node_modules/tsx/dist/cli.mjs scripts/live-smoke.ts`              | Earlier foundation LIVE PASS: Codex streaming, Evidence Clerk creation and restart                                                 |
| `.\.tooling\node_modules\node\bin\node.exe node_modules/tsx/dist/cli.mjs scripts/live-delegation.ts`         | Earlier foundation LIVE PASS: two Codex helpers, memory retrieval, synthesis and comparison artifact                               |
| `.\.tooling\node_modules\node\bin\node.exe node_modules/tsx/dist/cli.mjs scripts/web-smoke.ts`               | Earlier LIVE HTTP PASS: bounded example.com retrieval; no model or VM involved                                                     |
| `.\scripts\run.ps1 audit --omit=dev`                                                                         | Zero reported production dependency vulnerabilities                                                                                |
| `git diff --check`                                                                                           | Passed; no whitespace errors                                                                                                       |

During development two new tests initially failed because the test client replaced a forged Host header and a test closed its database twice. The fixtures were corrected; the actual Host boundary was verified with a raw Node HTTP request. An initial packaged test attempt started before packaging finished and could not launch; both tests passed after the completed package was available. These attempts are not counted as passes.

## Live versus simulated coverage

| Area                   | Actual coverage and limits                                                                                                                                                                                                                                                                                                |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Codex                  | LIVE native ChatGPT authentication, model discovery, streaming, persistent bot creation, structured outcome and packaged restart. Earlier foundation also verified two real helpers and sourced memory retrieval.                                                                                                         |
| Claude Code            | LIVE existing native Claude Pro login; real tools, automatic bot naming, two helpers, retrieval, artifact, synthesis and packaged restart. No credentials were copied into Autobase.                                                                                                                                      |
| Claude Agent SDK       | Real official SDK and local MCP round trip; stream/auth-error fixtures and bundled native executable checked. Paid API model execution remains blocked by a missing Anthropic API key.                                                                                                                                    |
| Grok / Gemini API      | Real fixed-endpoint adapters implemented. Fixtures verify runtime function calls, Gemini opaque signature preservation, cumulative usage, authentication errors, malformed/out-of-scope tools, truncation and cancellation. No live model request: xAI and Google AI Studio keys are absent.                              |
| Native sign-in buttons | Narrow IPC and provider enum rejection tested. Existing native login used live. Full new browser OAuth interaction was not automated; it requires the owner completing the provider flow.                                                                                                                                 |
| Names and portraits    | Six names: Optimus Prime, Bumblebee, Ratchet, Wheeljack, Arcee, Jazz. Only Optimus exists initially. Runtime allocates unused names independently of role; receipts, collisions, archival/reuse, colliding reactivation and restart are tested. All six character images inspected; screenshots confirm actual rendering. |
| Runtime                | Real SQLite claims, legal transitions, frozen configurations, bounded delegation, explicit retries, exact approvals, cancellation races, FTS provenance/correction/exclusion/deletion and artifact integrity checks.                                                                                                      |
| MCP capability         | Real loopback HTTP/client exchanges verify per-run bearer authorization, Host/Origin rejection, isolated credentials, replay receipts, malformed input and cancellation. Claude fixtures verify unexpected host-tool rejection and owned-process cleanup.                                                                 |
| Desktop                | Real Electron windows, isolated renderer, validated IPC, DPAPI, separate Personal/Demo data, helper navigation, compact layout, schedules and abrupt-exit recovery.                                                                                                                                                       |
| Optional computer      | Prerequisite probe only. Podman/Docker absent; no guest exists. Lifecycle, streaming desktop and guest browser/screenshot are not implemented or verified.                                                                                                                                                                |

Grok and Gemini use supported compatibility APIs with explicit model IDs and separate API billing. No native Grok/Google subscription login, token streaming or model catalog is claimed for these two paths. The native CLI options were researched locally; they are not shipped integrations.

## Environment and package

| Component                           | Observed version/state                                                            |
| ----------------------------------- | --------------------------------------------------------------------------------- |
| Project Node                        | 24.20.0 in `.tooling`; global Node 20.17.0 / npm 10.8.2 retained                  |
| Electron / embedded Node / Chromium | 44.3.0 / 24.20.0 / 152.0.7977.78                                                  |
| React / TypeScript / Vite           | 19.2.8 / 7.0.2 / 8.2.2                                                            |
| Codex CLI                           | 0.153.4; experimental App Server and dynamic tool boundary pinned                 |
| Claude Code native                  | 2.1.263; existing Claude Pro login, provider default resolved to claude-sonnet-5  |
| Claude Agent SDK / bundled runtime  | 0.3.266 / 2.1.266                                                                 |
| MCP TypeScript SDK                  | 1.30.0                                                                            |
| SQLite                              | Built into launched Node/Electron; WAL, foreign keys and FTS5 exercised           |
| Podman / Docker                     | Absent                                                                            |
| WSL                                 | Default Ubuntu-22.04 distribution, WSL 2; not proof of an available guest desktop |

The portable package is unsigned and was not published. Its main UI remains a quiet dark conversation with details closed by default. Data remains under `%APPDATA%\Relay` for upgrade continuity. Personal data was not used by the live verification tasks; those used isolated `.cache` directories.

## Evidence and screenshots

[Checked-in evidence](evidence/local-verification.json) records task/run identities, resolved models, source decisions, package hashes and screenshot hashes. Local source records include `.cache/packaged-verification.json`, `.cache/packaged-claude-verification.json`, `.cache/live-claude-code-result.json`, the earlier Codex foundation files and `.cache/accessibility/audit.json`.

- [Fresh conversation](screenshots/01-conversation.png)
- [Offline delegation](screenshots/02-delegation-demo.png)
- [Offline exact approval](screenshots/03-approval-demo.png)
- [Offline recovery](screenshots/04-recovery-demo.png)
- [Compact layout](screenshots/05-compact-demo.png)
- [Packaged live Codex](screenshots/06-packaged-live-codex.png)
- [Provider settings](screenshots/07-settings.png)
- [Bot configuration](screenshots/08-bot-configuration.png)
- [Packaged live Claude with Jazz and Wheeljack](screenshots/09-packaged-live-claude.png)

These are actual Electron captures. The automated accessibility audit covers conversation, configuration, conversation with details, Work, Shared context, Schedules, Manage bots and Settings; it is not a full screen-reader certification.

## Specific remaining dependencies and limits

1. **Paid API verification:** owner-supplied Anthropic, xAI and Google AI Studio API keys plus explicit supported model IDs. No paid API calls or purchases were made. Native Codex and Claude are independently live verified.
2. **Optional virtual computer:** requires intentionally provisioned prerequisites and implementation of the guest lifecycle, visible desktop and browser bridge. Current delivery is an honest prerequisite probe.
3. **Roster capacity:** five active specialist names; archive one to reuse its name. Expanding this pool requires more names and corresponding portraits. Temporary helpers currently retain their name until archived.
4. **Provider scope:** Grok/Gemini return completed API turns; native subscription login for them is deferred. Native sign-in buttons still require an owner-driven OAuth check on a clean account.
5. **Recovery and availability:** no automatic native-session restoration, uncertain side-effect replay, task backoff, arbitrary shell/host desktop access, imported MCP UI, tray service or external notifications. Schedules need the app running and computer awake.

See [architecture](architecture.md), [demo script](demo-script.md), and [current provider references](REFERENCES.md). The owner's subsequent name, portrait and Claude subscription requests supersede the corresponding initial-brief choices.
