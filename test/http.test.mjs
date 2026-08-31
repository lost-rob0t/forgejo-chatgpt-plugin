import assert from 'node:assert/strict';
import test from 'node:test';
import { once } from 'node:events';
import { createMcpHttpServer } from '../src/http.mjs';
import { handleMcpMessage } from '../src/mcp.mjs';

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

test('HTTP MCP endpoint handles initialize and notifications', async () => {
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
