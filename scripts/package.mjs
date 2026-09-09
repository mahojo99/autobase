import { packager } from '@electron/packager';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { copyFile, mkdir, rm, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { promisify } from 'node:util';
await import('./build.mjs');
const paths = await packager({
  dir: '.',
  name: 'Autobase',
  platform: 'win32',
  arch: 'x64',
  out: 'release',
  overwrite: true,
  icon: 'src/ui/assets/autobase.ico',
  asar: { unpack: '**/node_modules/@anthropic-ai/**' },
  prune: true,
  ignore: [
    /^\/(?=[^/])(?!(?:dist|node_modules)(?:\/|$)|package\.json$)/,
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
  await mkdir(join(directory, 'docs'), { recursive: true });
  await copyFile('docs/development.md', join(directory, 'docs/development.md'));
  await copyFile('docs/screenshot.png', join(directory, 'docs/screenshot.png'));

  const zipPath = resolve('release/Autobase-windows-x64.zip');
  await rm(zipPath, { force: true });
  await promisify(execFile)(
    'powershell.exe',
    [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      "$ErrorActionPreference = 'Stop'; Add-Type -AssemblyName System.IO.Compression.FileSystem; [IO.Compression.ZipFile]::CreateFromDirectory($env:AUTOBASE_PACKAGE_DIR, $env:AUTOBASE_ZIP_PATH, [IO.Compression.CompressionLevel]::Optimal, $true)",
    ],
    {
      windowsHide: true,
      env: { ...process.env, AUTOBASE_PACKAGE_DIR: resolve(directory), AUTOBASE_ZIP_PATH: zipPath },
    },
  );
  const digest = createHash('sha256');
  for await (const chunk of createReadStream(zipPath)) digest.update(chunk);
  await writeFile(`${zipPath}.sha256`, `${digest.digest('hex')}  ${basename(zipPath)}\n`);
  console.log(zipPath);
}
