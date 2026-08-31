import assert from 'node:assert/strict';
import test from 'node:test';
import { ForgejoClient, ForgejoError } from '../src/forgejo.mjs';

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function recordingClient(response = { ok: true }) {
  const calls = [];
  const client = new ForgejoClient({
    baseUrl: 'https://git.example.test',
    token: 'secret',
    fetchImpl: async (url, options) => {
      calls.push({ url: url.toString(), options });
      return jsonResponse(response);
    },
  });
  return { client, calls };
}

test('listRepositories authenticates and paginates', async () => {
  let seen;
  const client = new ForgejoClient({
    baseUrl: 'https://git.example.test',
    token: 'secret',
    fetchImpl: async (url, options) => {
      seen = { url: url.toString(), options };
      return jsonResponse([{ name: 'alpha' }]);
    },
  });

  const result = await client.listRepositories({ page: 2, limit: 10 });
  assert.equal(result[0].name, 'alpha');
  assert.match(seen.url, /\/api\/v1\/user\/repos\?/);
  assert.match(seen.url, /page=2/);
  assert.match(seen.url, /limit=10/);
  assert.equal(seen.options.headers.Authorization, 'token secret');
});

test('readFile decodes base64 and enforces byte cap', async () => {
  const fetchImpl = async () =>
    jsonResponse({
      name: 'README.md',
      path: 'README.md',
      sha: 'abc',
      size: 5,
      encoding: 'base64',
      content: Buffer.from('hello').toString('base64'),
    });

  const ok = new ForgejoClient({
    baseUrl: 'https://git.example.test',
    token: 'secret',
    maxFileBytes: 5,
    fetchImpl,
  });
  assert.equal((await ok.readFile('o', 'r', 'README.md')).content, 'hello');

  const tooSmall = new ForgejoClient({
    baseUrl: 'https://git.example.test',
    token: 'secret',
    maxFileBytes: 4,
    fetchImpl,
  });
  await assert.rejects(
    () => tooSmall.readFile('o', 'r', 'README.md'),
    /MAX_FILE_BYTES/,
  );
});

test('createIssue sends a POST JSON mutation', async () => {
  const { client, calls } = recordingClient({ number: 42 });
  await client.createIssue('o', 'r', {
    title: 'write support',
    body: 'ship it',
    assignees: ['alice'],
  });

  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/api\/v1\/repos\/o\/r\/issues$/);
  assert.equal(calls[0].options.method, 'POST');
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    title: 'write support',
    body: 'ship it',
    assignees: ['alice'],
  });
});

test('createFile base64 encodes UTF-8 content and commits to requested branch', async () => {
  const { client, calls } = recordingClient({ commit: { sha: 'new' } });
  await client.createFile('o', 'r', 'src/hello.txt', 'hello λ', {
    branch: 'work',
    message: 'add hello',
  });

  assert.equal(calls[0].options.method, 'POST');
  const body = JSON.parse(calls[0].options.body);
  assert.equal(Buffer.from(body.content, 'base64').toString('utf8'), 'hello λ');
  assert.equal(body.branch, 'work');
  assert.equal(body.message, 'add hello');
});

test('commitChanges emits one atomic multi-file mutation', async () => {
  const { client, calls } = recordingClient({ commit: { sha: 'batch' } });
  await client.commitChanges('o', 'r', {
    branch: 'main',
    new_branch: 'chatgpt/change',
    message: 'batch edit',
    files: [
      { operation: 'create', path: 'a.txt', content: 'A' },
      { operation: 'update', path: 'b.txt', sha: 'old-b', content: 'B2' },
      { operation: 'delete', path: 'c.txt', sha: 'old-c' },
    ],
  });

  assert.equal(calls[0].options.method, 'POST');
  assert.match(calls[0].url, /\/api\/v1\/repos\/o\/r\/contents$/);
  const body = JSON.parse(calls[0].options.body);
  assert.equal(body.new_branch, 'chatgpt/change');
  assert.equal(body.files.length, 3);
  assert.equal(Buffer.from(body.files[0].content, 'base64').toString('utf8'), 'A');
  assert.equal(body.files[1].sha, 'old-b');
  assert.equal(body.files[2].operation, 'delete');
  assert.equal('content' in body.files[2], false);
});

test('commitChanges rejects update/delete without current SHA', async () => {
  const { client } = recordingClient();
  await assert.rejects(
    () => client.commitChanges('o', 'r', {
      files: [{ operation: 'update', path: 'a.txt', content: 'new' }],
    }),
    /requires the current file sha/,
  );
});

test('mergePullRequest sends Forgejo merge form fields', async () => {
  const { client, calls } = recordingClient({ merged: true });
  await client.mergePullRequest('o', 'r', 7, {
    method: 'squash',
    delete_branch_after_merge: true,
    head_commit_id: 'expected-head',
  });

  assert.equal(calls[0].options.method, 'POST');
  assert.match(calls[0].url, /\/pulls\/7\/merge$/);
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    Do: 'squash',
    delete_branch_after_merge: true,
    head_commit_id: 'expected-head',
  });
});

test('Forgejo API errors preserve status without leaking the token', async () => {
  const client = new ForgejoClient({
    baseUrl: 'https://git.example.test',
    token: 'super-secret-token',
    fetchImpl: async () => new Response('nope', { status: 403, statusText: 'Forbidden' }),
  });

  await assert.rejects(
    () => client.getRepository('o', 'r'),
    (error) => {
      assert.ok(error instanceof ForgejoError);
      assert.equal(error.status, 403);
      assert.doesNotMatch(error.message, /super-secret-token/);
      return true;
    },
  );
});
