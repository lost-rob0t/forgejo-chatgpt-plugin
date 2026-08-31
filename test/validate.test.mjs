import assert from 'node:assert/strict';
import test from 'node:test';
import { TOOLS } from '../src/protocol.mjs';
import { ToolArgumentError, validateSchema, validateToolArguments } from '../src/validate.mjs';

function tool(name) {
  const value = TOOLS.find((item) => item.name === name);
  assert.ok(value, `missing tool ${name}`);
  return value;
}

test('validator rejects missing required repository arguments', () => {
  assert.throws(
    () => validateToolArguments(tool('forgejo_get_repository'), { owner: 'o' }),
    (error) => {
      assert.ok(error instanceof ToolArgumentError);
      assert.match(error.message, /\$\.repo: is required/);
      return true;
    },
  );
});

test('validator rejects additional properties on closed input schemas', () => {
  assert.throws(
    () =>
      validateToolArguments(tool('forgejo_ping'), {
        command: 'rm -rf /',
      }),
    /is not an allowed property/,
  );
});

test('validator enforces enums and numeric bounds', () => {
  assert.throws(
    () =>
      validateToolArguments(tool('forgejo_list_commit_statuses'), {
        owner: 'o',
        repo: 'r',
        ref: 'main',
        state: 'totally-green',
      }),
    /must be one of/,
  );

  assert.throws(
    () =>
      validateToolArguments(tool('forgejo_list_repositories'), {
        page: 1,
        limit: 101,
      }),
    /must be <= 100/,
  );
});

test('validator handles anyOf label names and IDs', () => {
  const replaceLabels = tool('forgejo_replace_issue_labels');

  validateToolArguments(replaceLabels, {
    owner: 'o',
    repo: 'r',
    index: 1,
    labels: ['bug', 4],
  });

  assert.throws(
    () =>
      validateToolArguments(replaceLabels, {
        owner: 'o',
        repo: 'r',
        index: 1,
        labels: [{ id: 4 }],
      }),
    /does not match any allowed schema/,
  );
});

test('validator catches invalid nested atomic commit operations', () => {
  assert.throws(
    () =>
      validateToolArguments(tool('forgejo_commit_changes'), {
        owner: 'o',
        repo: 'r',
        files: [
          {
            operation: 'chmod',
            path: 'README.md',
          },
        ],
      }),
    /must be one of/,
  );
});

test('empty schema accepts arbitrary structured output data', () => {
  validateSchema({}, ['anything', { nested: true }]);
});
