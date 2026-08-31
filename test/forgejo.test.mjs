import assert from 'node:assert/strict';
import test from 'node:test';
import { ForgejoClient, ForgejoError } from '../src/forgejo.mjs';

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  });
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
