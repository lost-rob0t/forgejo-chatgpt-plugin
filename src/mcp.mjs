const PROTOCOL_VERSIONS = ['2025-11-25', '2025-06-18'];

const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
};

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

export const TOOLS = [
  {
    name: 'forgejo_ping',
    title: 'Forgejo Ping',
    description: 'Check the configured Forgejo API and return its version.',
    inputSchema: objectSchema({}),
    annotations: READ_ONLY,
  },
  {
    name: 'forgejo_list_repositories',
    title: 'List Forgejo repositories',
    description: 'List repositories visible to the configured Forgejo service account.',
    inputSchema: objectSchema(pagination),
    annotations: READ_ONLY,
  },
  {
    name: 'forgejo_get_repository',
    title: 'Get Forgejo repository',
    description: 'Read repository metadata for one Forgejo repository.',
    inputSchema: repoSchema(),
    annotations: READ_ONLY,
  },
  {
    name: 'forgejo_list_branches',
    title: 'List Forgejo branches',
    description: 'List branches in one Forgejo repository.',
    inputSchema: repoSchema(pagination),
    annotations: READ_ONLY,
  },
  {
    name: 'forgejo_list_commits',
    title: 'List Forgejo commits',
    description: 'List commits, optionally starting from a branch, tag, or SHA.',
    inputSchema: repoSchema({
      ref: { type: 'string', description: 'Optional branch, tag, or commit SHA' },
      ...pagination,
    }),
    annotations: READ_ONLY,
  },
  {
    name: 'forgejo_get_tree',
    title: 'Get Forgejo tree',
    description: 'Read a Git tree for a branch, tag, or SHA. Use recursive sparingly.',
    inputSchema: repoSchema(
      {
        ref: { type: 'string', minLength: 1 },
        recursive: { type: 'boolean', default: false },
      },
      ['ref'],
    ),
    annotations: READ_ONLY,
  },
  {
    name: 'forgejo_read_file',
    title: 'Read Forgejo file',
    description: 'Read one UTF-8 repository file at an optional branch, tag, or SHA.',
    inputSchema: repoSchema(
      {
        path: { type: 'string', minLength: 1 },
        ref: { type: 'string' },
      },
      ['path'],
    ),
    annotations: READ_ONLY,
  },
  {
    name: 'forgejo_search_code',
    title: 'Search Forgejo code',
    description: 'Search code inside one Forgejo repository.',
    inputSchema: repoSchema(
      {
        query: { type: 'string', minLength: 1 },
        ref: { type: 'string' },
        ...pagination,
      },
      ['query'],
    ),
    annotations: READ_ONLY,
  },
  {
    name: 'forgejo_list_issues',
    title: 'List Forgejo issues',
    description: 'List issues in one Forgejo repository without mixing in pull requests.',
    inputSchema: repoSchema({
      state: { type: 'string', enum: ['open', 'closed', 'all'], default: 'open' },
      ...pagination,
    }),
    annotations: READ_ONLY,
  },
  {
    name: 'forgejo_get_issue',
    title: 'Get Forgejo issue',
    description: 'Read one issue by repository issue number.',
    inputSchema: repoSchema(
      { index: { type: 'integer', minimum: 1 } },
      ['index'],
    ),
    annotations: READ_ONLY,
  },
  {
    name: 'forgejo_list_pull_requests',
    title: 'List Forgejo pull requests',
    description: 'List pull requests in one Forgejo repository.',
    inputSchema: repoSchema({
      state: { type: 'string', enum: ['open', 'closed', 'all'], default: 'open' },
      ...pagination,
    }),
    annotations: READ_ONLY,
  },
  {
    name: 'forgejo_get_pull_request',
    title: 'Get Forgejo pull request',
    description: 'Read pull request metadata by number.',
    inputSchema: repoSchema(
      { index: { type: 'integer', minimum: 1 } },
      ['index'],
    ),
    annotations: READ_ONLY,
  },
  {
    name: 'forgejo_get_pull_request_files',
    title: 'Get Forgejo pull request files',
    description: 'Read the changed-file summary for one pull request.',
    inputSchema: repoSchema(
      { index: { type: 'integer', minimum: 1 }, ...pagination },
      ['index'],
    ),
    annotations: READ_ONLY,
  },
  {
    name: 'forgejo_get_pull_request_diff',
    title: 'Get Forgejo pull request diff',
    description: 'Read a unified diff for one pull request, capped by MAX_DIFF_BYTES.',
    inputSchema: repoSchema(
      { index: { type: 'integer', minimum: 1 } },
      ['index'],
    ),
    annotations: READ_ONLY,
  },
];

function jsonRpcError(id, code, message, data) {
  return {
    jsonrpc: '2.0',
    id: id ?? null,
    error: { code, message, ...(data === undefined ? {} : { data }) },
  };
}

function textResult(value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  return { content: [{ type: 'text', text }] };
}

function errorResult(error) {
  const message = error instanceof Error ? error.message : String(error);
  return { content: [{ type: 'text', text: message }], isError: true };
}

function negotiateProtocol(requested) {
  return PROTOCOL_VERSIONS.includes(requested)
    ? requested
    : PROTOCOL_VERSIONS[0];
}

async function callTool(client, name, args) {
  switch (name) {
    case 'forgejo_ping':
      return client.ping();
    case 'forgejo_list_repositories':
      return client.listRepositories(args);
    case 'forgejo_get_repository':
      return client.getRepository(args.owner, args.repo);
    case 'forgejo_list_branches':
      return client.listBranches(args.owner, args.repo, args);
    case 'forgejo_list_commits':
      return client.listCommits(args.owner, args.repo, args);
    case 'forgejo_get_tree':
      return client.getTree(args.owner, args.repo, args.ref, args);
    case 'forgejo_read_file':
      return client.readFile(args.owner, args.repo, args.path, args);
    case 'forgejo_search_code':
      return client.searchCode(args.owner, args.repo, args.query, args);
    case 'forgejo_list_issues':
      return client.listIssues(args.owner, args.repo, args);
    case 'forgejo_get_issue':
      return client.getIssue(args.owner, args.repo, args.index);
    case 'forgejo_list_pull_requests':
      return client.listPullRequests(args.owner, args.repo, args);
    case 'forgejo_get_pull_request':
      return client.getPullRequest(args.owner, args.repo, args.index);
    case 'forgejo_get_pull_request_files':
      return client.getPullRequestFiles(args.owner, args.repo, args.index, args);
    case 'forgejo_get_pull_request_diff':
      return client.getPullRequestDiff(args.owner, args.repo, args.index);
    default:
      throw new Error(`unknown tool: ${name}`);
  }
}

export async function handleMcpMessage(client, message) {
  if (!message || message.jsonrpc !== '2.0' || typeof message.method !== 'string') {
    return jsonRpcError(message?.id, -32600, 'Invalid Request');
  }

  if (message.method.startsWith('notifications/')) return null;

  switch (message.method) {
    case 'initialize':
      return {
        jsonrpc: '2.0',
        id: message.id,
        result: {
          protocolVersion: negotiateProtocol(message.params?.protocolVersion),
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: 'forgejo-chatgpt-plugin', version: '0.1.0' },
          instructions:
            'Read-only access to the configured Forgejo service. Prefer narrow repository-scoped calls and avoid recursive trees unless necessary.',
        },
      };
    case 'ping':
      return { jsonrpc: '2.0', id: message.id, result: {} };
    case 'tools/list':
      return { jsonrpc: '2.0', id: message.id, result: { tools: TOOLS } };
    case 'tools/call': {
      const name = message.params?.name;
      const args = message.params?.arguments ?? {};
      if (typeof name !== 'string') {
        return jsonRpcError(message.id, -32602, 'tools/call requires a tool name');
      }

      try {
        const result = await callTool(client, name, args);
        return { jsonrpc: '2.0', id: message.id, result: textResult(result) };
      } catch (error) {
        return { jsonrpc: '2.0', id: message.id, result: errorResult(error) };
      }
    }
    default:
      return jsonRpcError(message.id, -32601, 'Method not found');
  }
}
