import assert from 'node:assert/strict';
import test from 'node:test';
import {
  callCollaborationTool,
  COLLABORATION_TOOLS,
  EDIT_PULL_REQUEST_OVERRIDE,
} from '../src/collaboration.mjs';

function recorder(response = []) {
  const calls = [];
  return {
    calls,
    client: {
      async json(path, options = {}) {
        calls.push({ path, options });
        return response;
      },
    },
  };
}

test('collaboration tool names are unique and PR edit override is writable', () => {
  const names = COLLABORATION_TOOLS.map((tool) => tool.name);
  assert.equal(new Set(names).size, names.length);
  assert.equal(EDIT_PULL_REQUEST_OVERRIDE.name, 'forgejo_edit_pull_request');
  assert.equal(EDIT_PULL_REQUEST_OVERRIDE.annotations.readOnlyHint, false);
  assert.ok(
    EDIT_PULL_REQUEST_OVERRIDE.inputSchema.properties.allow_maintainer_edit,
  );
  assert.ok(EDIT_PULL_REQUEST_OVERRIDE.inputSchema.properties.labels);
});

test('list labels uses Forgejo repository labels endpoint and pagination', async () => {
  const { client, calls } = recorder([{ id: 7, name: 'bug' }]);
  const value = await callCollaborationTool(client, 'forgejo_list_labels', {
    owner: 'starintel',
    repo: 'demo',
    sort: 'mostissues',
    page: 2,
    limit: 10,
  });

  assert.equal(value[0].name, 'bug');
  assert.equal(calls[0].path, '/repos/starintel/demo/labels');
  assert.deepEqual(calls[0].options.query, {
    sort: 'mostissues',
    page: 2,
    limit: 10,
  });
});

test('issue and pull-request conversation readers use issue comment API', async () => {
  const { client, calls } = recorder([]);

  await callCollaborationTool(client, 'forgejo_list_issue_comments', {
    owner: 'o',
    repo: 'r',
    index: 12,
    since: '2026-08-01T00:00:00Z',
  });
  await callCollaborationTool(client, 'forgejo_list_pull_request_comments', {
    owner: 'o',
    repo: 'r',
    index: 13,
  });

  assert.equal(calls[0].path, '/repos/o/r/issues/12/comments');
  assert.equal(calls[0].options.query.since, '2026-08-01T00:00:00Z');
  assert.equal(calls[1].path, '/repos/o/r/issues/13/comments');
});

test('replace labels accepts label names and IDs and uses PUT', async () => {
  const { client, calls } = recorder([{ id: 1, name: 'bug' }]);

  await callCollaborationTool(client, 'forgejo_replace_issue_labels', {
    owner: 'o',
    repo: 'r',
    index: 9,
    labels: ['bug', 4],
  });

  assert.equal(calls[0].path, '/repos/o/r/issues/9/labels');
  assert.equal(calls[0].options.method, 'PUT');
  assert.deepEqual(calls[0].options.body, { labels: ['bug', 4] });
});

test('pull review readers use Forgejo review endpoints', async () => {
  const { client, calls } = recorder([]);

  await callCollaborationTool(client, 'forgejo_list_pull_request_reviews', {
    owner: 'o',
    repo: 'r',
    index: 22,
    page: 3,
    limit: 5,
  });
  await callCollaborationTool(
    client,
    'forgejo_get_pull_request_review_comments',
    {
      owner: 'o',
      repo: 'r',
      index: 22,
      review_id: 99,
    },
  );

  assert.equal(calls[0].path, '/repos/o/r/pulls/22/reviews');
  assert.deepEqual(calls[0].options.query, { page: 3, limit: 5 });
  assert.equal(calls[1].path, '/repos/o/r/pulls/22/reviews/99/comments');
});

test('PR commit reader forwards expansion controls and pagination', async () => {
  const { client, calls } = recorder([]);

  await callCollaborationTool(client, 'forgejo_get_pull_request_commits', {
    owner: 'o',
    repo: 'r',
    index: 22,
    verification: true,
    files: false,
    page: 2,
    limit: 15,
  });

  assert.equal(calls[0].path, '/repos/o/r/pulls/22/commits');
  assert.deepEqual(calls[0].options.query, {
    verification: true,
    files: false,
    page: 2,
    limit: 15,
  });
});

test('combined and individual commit status readers use ref endpoints', async () => {
  const { client, calls } = recorder([]);

  await callCollaborationTool(client, 'forgejo_get_combined_status', {
    owner: 'o',
    repo: 'r',
    ref: 'feature/test',
    page: 1,
    limit: 20,
  });
  await callCollaborationTool(client, 'forgejo_list_commit_statuses', {
    owner: 'o',
    repo: 'r',
    ref: 'abc123',
    state: 'failure',
    page: 3,
    limit: 5,
  });

  assert.equal(calls[0].path, '/repos/o/r/commits/feature%2Ftest/status');
  assert.deepEqual(calls[0].options.query, { page: 1, limit: 20 });
  assert.equal(calls[1].path, '/repos/o/r/commits/abc123/statuses');
  assert.deepEqual(calls[1].options.query, {
    state: 'failure',
    page: 3,
    limit: 5,
  });
});

test('PR edit override forwards labels and maintainer-edit permission', async () => {
  const { client, calls } = recorder({ index: 5 });

  await callCollaborationTool(client, 'forgejo_edit_pull_request', {
    owner: 'o',
    repo: 'r',
    index: 5,
    title: 'updated',
    labels: [1, 2],
    allow_maintainer_edit: true,
  });

  assert.equal(calls[0].path, '/repos/o/r/pulls/5');
  assert.equal(calls[0].options.method, 'PATCH');
  assert.deepEqual(calls[0].options.body, {
    title: 'updated',
    labels: [1, 2],
    allow_maintainer_edit: true,
  });
});
