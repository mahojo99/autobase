# Relay — desktop bot workspace

Version: 1.0, September 9, 2026. Working name and implementation choices remain adjustable; the orchestrator-first product direction is the owner's explicit request.

## 1. Purpose and product promise

Build an attractive, usable Windows desktop application in which a person talks to one persistent orchestrator and gets work done through bots. The orchestrator can set up specialist bots, assign tasks, consult shared context, monitor execution, and return a coherent answer with inspectable evidence.

This is an independent portfolio project demonstrating desktop engineering, agent integration, durable workflows, and interaction design. The first release does not require a SaaS backend, billing, a marketplace, or a new custom foundation model. It should solve a small set of real workflows convincingly and be understandable in a five-minute employer demo.

The owner liked OpenMausBot's general direction: a desktop harness with selectable engines and optional virtual computers. Build an original interpretation centred on orchestration and continuity. Neither replicate another product's branding nor claim that a new interface makes the underlying models more intelligent.

**Product sentence:** Tell Relay what you want; its orchestrator assembles the right help and keeps the work understandable from request to result.

## 2. Core experience

The default screen is a conversation with the workspace orchestrator. The user should not need to configure an org chart or understand agent protocols before giving it a task.

Example: “Create a research bot. Have it examine these three public product pages, then ask a reviewer to check the conclusions and give me a short comparison.” The orchestrator clarifies only genuinely missing information, creates a persistent researcher if requested, creates linked tasks, executes them using available tools, and synthesizes the findings. The interface shows real bot creation, queued/running work, source links, and the final artifact. If browsing is unavailable, it says so and offers supported input rather than inventing research.

Example: “What did we decide yesterday, and which bots are waiting for me?” The orchestrator retrieves relevant decisions and task states, links the original records, identifies blockers, and distinguishes the user's decisions from agent suggestions.

Example: “Every weekday at nine, summarize changes in this selected local project.” The orchestrator proposes an understandable local schedule with timezone and target folder. The user can inspect or edit it. The UI explains that scheduled work requires the runtime and computer to be available. No external message is sent by this example.

The user can also inspect or address a specialist directly. The orchestrator remains the central place to see shared work and request coordination. Direct specialist messages must not silently override permissions or hide related task outcomes from authorized workspace context.

## 3. Scope and delivery order

### Required core release

1. A packaged Electron app with thoughtful desktop UI and persistent local data.
2. A default orchestrator, persistent specialist bots, and conversational bot setup.
3. A durable task queue, run history, cancellations, retries, and restart recovery.
4. A real Codex adapter and a real Claude Agent SDK adapter with explicit readiness states.
5. Actual bounded delegation and result synthesis through runtime tools.
6. Workspace memory retrieval with provenance and context inspection.
7. User approvals and questions tied to the exact pending action or task.
8. Local schedules with truthful availability and missed-run behavior.
9. Artifacts and structured activity that make completion verifiable.
10. A clearly separated offline demo plus meaningful automated and desktop verification.

### Follow-on milestone in this build when prerequisites permit

A working optional local virtual computer backend with lifecycle controls, a visible desktop, and at least one real automated browser interaction. Complete the core before spending substantial time on virtualization. Probe prerequisites early so installation blockers are known. An unavailable VM must not prevent normal bot work; document the exact unverified acceptance criteria if the host cannot support this milestone.

### Deferred

Paid cloud computers, hosted always-on execution, shared team accounts, billing, public bot marketplace, arbitrary recursive agent swarms, mobile apps, voice, email sending, unrestricted host desktop control, dozens of connectors, and a bespoke model training stack. Generic ACP or OpenCode integration can follow the adapter contract; no third engine is needed to prove it.

## 4. Orchestrator and bot behavior

Each workspace has a default orchestrator with a stable identity and conversation history. A bot has a name, role, instructions, engine, model, tool permissions, environment, and workspace scope. A persistent bot is configuration and memory; it does not need a perpetually running process.

The orchestrator can list, create, edit, and archive bots through validated runtime operations. On “create a research bot,” use sensible defaults and display the resulting configuration. Do not demand approval for every reversible setup action the user has already requested. New sensitive capabilities, access to additional folders, and external effects follow the relevant approval policy.

Persistent bots and temporary helpers are distinct. Create a persistent bot when asked for a reusable specialist; use a temporary helper for one bounded assignment. Archiving a bot preserves historical ownership and results. Editing a bot does not retroactively alter the configuration recorded on a run.

Default to direct work for simple tasks. Delegate when a distinct research, review, or implementation assignment has a clear deliverable. The runtime enforces maximum helper count, concurrency, depth, and run limits. Initial defaults: one level of delegation and up to two concurrent helpers. Prevent cycles and self-delegation; do not use open-ended recursion.

A child assignment contains an objective, success criteria, selected context, allowed tools, environment, and limits. Its result records outcome, evidence, artifacts, uncertainty, and blockers. The parent waits durably, can see partial progress, and synthesizes the result when dependencies settle. A failed child must produce an explicit decision to retry, continue with a limitation, or ask the user. Never silently present a failed child's assignment as completed.

The runtime owns tool authorization and identity. An agent cannot approve itself, impersonate another bot by supplying an ID, increase its tool scope, or write arbitrary task states. Creating a child uses the intersection of inherited and configured permissions. Granting broader capabilities is a separate explicit user action.

## 5. Shared context and memory

“Total context” means workspace-wide visibility and retrieval, not an unlimited model context window. Construct an initial compact overview of bots, active tasks, important user-confirmed decisions, and relevant recent outcomes. Provide search/read tools for the rest.

Start with SQLite full-text search and structured metadata. A vector database is not required. Index conversations, task summaries, artifacts' text where appropriate, and memory records. Search results carry source IDs, dates, workspace scope, and snippets. Reads verify the same authorization as search; guessed IDs cannot cross workspace boundaries.

Memory records distinguish user decisions, preferences, observed facts, and agent hypotheses. Preserve source links and timestamps. Agent-proposed lasting conclusions remain labelled as such unless evidence or the user establishes them. Changed decisions supersede earlier entries without destroying the source history. Conflicting records are visible, not silently merged into a invented certainty.

Users can inspect, correct, delete, or exclude shared memory and source indexing. Deletion removes derived searchable content as well as the primary record where applicable. Private credentials never enter memory. Imported documents and web pages are untrusted content, not instructions that can alter permissions or the bot hierarchy.

Before delegating, package only relevant, authorized context; avoid copying every conversation into every child. On engine/model switches, start a compatible provider session with an explicit handoff summary when old session state is not portable. Keep the visible conversation continuous without claiming native provider sessions are interchangeable.

## 6. Tasks, runs, and queue semantics

Separate these entities:

| Entity | Meaning |
| --- | --- |
| Bot | Durable identity and configuration |
| Conversation | Messages and their workspace/bot context |
| Task | Requested outcome, owner, criteria, status, and relationships |
| Run | One execution attempt with a frozen configuration snapshot |
| Delegation | Parent/child assignment and dependency |
| Event | Ordered, durable observation of execution or state change |
| Artifact | A real output file or structured result associated with a run |
| Approval / question | A specific pending user decision |
| Schedule | A local trigger and its next occurrence |
| Memory record | Retrievable information with provenance |

Task states should cover queued, running, waiting for user input, waiting for approval, waiting for children, completed, failed, cancelled, and interrupted. Implement legal transitions centrally and transactionally. Provider process exit alone is not proof that the requested outcome succeeded.

Queue claims must be atomic and survive restarts without duplicate execution. Preserve attempts; retry creates a new run linked to the task. Apply backoff only to transient errors within limits. Authentication errors and denied approvals do not loop. Persist state and enough activity for a useful timeline without blocking every token on a separate database transaction.

Cancel stops owned execution and descendants, removes queued children from eligibility, and visibly acknowledges cancellation. Do not terminate unrelated processes on Windows. Handle races such as a result arriving after cancellation and a parent cancelled while a child awaits approval.

On restart, reconcile active leases/processes. Mark unknown execution interrupted; offer an explicit recovery choice or safe supported continuation. Do not replay uncertain external side effects. Persist tool-call IDs, approval decisions, and execution receipts for idempotent operations. A user can see what is known to have happened before retrying.

Expose configurable concurrency and per-run time/turn limits. If a provider exposes token usage or cost, show its reported values; otherwise show “not available.” Never fabricate savings, progress percentages, or token costs. Stop new work when limits are hit and explain the reason.

## 7. Engines, models, and authentication

An engine is the existing agent runtime: it owns model interaction and some tool-loop behavior. A model is a choice supported by that engine and account. Relay coordinates above engines; it should not pretend every model supports every capability.

Define a typed adapter interface for readiness, capabilities, model discovery/configuration, starting/resuming a run, normalized events, answering approvals/questions, cancellation, and cleanup. Record adapter and protocol versions. Normalize text deltas, tool activity, requests for user decisions, usage where available, artifacts, terminal outcomes, and errors.

Use Codex's supported local integration surface, preferably App Server where its approvals and session capabilities fit. Check installed versions and experimental protocol status; pin and test the supported boundary. Native supported login remains owned by the provider. Do not scrape UI text as the production event protocol or extract credentials from another app.

Use the official Claude Agent SDK for the second adapter with supported API authentication. Do not promise claude.ai subscription reuse in a third-party product: current SDK documentation requires prior approval for that offering. Store supplied credentials with OS-backed encryption outside renderer and logs. Display missing credentials and estimated billing implications plainly; do not make paid calls without authorization.

Provide states such as unavailable, installed, authentication required, ready, and error, with concrete next steps. Model choices come from discovery where available or an explicit editable configuration with validation; do not present a fabricated live model list. Unsupported features are disabled with reasons. A selectable engine must execute through its real adapter; offline fixtures are never presented as real service responses.

Implementation of both adapters is required. Live verification is limited by actual credentials and provider availability; report each independently. Missing Claude credentials must not block Codex work, tests, packaging, or the rest of the UI.

## 8. Tools and approvals

Expose orchestration operations through MCP or the supported native tool registration surface. Required operations include list/create/update bots, create/delegate tasks, read task outcomes, search/read context, register artifacts, and ask the user. Use validated schemas and task-scoped authentication. Keep secrets out of arguments, transcripts, and renderer state.

Tool permissions have clear scopes: selected workspace files, permitted web access, and optional isolated computer. A proposed command or browser action must not bypass policy merely because it comes from a delegate or a third-party MCP tool. Imported MCP servers are executable integrations; defer a public marketplace and use an explicit local configuration flow.

Approval cards show the bot, task, exact action, target, reason, and options supported by the engine. Denial is a first-class result. One-time approval must not become persistent permission. Approval is invalid if the action or target changes. A pending card survives reload, but stale or expired requests cannot execute.

Do not build blanket prompts for every local file read or internal bot setup. Respect permissions already granted and the user's explicit instruction. Purchases, external communication, destructive operations, or broader access need suitable authorization. The orchestrator can explain and route approval, but only the user can grant it.

## 9. Optional virtual computer

Target a local Linux desktop running in a container via a supported runtime; on Windows this commonly also involves a Linux VM. Prefer Podman after checking current support. Document the actual boundary and prerequisites. A working directory by itself is not a virtual machine or a sandbox.

Probe runtime presence, machine status, hardware virtualization prerequisites, disk space, and resource availability. Do not silently install administrative prerequisites, download unbounded images, or provision paid cloud services. Give a clear unavailable state and setup instructions; let the owner start optional provisioning intentionally.

The backend needs create/start/stop/status/delete controls for app-owned environments; deletion requires explicit confirmation of the selected environment's data. Persist selected workspace data and profiles intentionally. Limit resource use and default to one computer at a time. Do not mount the user's whole home, provider credential directories, or host control sockets into a guest.

Provide a visible streamed desktop and a tool bridge for at least a browser navigation plus a screenshot artifact. Inspect tool results and register actual artifacts. The guest does not acquire host permissions. If the model engine runs on the host, restrict its builtin host tools too; a guest browser alone does not sandbox the entire agent. Describe any remaining trust boundary honestly.

Acceptance requires a real lifecycle test and real browser action when prerequisites exist. If not, implement/probe what can be tested and mark runtime integration unverified. Never use a prerecorded screenshot to imply a live VM.

## 10. Schedules and notifications

Support one-off and simple recurring local schedules, named timezone, next-run preview, enable/disable, and execution history. The app may stay running in a tray if implemented and disclosed. Closing/exiting and computer sleep must have predictable documented consequences. No claim of server-backed always-on work.

Use durable occurrence IDs to prevent duplicates. On wake/relaunch, show missed work and default to coalescing into at most one catch-up run rather than replaying every missed occurrence. Handle timezone changes and daylight-saving transitions deliberately. Do not overlap a schedule's previous run by default.

Use an in-app inbox for blocked work, completed results, and failures. Optional desktop notifications link back to the relevant task and respect user settings. No email or chat integrations are necessary for V1.

## 11. Interface and visual direction

Create a calm, distinctive desktop workspace. Default to the orchestrator conversation with a compact sidebar for workspace, bots, tasks, and settings. An optional details pane shows active work, sources, or artifacts without pushing the conversation into a tiny column. Aim for excellent readability at normal desktop sizes, sensible resizing, and keyboard access.

Use intentional typography, spacing, restrained accent colour, and clear hierarchy. Tool and task activity should collapse into readable summaries and expand into useful details. A simple linked task tree belongs inside the task view; an elaborate animated graph is not required. Avoid marketing hero sections, empty KPI cards, oversized gradients, and decorative dashboards.

Bot creation and delegation should be visible as compact actionable cards in the conversation. Show actual engine/model, environment, scope, and task state. Provide edit, inspect, cancel, retry, and open-result controls where appropriate. Use subtle transitions for expanding panels, status changes, and streaming; respect reduced motion and avoid distracting perpetual animations.

Handle empty, disconnected, authentication-required, loading, failed, cancelled, waiting, and completed states with specific copy. Support keyboard focus, accessible names, readable contrast, and sensible scroll behavior during streaming. Render untrusted Markdown without arbitrary HTML/script execution, and open approved external links safely outside privileged app content.

Offline demonstration is valuable for employers: make a clearly labelled Demo workspace with deterministic scenarios. Keep its database and artifacts separate from real work. Demonstrate a successful delegation, an approval, a failed helper, and recovery. The demo must never claim API or VM connectivity.

## 12. Architecture and storage

Recommended stack: Electron, React, TypeScript, a maintained build toolchain, SQLite, and a small typed local runtime. Choose maintained versions and document the project Node requirement. Electron main manages app lifecycle; preload exposes narrow typed IPC; renderer has no Node integration. Run provider processes and long tasks in a runtime process or appropriate utility process so UI rendering remains responsive.

Use context isolation and sandboxing where supported. Validate IPC sender and payloads; do not expose arbitrary filesystem, process, or shell access through generic renderer commands. Prefer local IPC/stdio. If a loopback service is necessary, authenticate clients, validate origins, and avoid unauthenticated privileged endpoints.

SQLite has versioned migrations, transactional state changes, indexed retrieval, and foreign-key constraints. Store files under app-managed workspace directories and register metadata in the database. Validate canonical paths and links to prevent artifact traversal. Avoid a backend service fleet or a cloud database for a single-user desktop app.

Maintain separation between domain scheduling/orchestration, engine adapters, permission policy, context retrieval, and presentation. Shared contracts should not import Electron into testable domain modules. Keep streaming reconnect/replay deterministic with sequence IDs, and redact secrets from diagnostics. Bound logs and show users where their data lives.

## 13. Verification and acceptance

Test behaviors and failure boundaries, not implementation-shaped trivialities. A green browser screenshot alone is insufficient for a desktop app.

| Scenario | Required evidence |
| --- | --- |
| Fresh launch | Packaged Windows app opens; missing engines have actionable readiness states |
| Real chat | Available Codex engine streams a bounded task and produces a genuine result |
| Second engine | Claude adapter contract/integration tests pass; live check separately identified as verified or credential-blocked |
| Conversational setup | Orchestrator tool creates an actual persistent bot visible after restart |
| Delegation | Parent launches linked helpers, receives structured outcomes, and synthesizes; no fabricated progress |
| Memory | Relevant prior result and decision retrieved with source; unrelated workspace inaccessible |
| Permissions | Child cannot escalate scope or approve its own action; changed action invalidates approval |
| Queue | Concurrent claims do not duplicate a task; retries preserve prior attempts |
| Cancellation | Parent and owned descendants stop; unrelated processes survive |
| Crash recovery | Restart retains history and pending work; uncertain side effects are not blindly replayed |
| Schedules | Due task is queued once; wake catch-up is bounded; timezone behavior tested |
| Model switch | Unsupported session reuse avoided; handoff summary and provider identity visible |
| Artifacts | Real output can be opened; traversal and unsafe content rejected |
| Packaging | SQLite/native dependencies load in packaged app; data survives close and reopen |
| Demo | Runs offline in explicitly labelled isolated data; fixture results never appear as live service work |
| Virtual computer | Missing prerequisites reported truthfully; if available, actual lifecycle and browser/screenshot evidence |

Use unit tests for transitions, permissions, context scope, idempotence, and scheduler behavior. Use adapter protocol fixtures for edge cases, runtime integration tests for persistence and orchestration, and Electron end-to-end tests for critical user flows. Run a bounded live provider smoke test only where supported authentication and authorization exist. Capture actual app screenshots at useful sizes and inspect them. Use mocked events for automated tests, clearly labelled, not as a product substitute.

## 14. Milestones and completion report

1. Verify environment and docs; record architecture, protocols, and scope decisions. Bootstrap app and durable schema.
2. Deliver one vertical slice: orchestrator chat through Codex, real streaming, persisted task/run, result, restart.
3. Add actual bot setup, delegation, shared-context retrieval, permission flow, and parent synthesis.
4. Add the second adapter, recovery, schedule behavior, and deterministic demo scenarios.
5. Polish core UI, test Electron and packaged Windows operation, and fix findings.
6. Complete the optional local computer integration to the extent host prerequisites permit; report evidence and remaining requirements separately.

At completion supply runnable commands, a local package path, architecture notes, a short five-minute demo script, screenshots, exact test results, and an honest feature/verification matrix. Document material deviations and the next few specific tasks, not a broad speculative roadmap. Keep source code original and attribute relevant external components. No public release, paid infrastructure, or commercial launch is part of this brief.
