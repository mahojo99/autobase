import { fetchPublicPage } from '../src/runtime/files';
import { writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const result = await fetchPublicPage('https://example.com/', AbortSignal.timeout(20000));
assert.match(result.text, /Example Domain/);
writeFileSync('.cache/web-verification.json', JSON.stringify(result, null, 2));
console.log(
  `LIVE HTTP PASS: ${result.url}, ${result.text.length} characters. No model or browser/VM involved.`,
);
