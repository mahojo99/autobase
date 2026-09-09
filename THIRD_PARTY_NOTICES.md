# Third-party components

Relay's application code and visual identity were written for this independent project. OpenMausBot was general product inspiration in the owner's brief; no code or branding was reused.

Runtime dependencies include Electron, React, Luxon, Zod, react-markdown, remark-gfm, Lucide React, and the official Anthropic Claude Agent SDK. SQLite is supplied by Electron's embedded Node runtime. Build and verification use Vite, esbuild, TypeScript, Electron Packager, Playwright, axe-core, tsx, and Prettier.

Exact versions are pinned in `package-lock.json`. Component licenses remain in the installed packages; Electron's distribution contains its Chromium and third-party notices. The Anthropic SDK and bundled native executable remain subject to Anthropic's included license/terms. Codex is separately installed and is not copied into Relay's distribution. Provider authentication and service terms remain with each provider.

References: [Electron](https://www.electronjs.org/), [React](https://react.dev/), [Claude Agent SDK](https://code.claude.com/docs/en/agent-sdk/overview), [Codex App Server](https://learn.chatgpt.com/docs/app-server), [OpenMausBot inspiration](https://github.com/milind-soni/OpenMausBot).
