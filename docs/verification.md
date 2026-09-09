# Local build verification

Verified on **September 9, 2026**, on Windows, in branch `feature/desktop-foundation`. Implementation and artifacts remain local. No public release, deployment, external message, service purchase, provider-token copying, or unrelated repository change was performed.

## Delivered

`release\Autobase-win32-x64\Autobase.exe` is the portable Windows entry point. Keep the adjacent resources and DLLs. The core milestones are implemented and verified with the coverage below. The optional computer milestone remains incomplete, and Claude model execution requires an API credential.

The final development verification passed **35/35 domain, adapter, runtime, and boundary tests**, **4/4 Electron tests**, and TypeScript/build checks. The packaged app also passed a separate live Codex/persistence test. Fixtures are identified in test names and below; they are not live provider evidence.

## Autobase redesign

The owner requested a simple dark interface and selected the name **Autobase**, with **Optimus Prime** as the orchestrator. The default screen now has one conversation header, a compact collapsible bot list, and a restrained composer. Work details start closed. Helpers expand from an inline summary; result files open from the transcript. Bumblebee and Ratchet are the offline demonstration specialists. Default live naming guidance also suggests Wheeljack, Arcee, and Jazz, while honoring explicit owner names.

Upgrade coverage exercises the one-time default-name migration, retained conversations and frozen run snapshots, preservation of custom names, and reopening without repeated renames. The original `%APPDATA%\Relay` storage location and internal tool names remain compatible. Desktop coverage also checks sidebar collapse/restore, details disclosure, conversational bot creation entry, helper inspection, and direct specialist navigation. Screenshots 01–06 are refreshed from the redesigned app; 07 and 08 show settings and bot configuration. An additional WCAG 2 A/AA and 2.1 AA scan found zero violations across eight surfaces: conversation, configuration, conversation with details, Work, Shared context, Schedules, Manage bots, and Settings. This automated scan is not a full accessibility certification.

The original live two-helper/context evidence below remains evidence from the foundation build; it was not re-labelled as a fresh UI-redesign provider run. The Autobase packaged check independently verifies live Bumblebee creation, streaming and restart persistence. Claude model execution and the optional VM retain the same limitations.

## Environment actually observed

| Component                         | Verified version/state                                                                                   |
| --------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Global Node / npm                 | 20.17.0 / 10.8.2; global Node was retained                                                               |
| Project Node                      | 24.20.0 under `.tooling`                                                                                 |
| Electron package and launched app | 44.3.0                                                                                                   |
| Packaged embedded Node / Chromium | 24.20.0 / 152.0.7977.78                                                                                  |
| React / TypeScript / Vite         | 19.2.8 / 7.0.2 / 8.2.2                                                                                   |
| Codex CLI                         | 0.153.4; supported native ChatGPT login reported ready                                                   |
| Claude CLI initially present      | 2.1.263; its login was not imported                                                                      |
| Official Claude Agent SDK         | 0.3.266, bundled native Claude 2.1.266                                                                   |
| SQLite                            | Built into the actual packaged Node runtime; migration/FTS/persistence tested                            |
| Podman / Docker                   | Neither executable installed                                                                             |
| WSL                               | Default Ubuntu-22.04 distribution, default WSL version 2                                                 |
| Host resources                    | Approximately 16 GB RAM and 192 GB free disk at the initial probe                                        |
| Hypervisor probe                  | Hypervisor present; firmware/SLAT CIM fields false. These fields alone do not establish guest usability. |

Codex models came from `model/list`, including `gpt-6-astra`, `gpt-5.6-sol`, `gpt-5.6-terra`, `gpt-5.6-luna`, `gpt-5.5`, and `gpt-5.3-codex-spark` on this account at verification time. This is a dated discovery result, not a promise of future account availability. Live build checks selected **gpt-6-astra / xhigh** explicitly.

## Exact commands and results

Commands were run from the repository root. `scripts/run.ps1` invokes npm using the project Node and puts that Node first on PATH.

| Command                                                                                              | Result                                                                                                             |
| ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `node --version`, `npm --version`, `codex --version`, `claude --version`                             | Versions recorded above                                                                                            |
| `codex login status`                                                                                 | Native ChatGPT login present; no credentials printed                                                               |
| `codex app-server generate-ts --experimental --out .cache/codex-protocol`                            | Generated the actual installed protocol boundary                                                                   |
| `npm install --prefix .tooling --no-audit --no-fund node@24`                                         | Installed project Node 24.20.0; reproduction instructions pin it exactly                                           |
| `.\scripts\run.ps1 install --include=optional`                                                       | Installed required Windows native optional packages with the compatible Node runtime                               |
| `.\scripts\run.ps1 run verify`                                                                       | **PASS**: TypeScript; 35 tests, zero failures/skips; production build; 4 Electron tests, zero failures             |
| `.\.tooling\node_modules\node\bin\node.exe node_modules/tsx/dist/cli.mjs scripts/live-smoke.ts`      | **LIVE PASS**: streamed Codex, persistent bot creation, structured outcome, artifact, runtime restart              |
| `.\.tooling\node_modules\node\bin\node.exe node_modules/tsx/dist/cli.mjs scripts/live-delegation.ts` | **LIVE PASS**: two real Codex helpers, memory search/read, parent wait/synthesis, `comparison.md`                  |
| `.\.tooling\node_modules\node\bin\node.exe node_modules/tsx/dist/cli.mjs scripts/web-smoke.ts`       | **LIVE HTTP PASS**: bounded `https://example.com/` retrieval; 144 text characters; no model or VM involved         |
| `.\.tooling\node_modules\node\bin\node.exe node_modules/tsx/dist/cli.mjs scripts/audit-desktop.ts`   | **PASS**: zero WCAG 2 A/AA or 2.1 AA violations across eight desktop surfaces                                       |
| `.\scripts\run.ps1 run package`                                                                      | **PASS**: Windows x64 portable package produced                                                                    |
| `.\scripts\run.ps1 run test:packaged`                                                                | **LIVE PASS**: Autobase executable, native SDK executable, Bumblebee creation, SQLite, real streaming/result, close/reopen persistence |
| `.\scripts\run.ps1 audit --omit=dev`                                                                 | Zero reported production dependency vulnerabilities                                                                |
| `git diff --check`                                                                                   | No whitespace errors                                                                                               |

Earlier failing development checks were fixed and rerun; they are not counted as passing coverage. Findings included Codex tool-host configuration, refusal incorrectly counted as completion, retry overwriting a prior attempt's state, a missing Windows optional dependency, and low-contrast secondary text.

## Acceptance and evidence matrix

| Scenario                 | Implementation and verification                                                                                                                                                                    |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fresh desktop launch     | Actual development and packaged Electron windows opened; actionable provider readiness displayed                                                                                                   |
| Real conversation        | **Live Codex verified**, including deltas, native thread ID, structured completion, and usage reported by the provider                                                                             |
| Conversational bot setup | **Live verified**: Evidence Clerk created through `relay_create_bot`, visible in durable SQLite after restart                                                                                      |
| Delegation and synthesis | **Live verified**: exactly two linked Codex helpers completed; parent called `relay_wait_children`, read outcomes, synthesized, and wrote a real comparison artifact                               |
| Memory                   | **Live retrieval verified** for an owner decision; automated FTS provenance, guessed-ID isolation, exclusion, correction, and deletion tests                                                       |
| Permissions              | Automated runtime and actual Electron IPC tests: no caller-supplied identity, no helper recursion/elevation/self-approval, exact changed-action rejection, and stale decision rejection            |
| Claude adapter           | **Real SDK MCP integration verified locally** using in-memory protocol transports; normalized stream/auth-error behavior fixture-tested. **Live model execution blocked by missing API key**       |
| Queue/retry              | Real SQLite tests using two connections: one claim, retained attempts, frozen configuration, transactional transitions, receipts, and archived ownership                                           |
| Cancellation             | Runtime parent/child/approval races tested; owned protocol process closure tested while a distinct process remained alive. No claim of live provider tree-cancellation coverage                    |
| Crash recovery           | **Actual Electron abrupt exit tested** with pending work; restart retained history, marked the task interrupted, and expired the exact pending decision without replay                             |
| Schedules                | Automated real database tests for unique occurrence IDs, bounded catch-up, non-overlap, edit identity, weekdays and DST folds/gaps; actual Electron form creation/disable path available           |
| Engine/model switch      | Runtime fixture tests switch between Codex and Claude adapters with a new session and explicit handoff. Native cross-engine session reuse is intentionally unsupported                             |
| Artifacts                | Actual files, byte counts and hashes; traversal, escaping junctions, unsafe filename/type, changed content, and source deletion tested                                                             |
| Packaging                | **Actual `Relay.exe` verified** with built-in SQLite and bundled SDK native executable; a real Codex result persisted after close/reopen                                                           |
| Offline demo             | Physically separate database/artifacts; actual local orchestration driven by labelled deterministic fixtures. Successful delegation, denial, failed helper, and retained retry exercised           |
| Accessibility            | Default conversation screen has zero automated A/AA violations; keyboard composer shortcut, modal focus boundary, escape, and narrow layout tested. This is not a full screen-reader certification |
| Optional computer        | **Probe only**: Podman/Docker absent; no guest provisioned. Lifecycle, streamed desktop, and guest browser/screenshot acceptance remain unmet                                                      |

The local proof files are `.cache/live-first-result.json`, `.cache/live-delegation-result.json`, `.cache/packaged-verification.json`, and `.cache/web-verification.json`. A compact durable copy is in [evidence/local-verification.json](evidence/local-verification.json). No fixture is marked as an API response in the real workspace.

## Desktop screenshots inspected

- [Default conversation](screenshots/01-conversation.png)
- [Offline delegation and synthesis](screenshots/02-delegation-demo.png)
- [Exact approval card — offline fixture](screenshots/03-approval-demo.png)
- [Failed parent with recovered helper — offline fixture](screenshots/04-recovery-demo.png)
- [Compact Windows layout — offline fixture](screenshots/05-compact-demo.png)
- [Packaged live Codex result](screenshots/06-packaged-live-codex.png)

These are captures of actual Electron windows, not design mockups. Default and 1000×740 logical window sizes were exercised under Windows display scaling. Scrollable history intentionally remains scrollable; no horizontal viewport overflow was found.

## Concrete remaining dependencies and deviations

1. **Claude live execution:** requires an owner-supplied Anthropic API key and explicit supported model choice. SDK contracts, real local MCP dispatch, package inclusion and native executable are verified; no paid Claude call was attempted. Subscription tokens were not reused.
2. **Optional virtual computer:** Podman and Docker are absent. The app implements prerequisite probing, not a completed guest backend. Creating/starting/stopping/deleting an app-owned computer, streaming its desktop, and performing a guest browser action with screenshot evidence still require implementation after intentional provisioning. No administrative prerequisite, guest image, host socket mount, or fake VM display was introduced.
3. **Continuity/retry tradeoff:** fresh provider sessions use explicit scoped handoffs; interrupted work requires user inspection and retry. Relay does not automatically replay uncertain tool calls. Provider transient retries are bounded by the overall run limit; automatic task-level backoff is not implemented.
4. **Tool scope:** public-page text retrieval and selected-folder reads are supported. Arbitrary host command execution, third-party MCP import UI, unrestricted browsing/computer control, tray hosting, and external notifications are not shipped. The local provider process is not claimed to be a VM sandbox.

See [architecture](architecture.md) for the security and storage decisions and [demo script](demo-script.md) for a reproducible five-minute walkthrough.
