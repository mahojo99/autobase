import { packager } from '@electron/packager';
import { copyFile, cp, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
await import('./build.mjs');
const paths = await packager({
  dir: '.',
  name: 'Autobase',
  platform: 'win32',
  arch: 'x64',
  out: 'release',
  overwrite: true,
  asar: { unpack: '**/node_modules/@anthropic-ai/**' },
  prune: true,
  ignore: [
    /^\/(?:\.git|\.cache|\.tooling|\.relay-data|test-results|playwright-report|release|tests|scripts|src|docs|credentials|runtime-data|\.local)(?:\/|$)/,
    /(?:^|\/)\.env(?:\.|$)/,
    /\.(?:pem|key|sqlite|db)(?:-|$)/,
  ],
  executableName: 'Autobase',
  win32metadata: {
    CompanyName: 'Autobase',
    FileDescription: 'Autobase bot workspace',
    ProductName: 'Autobase',
  },
});
console.log(paths.join('\n'));
for (const directory of paths) {
  await copyFile('README.md', join(directory, 'README.md'));
  await copyFile('THIRD_PARTY_NOTICES.md', join(directory, 'THIRD_PARTY_NOTICES.md'));
  await cp('docs', join(directory, 'docs'), { recursive: true });
  const notes = join(directory, 'src/ui/assets/bots');
  await mkdir(notes, { recursive: true });
  await copyFile('src/ui/assets/bots/README.md', join(notes, 'README.md'));
}
