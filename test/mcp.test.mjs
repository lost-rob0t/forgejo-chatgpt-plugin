import assert from 'node:assert/strict';
import test from 'node:test';
import { handleMcpMessage, TOOLS } from '../src/mcp.mjs';

const calls = [];
const client = {
  ping: async () => ({ version: '16.0.0' }),
  listRepositories: async () => [{ full_name: 'starintel/test' }],
  createIssue: async (owner, repo, args) => {
    calls.push({ op: 'createIssue', owner, repo, args });
    return { number: 9, title: args.title };
  },
  mergePullRequest: async (owner, repo, index, args) => {
    calls.push({ op: 'mergePullRequest', owner, repo, index, args });
    return { merged: true };
  },
};

test('initialize exposes read/write Forgejo tool capability', async () => {
  const response = await handleMcpMessage(client, {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: { protocolVersion: '2025-11-25' },
  });

  assert.equal(response.result.protocolVersion, '2025-11-25');
  assert.deepEqual(response.result.capabilities, { tools: { listChanged: false } });
  assert.match(response.result.instructions, /read and write tools/i);
});

test('tools/list declares both write tools and destructive boundaries', async () => {
  const response = await handleMcpMessage(client, {
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/list',
    params: {},
  });

  assert.equal(response.result.tools.length, TOOLS.length);
  assert.equal(TOOLS.length, 29);

  const byName = new Map(response.result.tools.map((tool) => [tool.name, tool]));
  assert.equal(byName.get('forgejo_read_file').annotations.readOnlyHint, true);
  assert.equal(byName.get('forgejo_commit_changes').annotations.readOnlyHint, false);
  assert.equal(byName.get('forgejo_commit_changes').annotations.destructiveHint, false);
  assert.equal(byName.get('forgejo_delete_file').annotations.destructiveHint, true);
  assert.equal(byName.get('forgejo_delete_branch').annotations.destructiveHint, true);
  assert.equal(byName.get('forgejo_merge_pull_request').annotations.destructiveHint, true);

  const writeTools = response.result.tools.filter(
    (tool) => tool.annotations.readOnlyHint === false,
  );
  assert.equal(writeTools.length, 15);
});

test('tools/call invokes a read operation', async () => {
  const response = await handleMcpMessage(client, {
    jsonrpc: '2.0',
    id: 3,
    method: 'tools/call',
    params: { name: 'forgejo_list_repositories', arguments: {} },
  });

  assert.equal(response.result.isError, undefined);
  assert.match(response.result.content[0].text, /starintel\/test/);
});

test('tools/call invokes a write operation', async () => {
  calls.length = 0;
  const response = await handleMcpMessage(client, {
    jsonrpc: '2.0',
    id: 4,
    method: 'tools/call',
    params: {
      name: 'forgejo_create_issue',
      arguments: {
        owner: 'starintel',
        repo: 'test',
        title: 'Ship write support',
        body: 'ChatGPT can mutate Forgejo.',
      },
    },
  });

  assert.equal(response.result.isError, undefined);
  assert.equal(calls[0].op, 'createIssue');
  assert.equal(calls[0].args.title, 'Ship write support');
  assert.match(response.result.content[0].text, /Ship write support/);
});

test('tools/call routes destructive merge explicitly', async () => {
  calls.length = 0;
  const response = await handleMcpMessage(client, {
    jsonrpc: '2.0',
    id: 5,
    method: 'tools/call',
    params: {
      name: 'forgejo_merge_pull_request',
      arguments: {
        owner: 'starintel',
        repo: 'test',
        index: 12,
        method: 'squash',
      },
    },
  });

  assert.equal(response.result.isError, undefined);
  assert.equal(calls[0].op, 'mergePullRequest');
  assert.equal(calls[0].index, 12);
  assert.equal(calls[0].args.method, 'squash');
});

test('unknown modern discovery method returns Method not found for client fallback', async () => {
  const response = await handleMcpMessage(client, {
    jsonrpc: '2.0',
    id: 6,
    method: 'server/discover',
    params: {},
  });

  assert.equal(response.error.code, -32601);
});
