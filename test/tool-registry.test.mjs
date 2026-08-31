import assert from 'node:assert/strict';
import test from 'node:test';
import { TOOLS } from '../src/protocol.mjs';

const EXPECTED_DESTRUCTIVE = [
  'forgejo_delete_branch',
  'forgejo_delete_file',
  'forgejo_merge_pull_request',
];

test('composed ChatGPT tool registry is unique and complete', () => {
  const names = TOOLS.map((tool) => tool.name);
  const reads = TOOLS.filter((tool) => tool.annotations?.readOnlyHint === true);
  const writes = TOOLS.filter((tool) => tool.annotations?.readOnlyHint === false);
  const destructive = TOOLS
    .filter((tool) => tool.annotations?.destructiveHint === true)
    .map((tool) => tool.name)
    .sort();

  assert.equal(TOOLS.length, 39);
  assert.equal(new Set(names).size, 39);
  assert.equal(reads.length, 22);
  assert.equal(writes.length, 17);
  assert.deepEqual(destructive, [...EXPECTED_DESTRUCTIVE].sort());
});

test('every advertised tool declares the structured result envelope', () => {
  for (const tool of TOOLS) {
    assert.deepEqual(tool.outputSchema, {
      type: 'object',
      properties: { data: {} },
      required: ['data'],
      additionalProperties: false,
    });
  }
});

test('coding and collaboration tools required by ChatGPT are present', () => {
  const byName = new Map(TOOLS.map((tool) => [tool.name, tool]));

  for (const name of [
    'forgejo_commit_changes',
    'forgejo_create_branch',
    'forgejo_create_pull_request',
    'forgejo_list_pull_request_comments',
    'forgejo_list_pull_request_reviews',
    'forgejo_get_pull_request_review_comments',
    'forgejo_get_pull_request_commits',
    'forgejo_get_combined_status',
    'forgejo_list_commit_statuses',
    'forgejo_list_labels',
    'forgejo_replace_issue_labels',
  ]) {
    assert.ok(byName.has(name), `missing required tool: ${name}`);
  }

  const editPull = byName.get('forgejo_edit_pull_request');
  assert.ok(editPull.inputSchema.properties.labels);
  assert.ok(editPull.inputSchema.properties.allow_maintainer_edit);
});

test('registry does not expose generic command or transport escape hatches', () => {
  const names = TOOLS.map((tool) => tool.name.toLowerCase());
  for (const forbidden of ['shell', 'exec', 'command', 'raw_http', 'raw_request']) {
    assert.ok(
      names.every((name) => !name.includes(forbidden)),
      `generic escape hatch leaked into MCP tools: ${forbidden}`,
    );
  }
});
