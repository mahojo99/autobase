# Third-party components

Autobase's application code and letterform were written for this independent project, originally named Relay. OpenMausBot was general product inspiration in the owner's brief. Grok Bot's conversational layout informed the owner's dark-mode redesign request; no code or visual assets from either product were reused. The owner selected Transformers bot names and supplied Bumblebee and Autobot emblems. Five additional character portraits were generated for this local app. These depict existing Transformers characters; they are not claimed as original characters or official artwork. Asset provenance and prompts are in [the portrait notes](src/ui/assets/bots/README.md).

Runtime dependencies include Electron, React, Luxon, Zod, react-markdown, remark-gfm, Lucide React, the official MCP TypeScript SDK, and the official Anthropic Claude Agent SDK. SQLite is supplied by Electron's embedded Node runtime. Build and verification use Vite, esbuild, TypeScript, Electron Packager, Playwright, axe-core, tsx, and Prettier.

Exact versions are pinned in `package-lock.json`. Component licenses remain in the installed packages; Electron's distribution contains its Chromium and third-party notices. The Anthropic SDK and bundled native executable remain subject to Anthropic's included license/terms. Codex is separately installed and is not copied into Autobase's distribution. Provider authentication and service terms remain with each provider.

References: [Electron](https://www.electronjs.org/), [React](https://react.dev/), [Claude Agent SDK](https://code.claude.com/docs/en/agent-sdk/overview), [Codex App Server](https://learn.chatgpt.com/docs/app-server), [OpenMausBot inspiration](https://github.com/milind-soni/OpenMausBot).
