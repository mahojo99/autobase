import { createServer } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import type { EngineInput } from './types';
import { safeError } from './types';

/** Per-run capability endpoint. Never exposed to the renderer or written to history. */
export async function startToolBridge(input: EngineInput) {
  const token = randomBytes(32).toString('hex');
  const expected = Buffer.from(`Bearer ${token}`);
  const calls = new Map<string, { fingerprint: string; result: Promise<any> }>();
  const connections = new Set<Server>();
  let closed = false;
  let host = '';
  const http = createServer(async (req, res) => {
    const auth = Buffer.from(req.headers.authorization ?? '');
    if (
      closed ||
      input.signal.aborted ||
      req.headers.host !== host ||
      req.headers.origin ||
      auth.length !== expected.length ||
      !timingSafeEqual(auth, expected)
    ) {
      res.writeHead(403).end();
      return;
    }
    if (req.url !== '/mcp') {
      res.writeHead(404).end();
      return;
    }
    if (req.method !== 'POST') {
      res.writeHead(405).end();
      return;
    }
    let server: Server | undefined;
    try {
      let body = '';
      for await (const chunk of req) {
        body += chunk.toString();
        if (body.length > 1_000_000) {
          res.writeHead(413).end();
          return;
        }
      }
      const message = JSON.parse(body);
      server = new Server({ name: 'autobase', version: '0.1.0' }, { capabilities: { tools: {} } });
      connections.add(server);
      server.setRequestHandler(ListToolsRequestSchema, async () => ({
        tools: input.tools.map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: t.schema as any,
        })),
      }));
      server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
        if (closed || input.signal.aborted) throw new Error('Run stopped.');
        const { name, arguments: args } = request.params;
        if (!input.tools.some((t) => t.name === name)) throw new Error('Tool is outside this run.');
        const id = `native-mcp:${extra.requestId}`;
        const fingerprint = JSON.stringify({ name, args });
        const previous = calls.get(id);
        if (previous && previous.fingerprint !== fingerprint)
          throw new Error('Tool request ID reused with different arguments.');
        if (previous) return previous.result;
        if (calls.size >= 1000) throw new Error('Tool receipt limit reached.');
        const result = input.callTool(name, args, id).then(
          (value) => ({ content: [{ type: 'text' as const, text: JSON.stringify(value) }] }),
          (error) => ({
            isError: true,
            content: [{ type: 'text' as const, text: safeError(error) }],
          }),
        );
        calls.set(id, { fingerprint, result });
        return result;
      });
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      });
      const current = server;
      res.on('close', () => {
        connections.delete(current);
        void current.close();
      });
      await server.connect(transport);
      await transport.handleRequest(req, res, message);
    } catch {
      if (!res.headersSent) res.writeHead(400).end();
      else res.end();
      if (server) {
        connections.delete(server);
        await server.close();
      }
    }
  });
  http.requestTimeout = 30000;
  http.headersTimeout = 10000;
  await new Promise<void>((resolve, reject) => {
    http.once('error', reject);
    http.listen(0, '127.0.0.1', resolve);
  });
  host = `127.0.0.1:${(http.address() as { port: number }).port}`;
  async function close() {
    if (closed) return;
    closed = true;
    input.signal.removeEventListener('abort', abort);
    await Promise.allSettled([...connections].map((s) => s.close()));
    http.closeAllConnections();
    await new Promise<void>((resolve) => http.close(() => resolve()));
  }
  const abort = () => {
    void close();
  };
  input.signal.addEventListener('abort', abort, { once: true });
  if (input.signal.aborted) await close();
  return { url: `http://${host}/mcp`, token, close };
}
