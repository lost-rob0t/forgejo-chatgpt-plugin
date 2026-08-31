import assert from 'node:assert/strict';
import test from 'node:test';
import {
  handleMcpMessage,
  MODERN_PROTOCOL_VERSION,
  TOOLS,
} from '../src/protocol.mjs';

const PROTOCOL_VERSION_META = 'io.modelcontextprotocol/protocolVersion';
const CLIENT_INFO_META = 'io.modelcontextprotocol/clientInfo';
const SERVER_INFO_META = 'io.modelcontextprotocol/serverInfo';

function meta() {
  return {
    [PROTOCOL_VERSION_META]: MODERN_PROTOCOL_VERSION,
    [CLIENT_INFO_META]: {
      name: 'protocol-test',
      version: '1.0.0',
    },
    'io.modelcontextprotocol/clientCapabilities': {},
  };
}

function context(method, name, protocolVersion = MODERN_PROTOCOL_VERSION) {
  return {
    protocolVersion,
    methodHeader: method,
    nameHeader: name,
  };
}

test('server/discover advertises modern MCP capabilities', async () => {
  const response = await handleMcpMessage(
    {},
    {
      jsonrpc: '2.0',
      id: 'discover-1',
      method: 'server/discover',
      params: { _meta: meta() },
    },
    context('server/discover'),
  );

  assert.equal(response.result.resultType, 'complete');
  assert.deepEqual(response.result.supportedVersions, [MODERN_PROTOCOL_VERSION]);
  assert.deepEqual(response.result.capabilities, { tools: { listChanged: false } });
  assert.equal(response.result.cacheScope, 'private');
  assert.equal(response.result._meta[SERVER_INFO_META].name, 'forgejo-chatgpt-plugin');
});

test('modern tools/list returns cacheable complete result with all tools', async () => {
  const response = await handleMcpMessage(
    {},
    {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
      params: { _meta: meta() },
    },
    context('tools/list'),
  );

  assert.equal(response.result.resultType, 'complete');
  assert.equal(response.result.tools.length, TOOLS.length);
  assert.equal(response.result.cacheScope, 'private');
  assert.equal(response.result.ttlMs, 30_000);
  assert.equal(response.result._meta[SERVER_INFO_META].version, '0.2.0');
  assert.ok(response.result.tools.some((tool) => tool.annotations.readOnlyHint === false));
});

test('modern request rejects missing protocol HTTP header', async () => {
  const response = await handleMcpMessage(
    {},
    {
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/list',
      params: { _meta: meta() },
    },
    { methodHeader: 'tools/list' },
  );

  assert.equal(response.error.code, -32602);
  assert.match(response.error.message, /MCP-Protocol-Version/);
});

test('modern request rejects unsupported protocol versions explicitly', async () => {
  const futureVersion = '2099-01-01';
  const futureMeta = {
    ...meta(),
    [PROTOCOL_VERSION_META]: futureVersion,
  };

  const response = await handleMcpMessage(
    {},
    {
      jsonrpc: '2.0',
      id: 'future',
      method: 'server/discover',
      params: { _meta: futureMeta },
    },
    context('server/discover', undefined, futureVersion),
  );

  assert.equal(response.error.code, -32022);
  assert.deepEqual(response.error.data.supportedVersions, [MODERN_PROTOCOL_VERSION]);
});

test('modern request rejects malformed clientInfo when supplied', async () => {
  const malformedMeta = {
    ...meta(),
    [CLIENT_INFO_META]: { name: 'missing-version' },
  };

  const response = await handleMcpMessage(
    {},
    {
      jsonrpc: '2.0',
      id: 'bad-client-info',
      method: 'tools/list',
      params: { _meta: malformedMeta },
    },
    context('tools/list'),
  );

  assert.equal(response.error.code, -32602);
  assert.match(response.error.message, /clientInfo/);
});

test('modern request rejects routing header mismatch', async () => {
  const response = await handleMcpMessage(
    {},
    {
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: {
        name: 'forgejo_ping',
        arguments: {},
        _meta: meta(),
      },
    },
    context('tools/call', 'wrong-tool'),
  );

  assert.equal(response.error.code, -32020);
  assert.match(response.error.message, /Mcp-Name/);
});

test('modern tools/call routes write tools with structured output', async () => {
  let seen;
  const client = {
    createBranch: async (owner, repo, newBranchName, options) => {
      seen = { owner, repo, newBranchName, options };
      return { name: newBranchName };
    },
  };

  const response = await handleMcpMessage(
    client,
    {
      jsonrpc: '2.0',
      id: 5,
      method: 'tools/call',
      params: {
        name: 'forgejo_create_branch',
        arguments: {
          owner: 'starintel',
          repo: 'demo',
          new_branch_name: 'chatgpt-write-test',
          old_ref_name: 'main',
        },
        _meta: meta(),
      },
    },
    context('tools/call', 'forgejo_create_branch'),
  );

  assert.equal(seen.owner, 'starintel');
  assert.equal(seen.repo, 'demo');
  assert.equal(seen.newBranchName, 'chatgpt-write-test');
  assert.equal(seen.options.oldRefName, 'main');
  assert.equal(response.result.resultType, 'complete');
  assert.deepEqual(response.result.structuredContent, {
    data: { name: 'chatgpt-write-test' },
  });
  assert.match(response.result.content[0].text, /chatgpt-write-test/);
});

test('legacy tools/call also gets object-shaped structured output', async () => {
  const client = {
    listRepositories: async () => [{ name: 'demo' }],
  };

  const response = await handleMcpMessage(client, {
    jsonrpc: '2.0',
    id: 'legacy-tool',
    method: 'tools/call',
    params: {
      name: 'forgejo_list_repositories',
      arguments: {},
    },
  });

  assert.deepEqual(response.result.structuredContent, {
    data: [{ name: 'demo' }],
  });
});

test('legacy initialize remains supported without modern headers', async () => {
  const response = await handleMcpMessage({}, {
    jsonrpc: '2.0',
    id: 6,
    method: 'initialize',
    params: { protocolVersion: '2025-11-25' },
  });

  assert.equal(response.result.protocolVersion, '2025-11-25');
  assert.equal(response.result.serverInfo.name, 'forgejo-chatgpt-plugin');
});
