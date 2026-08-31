import assert from 'node:assert/strict';
import test from 'node:test';
import { handleMcpMessage, TOOLS } from '../src/mcp.mjs';

const client = {
  ping: async () => ({ version: '16.0.0' }),
  listRepositories: async () => [{ full_name: 'starintel/test' }],
};

test('initialize exposes a read-only tool capability', async () => {
  const response = await handleMcpMessage(client, {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: { protocolVersion: '2025-11-25' },
  });

  assert.equal(response.result.protocolVersion, '2025-11-25');
  assert.deepEqual(response.result.capabilities, { tools: { listChanged: false } });
});

test('tools/list only declares read-only tools', async () => {
  const response = await handleMcpMessage(client, {
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/list',
    params: {},
  });

  assert.equal(response.result.tools.length, TOOLS.length);
  for (const tool of response.result.tools) {
    assert.equal(tool.annotations.readOnlyHint, true);
    assert.equal(tool.annotations.destructiveHint, false);
  }
});

test('tools/call invokes the Forgejo client', async () => {
  const response = await handleMcpMessage(client, {
    jsonrpc: '2.0',
    id: 3,
    method: 'tools/call',
    params: { name: 'forgejo_list_repositories', arguments: {} },
  });

  assert.equal(response.result.isError, undefined);
  assert.match(response.result.content[0].text, /starintel\/test/);
});

test('unknown modern discovery method returns Method not found for client fallback', async () => {
  const response = await handleMcpMessage(client, {
    jsonrpc: '2.0',
    id: 4,
    method: 'server/discover',
    params: {},
  });

  assert.equal(response.error.code, -32601);
});
