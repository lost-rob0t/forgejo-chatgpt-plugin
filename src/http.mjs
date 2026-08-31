import { createServer } from 'node:http';

const MAX_REQUEST_BYTES = 1024 * 1024;

function unauthorized(response) {
  response.writeHead(401, {
    'Content-Type': 'application/json; charset=utf-8',
    'WWW-Authenticate': 'Bearer',
  });
  response.end(JSON.stringify({ error: 'unauthorized' }));
}

function bearerMatches(request, expected) {
  if (!expected) return true;
  const value = request.headers.authorization;
  if (!value?.startsWith('Bearer ')) return false;
  return value.slice('Bearer '.length) === expected;
}

async function readJson(request) {
  const chunks = [];
  let size = 0;

  for await (const chunk of request) {
    size += chunk.byteLength;
    if (size > MAX_REQUEST_BYTES) throw new Error('request body too large');
    chunks.push(chunk);
  }

  if (chunks.length === 0) throw new Error('request body is empty');
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function json(response, status, value, protocolVersion) {
  const body = JSON.stringify(value);
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    ...(protocolVersion ? { 'MCP-Protocol-Version': protocolVersion } : {}),
  });
  response.end(body);
}

export function createMcpHttpServer({ client, handleMessage, inboundBearerToken }) {
  return createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? '/', 'http://localhost');

      if (url.pathname === '/healthz') {
        if (request.method !== 'GET') {
          response.writeHead(405, { Allow: 'GET' });
          response.end();
          return;
        }
        json(response, 200, { ok: true });
        return;
      }

      if (url.pathname !== '/mcp') {
        response.writeHead(404);
        response.end();
        return;
      }

      if (!bearerMatches(request, inboundBearerToken)) {
        unauthorized(response);
        return;
      }

      if (request.method === 'GET') {
        response.writeHead(405, { Allow: 'POST' });
        response.end();
        return;
      }
      if (request.method !== 'POST') {
        response.writeHead(405, { Allow: 'POST' });
        response.end();
        return;
      }

      const message = await readJson(request);
      if (Array.isArray(message)) {
        json(response, 400, {
          jsonrpc: '2.0',
          id: null,
          error: { code: -32600, message: 'JSON-RPC batching is not supported' },
        });
        return;
      }

      const result = await handleMessage(client, message);
      if (result === null) {
        response.writeHead(202);
        response.end();
        return;
      }

      json(
        response,
        200,
        result,
        result.result?.protocolVersion ?? request.headers['mcp-protocol-version'],
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      json(response, 400, {
        jsonrpc: '2.0',
        id: null,
        error: { code: -32700, message: 'Parse error', data: message },
      });
    }
  });
}
