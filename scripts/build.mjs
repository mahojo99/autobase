import { build } from 'esbuild';
import { build as viteBuild } from 'vite';
import { copyFile } from 'node:fs/promises';
await build({
  entryPoints: ['src/main.ts', 'src/preload.ts', 'src/runtime/worker.ts'],
  outdir: 'dist',
  outbase: 'src',
  bundle: true,
  platform: 'node',
  target: 'node24',
  format: 'cjs',
  outExtension: { '.js': '.cjs' },
  external: ['electron', '@anthropic-ai/claude-agent-sdk'],
  sourcemap: true,
});
await viteBuild({ base: './', build: { outDir: 'dist/ui', emptyOutDir: true } });
await copyFile('src/ui/assets/autobase.ico', 'dist/autobase.ico');
