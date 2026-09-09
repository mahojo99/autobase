# Implementation references

Prepared September 9, 2026. Verify current versions and protocol details during implementation. These references inform an original implementation; they are not a request to copy another product's code or branding.

## Engines and protocols

- [Codex App Server](https://learn.chatgpt.com/docs/app-server): custom clients, streaming, sessions, authentication, and approvals. Check its experimental status, pin the tested CLI/protocol version, and negotiate capabilities. Prefer its supported local transport to scraping terminal text.
- [Codex SDK](https://learn.chatgpt.com/docs/codex-sdk): alternative integration surface; evaluate whether it exposes the required approval and orchestration capabilities before substituting it.
- [Claude Agent SDK overview](https://code.claude.com/docs/en/agent-sdk/overview): official agent runtime, tool use, sessions, MCP, and permission integration. Its documentation restricts third-party products from offering claude.ai login or subscription limits without prior approval. Use supported API authentication for this adapter; do not promise subscription reuse. Label this integration Claude Agent or Claude, not a product impersonating Claude Code.
- [Agent Client Protocol architecture](https://agentclientprotocol.com/get-started/architecture): possible later standardized engine adapter. Engine integration and MCP tool integration serve different purposes.
- [OpenCode providers](https://opencode.ai/docs/providers/) and [server](https://opencode.ai/docs/server/): reference for a later broader provider engine. Not a requirement to add a third engine in V1.

## Reference product and virtual computers

- [Designing Grok Bot](https://x.ai/news/designing-grok-bot): added for the owner's September 9 visual redesign request. Reference for a bot list, quiet conversation, and progressively disclosed work details. Autobase uses original code and visual assets.

- [OpenMausBot repository](https://github.com/milind-soni/OpenMausBot) and [documentation](https://docs.openmausbot.com/docs): inspiration endorsed by the owner. Review relevant licenses before reusing anything. Prefer original code and cite architectural inspiration.
- [OpenMausBot engine guide](https://github.com/milind-soni/OpenMausBot/blob/main/docs/custom-engines.md): reference for normalized events and engine-specific adapters.
- [OpenMausBot local VM](https://docs.openmausbot.com/docs/computers/local-vm): containerized Linux desktops using Docker or Podman, with Podman preferred for Windows in that implementation. A container desktop and its underlying VM are distinct layers.
- [Podman Desktop](https://podman-desktop.io/): local runtime option; software availability does not imply prerequisites are already installed or host resources are unlimited.

## Desktop platform

- [Electron security](https://www.electronjs.org/docs/latest/tutorial/security)
- [Electron process model](https://www.electronjs.org/docs/latest/tutorial/process-model)
- [Electron safeStorage](https://www.electronjs.org/docs/latest/api/safe-storage)

On the preparation machine, Node was v20.17.0 and Codex and Claude CLI executables were present. These observations do not prove adapter authentication, compatible versions, VM availability, or successful integration. Check them again. Use a suitable project-scoped runtime where necessary instead of replacing the owner's global Node installation.
