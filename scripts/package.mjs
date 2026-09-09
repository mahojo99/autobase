import { packager } from '@electron/packager';
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
