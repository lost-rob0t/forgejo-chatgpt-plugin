import { timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';

const MAX_REQUEST_BYTES = 1024 * 1024;
const MODERN_PROTOCOL_VERSION = '2026-07-28';
const PROTOCOL_VERSION_META = 'io.modelcontextprotocol/protocolVersion';

function headerValue(value) {
  if (Array.isArray(value)) return value[0];
  return value;
}

function unauthorized(response) {
  response.writeHead(401, {
    'Content-Type': 'application/json; charset=utf-8',
    'WWW-Authenticate': 'Bearer realm="forgejo-chatgpt-plugin"',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  response.end(JSON.stringify({ error: 'unauthorized' }));
}

function bearerMatches(request, expected) {
  if (!expected) return true;
  const value = headerValue(request.headers.authorization);
  if (!value?.startsWith('Bearer ')) return false;

  const supplied = Buffer.from(value.slice('Bearer '.length));
  const wanted = Buffer.from(expected);
  if (supplied.byteLength !== wanted.byteLength) return false;
  return timingSafeEqual(supplied, wanted);
}

function isJsonContentType(request) {
  const value = headerValue(request.headers['content-type']);
  return typeof value === 'string' && /^application\/json(?:\s*;|$)/i.test(value);
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
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...(protocolVersion ? { 'MCP-Protocol-Version': protocolVersion } : {}),
  });
  response.end(body);
}

function requestContext(request) {
  return {
    protocolVersion: headerValue(request.headers['mcp-protocol-version']),
    methodHeader: headerValue(request.headers['mcp-method']),
    nameHeader: headerValue(request.headers['mcp-name']),
  };
}

function bodyProtocolVersion(message) {
  return message?.params?._meta?.[PROTOCOL_VERSION_META];
}

function modernRequest(message, context) {
  return (
    context.protocolVersion === MODERN_PROTOCOL_VERSION ||
    bodyProtocolVersion(message) === MODERN_PROTOCOL_VERSION
  );
}

function rpcStatus(result, modern) {
  if (!modern || !result?.error) return 200;
  return [-32602, -32020, -32022].includes(result.error.code) ? 400 : 200;
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

      if (request.method !== 'POST') {
        response.writeHead(405, { Allow: 'POST' });
        response.end();
        return;
      }

      if (!isJsonContentType(request)) {
        json(response, 415, {
          jsonrpc: '2.0',
          id: null,
          error: { code: -32600, message: 'Content-Type must be application/json' },
        });
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

      const context = requestContext(request);
      const modern = modernRequest(message, context);
      const result = await handleMessage(client, message, context);
      if (result === null) {
        response.writeHead(202, {
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
        });
        response.end();
        return;
      }

      json(
        response,
        rpcStatus(result, modern),
        result,
        result.result?.protocolVersion ?? context.protocolVersion,
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
