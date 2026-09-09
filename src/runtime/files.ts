import { realpath, stat, readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { request } from 'node:https';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import type { Artifact, ContextRecord } from '../shared/contracts';
import { now, Store, uid } from './store';
import { redact } from './redaction';

export function isWithin(root: string, target: string): boolean {
  const rel = relative(root, target);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}
export async function scopedPath(root: string, path: string): Promise<string> {
  if (
    path.includes('\0') ||
    path.includes(':') ||
    isAbsolute(path) ||
    path
      .split(/[\\/]/)
      .some((p) => p.startsWith('.') || /^(credentials?|secrets?|auth\.json)$/i.test(p))
  )
    throw new Error('Use a relative non-secret workspace path.');
  const canonicalRoot = await realpath(root);
  const canonical = await realpath(resolve(root, path));
  if (!isWithin(canonicalRoot, canonical))
    throw new Error('Path escapes the selected workspace folder.');
  return canonical;
}
export async function readWorkspace(root: string, path: string) {
  const target = await scopedPath(root, path);
  const info = await stat(target);
  if (info.isDirectory())
    return {
      path,
      entries: (await readdir(target, { withFileTypes: true }))
        .filter((d) => !d.name.startsWith('.'))
        .slice(0, 150)
        .map((d) => ({ name: d.name, type: d.isDirectory() ? 'directory' : 'file' })),
    };
  if (info.size > 200000) throw new Error('File exceeds the 200 KB read limit.');
  const text = await readFile(target, 'utf8');
  if (text.includes('\0')) throw new Error('Only text files are supported.');
  return { path, text: redact(text), modifiedAt: info.mtime.toISOString() };
}
export async function createArtifact(
  store: Store,
  taskId: string,
  runId: string,
  name: string,
  content: string,
): Promise<Artifact> {
  content = redact(content);
  if (!/^[\p{L}\p{N} _.-]{1,100}\.(md|txt|json|csv)$/u.test(name) || name.includes('..'))
    throw new Error('Use a simple .md, .txt, .json, or .csv filename.');
  if (Buffer.byteLength(content) > 1_000_000) throw new Error('Artifact exceeds 1 MB limit.');
  const id = uid('artifact');
  const relativePath = `${id}/${name}`;
  const dir = join(store.dir, 'artifacts', id);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, name), content, { encoding: 'utf8', flag: 'wx' });
  const a: Artifact = {
    id,
    taskId,
    runId,
    name,
    relativePath,
    bytes: Buffer.byteLength(content),
    sha256: createHash('sha256').update(content).digest('hex'),
    createdAt: now(),
  };
  store.artifact(a);
  store.index({
    id,
    kind: 'artifact',
    text: content,
    sourceId: id,
    createdAt: a.createdAt,
    excluded: false,
    supersedes: null,
    authority: 'agent',
  });
  return a;
}
export async function artifactPath(store: Store, id: string) {
  const a = store.need<Artifact>('artifacts', id);
  const root = await realpath(join(store.dir, 'artifacts'));
  const path = await realpath(join(root, a.relativePath));
  if (!isWithin(root, path)) throw new Error('Artifact path rejected.');
  if (!/\.(md|txt|json|csv|png)$/i.test(path)) throw new Error('Unsupported artifact type.');
  const data = await readFile(path);
  if (createHash('sha256').update(data).digest('hex') !== a.sha256)
    throw new Error('Artifact changed on disk. Inspect it in the data folder.');
  return path;
}
export function publicAddress(ip: string): boolean {
  if (isIP(ip) !== 4) return false; // Deliberately IPv4-only until equivalent IPv6 policy is verified.
  const [a, b, c] = ip.split('.').map(Number);
  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 168 || b === 0 || b === 2)) ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
    (a === 203 && b === 0 && c === 113)
  );
}
export async function fetchPublicPage(
  urlText: string,
  signal: AbortSignal,
  redirects = 0,
): Promise<{ url: string; text: string; fetchedAt: string }> {
  const url = new URL(urlText);
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443'))
    throw new Error('Only public HTTPS pages without credentials are supported.');
  const addresses = await lookup(url.hostname, { family: 4, all: true });
  if (!addresses.length || addresses.some((a) => !publicAddress(a.address)))
    throw new Error('Private, local, and reserved network targets are blocked.');
  if (redirects > 4) throw new Error('Too many redirects.');
  // Pin the validated address to close the DNS validation/request race.
  return await new Promise((resolveResult, reject) => {
    const req = request(
      url,
      {
        signal,
        lookup: (_host, opts, cb: any) =>
          opts.all ? cb(null, [addresses[0]]) : cb(null, addresses[0].address, 4),
        timeout: 15000,
        headers: {
          'User-Agent': 'Autobase/0.1 public-page-reader',
          Accept: 'text/html,text/plain,application/json',
        },
      },
      (res) => {
        if (
          res.statusCode &&
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location
        ) {
          res.resume();
          const redirected = new URL(res.headers.location, url);
          // An exact URL approval cannot authorize an unrelated target.
          if (redirected.origin !== url.origin)
            return reject(
              new Error(`Page redirects to ${redirected.origin}; request that URL separately.`),
            );
          void fetchPublicPage(redirected.href, signal, redirects + 1).then(resolveResult, reject);
          return;
        }
        if (res.statusCode !== 200) {
          res.resume();
          reject(new Error(`Page returned HTTP ${res.statusCode}`));
          return;
        }
        if (!/text\/|application\/json/.test(res.headers['content-type'] ?? '')) {
          res.resume();
          reject(new Error('Only text pages are supported.'));
          return;
        }
        let bytes = 0;
        const parts: Buffer[] = [];
        res.on('data', (chunk: Buffer) => {
          bytes += chunk.length;
          if (bytes > 1_000_000) req.destroy(new Error('Page exceeds 1 MB limit.'));
          else parts.push(chunk);
        });
        res.on('error', reject);
        res.on('end', () =>
          resolveResult({
            url: url.href,
            text: Buffer.concat(parts)
              .toString('utf8')
              .replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
              .replace(/<[^>]*>/g, ' ')
              .replace(/\s+/g, ' ')
              .slice(0, 30000),
            fetchedAt: now(),
          }),
        );
      },
    );
    req.on('timeout', () => req.destroy(new Error('Page request timed out.')));
    req.on('error', reject);
    req.end();
  });
}
