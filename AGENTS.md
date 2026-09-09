# Autobase development

Read [docs/development.md](docs/development.md) before implementing. This is an independent project; do not import private company context or modify unrelated repositories.

Keep the persistent orchestrator conversation central. Bots must perform real tasks, retrieve shared context and collect results. Keep the interface simple and dark.

Privileged work belongs in the runtime, outside the sandboxed Electron renderer. The runtime owns authorization, identity and durable state transitions. Agent output cannot grant permissions. Do not repeatedly confirm reversible configuration the owner already requested.

Use current primary documentation, inspect installed versions and test actual integration boundaries. Never present fixtures as live provider verification. Use supported native authentication without extracting or copying credentials.

Verify affected behavior and packaging. Keep documentation concise and factual, with concrete limitations. Do not purchase services, deploy, publish releases or send external messages without the owner's authorization.
