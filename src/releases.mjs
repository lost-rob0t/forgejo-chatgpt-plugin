function segment(value) {
  return encodeURIComponent(String(value));
}

function repoPath(owner, repo) {
  return `/repos/${segment(owner)}/${segment(repo)}`;
}

function compact(value) {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined && item !== null),
  );
}

function objectSchema(properties, required = []) {
  return { type: 'object', additionalProperties: false, properties, required };
}

function repoSchema(extraProperties = {}, extraRequired = []) {
  return objectSchema(
    {
      owner: { type: 'string', minLength: 1, description: 'Repository owner' },
      repo: { type: 'string', minLength: 1, description: 'Repository name' },
      ...extraProperties,
    },
    ['owner', 'repo', ...extraRequired],
  );
}

const pagination = {
  page: { type: 'integer', minimum: 1, default: 1 },
  limit: { type: 'integer', minimum: 1, maximum: 100, default: 30 },
};

const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
};

const WRITE = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: true,
};

const DESTRUCTIVE = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: true,
  openWorldHint: true,
};

export const RELEASE_TOOLS = [
  {
    name: 'forgejo_list_tags',
    title: 'List Forgejo tags',
    description: 'List Git tags in a repository.',
    inputSchema: repoSchema(pagination),
    annotations: READ_ONLY,
  },
  {
    name: 'forgejo_get_tag',
    title: 'Get Forgejo tag',
    description: 'Read one repository tag by name.',
    inputSchema: repoSchema(
      { tag: { type: 'string', minLength: 1 } },
      ['tag'],
    ),
    annotations: READ_ONLY,
  },
  {
    name: 'forgejo_create_tag',
    title: 'Create Forgejo tag',
    description: 'Create a Git tag at an optional branch, tag, or commit target.',
    inputSchema: repoSchema(
      {
        tag_name: { type: 'string', minLength: 1 },
        target: { type: 'string', minLength: 1 },
        message: { type: 'string' },
      },
      ['tag_name'],
    ),
    annotations: WRITE,
  },
  {
    name: 'forgejo_delete_tag',
    title: 'Delete Forgejo tag',
    description: 'Permanently delete one Git tag from a repository.',
    inputSchema: repoSchema(
      { tag: { type: 'string', minLength: 1 } },
      ['tag'],
    ),
    annotations: DESTRUCTIVE,
  },
  {
    name: 'forgejo_list_releases',
    title: 'List Forgejo releases',
    description: 'List repository releases.',
    inputSchema: repoSchema(pagination),
    annotations: READ_ONLY,
  },
  {
    name: 'forgejo_get_release',
    title: 'Get Forgejo release',
    description: 'Read one repository release by numeric release ID.',
    inputSchema: repoSchema(
      { release_id: { type: 'integer', minimum: 1 } },
      ['release_id'],
    ),
    annotations: READ_ONLY,
  },
  {
    name: 'forgejo_create_release',
    title: 'Create Forgejo release',
    description: 'Create a repository release for a tag, optionally targeting a commitish and marking it draft or prerelease.',
    inputSchema: repoSchema(
      {
        tag_name: { type: 'string', minLength: 1 },
        target_commitish: { type: 'string', minLength: 1 },
        name: { type: 'string' },
        body: { type: 'string' },
        draft: { type: 'boolean' },
        prerelease: { type: 'boolean' },
        hide_archive_links: { type: 'boolean' },
      },
      ['tag_name'],
    ),
    annotations: WRITE,
  },
  {
    name: 'forgejo_edit_release',
    title: 'Edit Forgejo release',
    description: 'Edit the tag, target, name, body, draft/prerelease state, or archive-link visibility of a release.',
    inputSchema: repoSchema(
      {
        release_id: { type: 'integer', minimum: 1 },
        tag_name: { type: 'string', minLength: 1 },
        target_commitish: { type: 'string', minLength: 1 },
        name: { type: 'string' },
        body: { type: 'string' },
        draft: { type: 'boolean' },
        prerelease: { type: 'boolean' },
        hide_archive_links: { type: 'boolean' },
      },
      ['release_id'],
    ),
    annotations: WRITE,
  },
  {
    name: 'forgejo_delete_release',
    title: 'Delete Forgejo release',
    description: 'Permanently delete one repository release by ID.',
    inputSchema: repoSchema(
      { release_id: { type: 'integer', minimum: 1 } },
      ['release_id'],
    ),
    annotations: DESTRUCTIVE,
  },
];

export function releaseToolNames() {
  return new Set(RELEASE_TOOLS.map((tool) => tool.name));
}

async function listTags(client, args) {
  return client.json(`${repoPath(args.owner, args.repo)}/tags`, {
    query: {
      page: args.page ?? 1,
      limit: args.limit ?? 30,
    },
  });
}

async function getTag(client, args) {
  return client.json(`${repoPath(args.owner, args.repo)}/tags/${segment(args.tag)}`);
}

async function createTag(client, args) {
  return client.json(`${repoPath(args.owner, args.repo)}/tags`, {
    method: 'POST',
    body: compact({
      tag_name: args.tag_name,
      target: args.target,
      message: args.message,
    }),
  });
}

async function deleteTag(client, args) {
  await client.request(`${repoPath(args.owner, args.repo)}/tags/${segment(args.tag)}`, {
    method: 'DELETE',
  });
  return { deleted: true, tag: args.tag };
}

async function listReleases(client, args) {
  return client.json(`${repoPath(args.owner, args.repo)}/releases`, {
    query: {
      page: args.page ?? 1,
      limit: args.limit ?? 30,
    },
  });
}

async function getRelease(client, args) {
  return client.json(
    `${repoPath(args.owner, args.repo)}/releases/${segment(args.release_id)}`,
  );
}

async function createRelease(client, args) {
  return client.json(`${repoPath(args.owner, args.repo)}/releases`, {
    method: 'POST',
    body: compact({
      tag_name: args.tag_name,
      target_commitish: args.target_commitish,
      name: args.name,
      body: args.body,
      draft: args.draft,
      prerelease: args.prerelease,
      hide_archive_links: args.hide_archive_links,
    }),
  });
}

async function editRelease(client, args) {
  return client.json(
    `${repoPath(args.owner, args.repo)}/releases/${segment(args.release_id)}`,
    {
      method: 'PATCH',
      body: compact({
        tag_name: args.tag_name,
        target_commitish: args.target_commitish,
        name: args.name,
        body: args.body,
        draft: args.draft,
        prerelease: args.prerelease,
        hide_archive_links: args.hide_archive_links,
      }),
    },
  );
}

async function deleteRelease(client, args) {
  await client.request(
    `${repoPath(args.owner, args.repo)}/releases/${segment(args.release_id)}`,
    { method: 'DELETE' },
  );
  return { deleted: true, release_id: args.release_id };
}

export async function callReleaseTool(client, name, args) {
  switch (name) {
    case 'forgejo_list_tags':
      return listTags(client, args);
    case 'forgejo_get_tag':
      return getTag(client, args);
    case 'forgejo_create_tag':
      return createTag(client, args);
    case 'forgejo_delete_tag':
      return deleteTag(client, args);
    case 'forgejo_list_releases':
      return listReleases(client, args);
    case 'forgejo_get_release':
      return getRelease(client, args);
    case 'forgejo_create_release':
      return createRelease(client, args);
    case 'forgejo_edit_release':
      return editRelease(client, args);
    case 'forgejo_delete_release':
      return deleteRelease(client, args);
    default:
      throw new Error(`unknown release tool: ${name}`);
  }
}
