import assert from 'node:assert/strict';
import test from 'node:test';
import { once } from 'node:events';
import { createMcpHttpServer } from '../src/http.mjs';
import {
  handleMcpMessage,
  MODERN_PROTOCOL_VERSION,
} from '../src/protocol.mjs';

const PROTOCOL_VERSION_META = 'io.modelcontextprotocol/protocolVersion';

async function withServer(options, fn) {
  const server = createMcpHttpServer(options);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  try {
    await fn(`http://127.0.0.1:${address.port}`);
  } finally {
    server.close();
    await once(server, 'close');
  }
}

function modernMeta(protocolVersion = MODERN_PROTOCOL_VERSION) {
  return {
    [PROTOCOL_VERSION_META]: protocolVersion,
    'io.modelcontextprotocol/clientCapabilities': {},
  };
}

test('HTTP MCP endpoint handles legacy initialize and notifications', async () => {
  await withServer(
    {
      client: {},
      handleMessage: handleMcpMessage,
      inboundBearerToken: undefined,
    },
    async (base) => {
      const init = await fetch(`${base}/mcp`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: { protocolVersion: '2025-11-25' },
        }),
      });
      assert.equal(init.status, 200);
      assert.equal(init.headers.get('mcp-protocol-version'), '2025-11-25');

      const notification = await fetch(`${base}/mcp`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'notifications/initialized',
          params: {},
        }),
      });
      assert.equal(notification.status, 202);
    },
  );
});

test('HTTP MCP endpoint serves modern server/discover', async () => {
  await withServer(
    {
      client: {},
      handleMessage: handleMcpMessage,
      inboundBearerToken: undefined,
    },
    async (base) => {
      const response = await fetch(`${base}/mcp`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'mcp-protocol-version': MODERN_PROTOCOL_VERSION,
          'mcp-method': 'server/discover',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 'discover',
          method: 'server/discover',
          params: { _meta: modernMeta() },
        }),
      });

      assert.equal(response.status, 200);
      assert.equal(response.headers.get('mcp-protocol-version'), MODERN_PROTOCOL_VERSION);
      const body = await response.json();
      assert.equal(body.result.resultType, 'complete');
      assert.deepEqual(body.result.supportedVersions, [MODERN_PROTOCOL_VERSION]);
    },
  );
});

test('HTTP MCP endpoint returns 400 for modern routing header mismatch', async () => {
  await withServer(
    {
      client: {},
      handleMessage: handleMcpMessage,
      inboundBearerToken: undefined,
    },
    async (base) => {
      const response = await fetch(`${base}/mcp`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'mcp-protocol-version': MODERN_PROTOCOL_VERSION,
          'mcp-method': 'tools/list',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 2,
          method: 'server/discover',
          params: { _meta: modernMeta() },
        }),
      });

      assert.equal(response.status, 400);
      const body = await response.json();
      assert.equal(body.error.code, -32020);
    },
  );
});

test('HTTP MCP endpoint returns 400 for unsupported modern version', async () => {
  await withServer(
    {
      client: {},
      handleMessage: handleMcpMessage,
      inboundBearerToken: undefined,
    },
    async (base) => {
      const future = '2099-01-01';
      const response = await fetch(`${base}/mcp`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'mcp-protocol-version': future,
          'mcp-method': 'server/discover',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 'future',
          method: 'server/discover',
          params: { _meta: modernMeta(future) },
        }),
      });

      assert.equal(response.status, 400);
      const body = await response.json();
      assert.equal(body.error.code, -32022);
    },
  );
});

test('HTTP MCP endpoint rejects non-JSON content type', async () => {
  await withServer(
    {
      client: {},
      handleMessage: handleMcpMessage,
      inboundBearerToken: undefined,
    },
    async (base) => {
      const response = await fetch(`${base}/mcp`, {
        method: 'POST',
        headers: { 'content-type': 'text/plain' },
        body: '{}',
      });
      assert.equal(response.status, 415);
    },
  );
});

test('optional inbound bearer token fails closed', async () => {
  await withServer(
    {
      client: {},
      handleMessage: handleMcpMessage,
      inboundBearerToken: 'mcp-secret',
    },
    async (base) => {
      const denied = await fetch(`${base}/mcp`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      });
      assert.equal(denied.status, 401);

      const allowed = await fetch(`${base}/mcp`, {
        method: 'POST',
        headers: {
          authorization: 'Bearer mcp-secret',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }),
      });
      assert.equal(allowed.status, 200);
    },
  );
});
