const PROTOCOL_VERSIONS = ['2025-11-25', '2025-06-18'];

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
  idempotentHint: false,
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

const commitOptions = {
  branch: { type: 'string', minLength: 1, description: 'Branch to modify; defaults to repository default branch' },
  new_branch: { type: 'string', minLength: 1, description: 'Optionally create this branch and commit there' },
  message: { type: 'string', minLength: 1, description: 'Git commit message' },
  signoff: { type: 'boolean', default: false },
};

const issueEditProperties = {
  title: { type: 'string', minLength: 1 },
  body: { type: 'string' },
  state: { type: 'string', enum: ['open', 'closed'] },
  assignees: { type: 'array', items: { type: 'string', minLength: 1 } },
  milestone: { type: 'integer', minimum: 0 },
  due_date: { type: 'string' },
  unset_due_date: { type: 'boolean' },
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
    description: 'List repositories visible to the configured Forgejo account.',
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
    name: 'forgejo_create_branch',
    title: 'Create Forgejo branch',
    description: 'Create a new branch from a branch, tag, or commit reference.',
    inputSchema: repoSchema(
      {
        new_branch_name: { type: 'string', minLength: 1 },
        old_ref_name: { type: 'string', minLength: 1, description: 'Optional source branch, tag, or SHA; defaults to Forgejo behavior' },
      },
      ['new_branch_name'],
    ),
    annotations: WRITE,
  },
  {
    name: 'forgejo_delete_branch',
    title: 'Delete Forgejo branch',
    description: 'Delete a repository branch. This is destructive.',
    inputSchema: repoSchema(
      { branch: { type: 'string', minLength: 1 } },
      ['branch'],
    ),
    annotations: DESTRUCTIVE,
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
    name: 'forgejo_create_file',
    title: 'Create Forgejo file',
    description: 'Create one UTF-8 repository file and commit it.',
    inputSchema: repoSchema(
      {
        path: { type: 'string', minLength: 1 },
        content: { type: 'string' },
        ...commitOptions,
      },
      ['path', 'content'],
    ),
    annotations: WRITE,
  },
  {
    name: 'forgejo_update_file',
    title: 'Update Forgejo file',
    description: 'Replace or move one UTF-8 repository file and commit the change. Supply the current file SHA from forgejo_read_file.',
    inputSchema: repoSchema(
      {
        path: { type: 'string', minLength: 1 },
        sha: { type: 'string', minLength: 1 },
        content: { type: 'string' },
        from_path: { type: 'string', minLength: 1, description: 'Optional old path when moving/renaming the file' },
        ...commitOptions,
      },
      ['path', 'sha', 'content'],
    ),
    annotations: WRITE,
  },
  {
    name: 'forgejo_delete_file',
    title: 'Delete Forgejo file',
    description: 'Delete one repository file and commit the deletion. Supply the current file SHA. This is destructive.',
    inputSchema: repoSchema(
      {
        path: { type: 'string', minLength: 1 },
        sha: { type: 'string', minLength: 1 },
        ...commitOptions,
      },
      ['path', 'sha'],
    ),
    annotations: DESTRUCTIVE,
  },
  {
    name: 'forgejo_commit_changes',
    title: 'Commit multiple Forgejo file changes',
    description: 'Create, update, move, and/or delete up to 100 files atomically in one Forgejo commit. Content is supplied as UTF-8 and encoded by the server.',
    inputSchema: repoSchema(
      {
        ...commitOptions,
        files: {
          type: 'array',
          minItems: 1,
          maxItems: 100,
          items: objectSchema(
            {
              operation: { type: 'string', enum: ['create', 'update', 'delete'] },
              path: { type: 'string', minLength: 1 },
              content: { type: 'string', description: 'Required for create/update; ignored for delete' },
              sha: { type: 'string', minLength: 1, description: 'Required for update/delete' },
              from_path: { type: 'string', minLength: 1, description: 'Optional old path for a move/rename update' },
            },
            ['operation', 'path'],
          ),
        },
      },
      ['files'],
    ),
    annotations: WRITE,
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
    name: 'forgejo_create_issue',
    title: 'Create Forgejo issue',
    description: 'Create an issue, optionally assigning users, labels, milestone, or due date.',
    inputSchema: repoSchema(
      {
        title: { type: 'string', minLength: 1 },
        body: { type: 'string' },
        assignees: { type: 'array', items: { type: 'string', minLength: 1 } },
        labels: { type: 'array', items: { type: 'integer', minimum: 1 } },
        milestone: { type: 'integer', minimum: 0 },
        due_date: { type: 'string' },
        closed: { type: 'boolean', default: false },
      },
      ['title'],
    ),
    annotations: WRITE,
  },
  {
    name: 'forgejo_edit_issue',
    title: 'Edit Forgejo issue',
    description: 'Edit an issue title/body/state/assignees/milestone/due date. Closing an issue changes durable repository state.',
    inputSchema: repoSchema(
      {
        index: { type: 'integer', minimum: 1 },
        ...issueEditProperties,
      },
      ['index'],
    ),
    annotations: WRITE,
  },
  {
    name: 'forgejo_comment_issue',
    title: 'Comment on Forgejo issue',
    description: 'Add a comment to an issue.',
    inputSchema: repoSchema(
      {
        index: { type: 'integer', minimum: 1 },
        body: { type: 'string', minLength: 1 },
      },
      ['index', 'body'],
    ),
    annotations: WRITE,
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
    name: 'forgejo_create_pull_request',
    title: 'Create Forgejo pull request',
    description: 'Open a pull request from a head branch to a base branch.',
    inputSchema: repoSchema(
      {
        title: { type: 'string', minLength: 1 },
        body: { type: 'string' },
        head: { type: 'string', minLength: 1 },
        base: { type: 'string', minLength: 1 },
        assignees: { type: 'array', items: { type: 'string', minLength: 1 } },
        labels: { type: 'array', items: { type: 'integer', minimum: 1 } },
        milestone: { type: 'integer', minimum: 0 },
        due_date: { type: 'string' },
      },
      ['title', 'head', 'base'],
    ),
    annotations: WRITE,
  },
  {
    name: 'forgejo_edit_pull_request',
    title: 'Edit Forgejo pull request',
    description: 'Edit pull request title/body/state/base/assignees/milestone/due date.',
    inputSchema: repoSchema(
      {
        index: { type: 'integer', minimum: 1 },
        ...issueEditProperties,
        base: { type: 'string', minLength: 1 },
      },
      ['index'],
    ),
    annotations: WRITE,
  },
  {
    name: 'forgejo_comment_pull_request',
    title: 'Comment on Forgejo pull request',
    description: 'Add a conversation comment to a pull request.',
    inputSchema: repoSchema(
      {
        index: { type: 'integer', minimum: 1 },
        body: { type: 'string', minLength: 1 },
      },
      ['index', 'body'],
    ),
    annotations: WRITE,
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
  {
    name: 'forgejo_request_pull_request_reviewers',
    title: 'Request Forgejo pull request reviewers',
    description: 'Request user and/or team reviews on a pull request.',
    inputSchema: repoSchema(
      {
        index: { type: 'integer', minimum: 1 },
        reviewers: { type: 'array', items: { type: 'string', minLength: 1 } },
        team_reviewers: { type: 'array', items: { type: 'string', minLength: 1 } },
      },
      ['index'],
    ),
    annotations: WRITE,
  },
  {
    name: 'forgejo_review_pull_request',
    title: 'Review Forgejo pull request',
    description: 'Submit an APPROVED, COMMENT, or REQUEST_CHANGES review to a pull request.',
    inputSchema: repoSchema(
      {
        index: { type: 'integer', minimum: 1 },
        event: { type: 'string', enum: ['APPROVED', 'COMMENT', 'REQUEST_CHANGES'] },
        body: { type: 'string' },
        commit_id: { type: 'string', minLength: 1 },
        comments: {
          type: 'array',
          items: objectSchema({
            path: { type: 'string', minLength: 1 },
            body: { type: 'string', minLength: 1 },
            old_position: { type: 'integer', minimum: 0 },
            new_position: { type: 'integer', minimum: 0 },
          }),
        },
      },
      ['index', 'event'],
    ),
    annotations: WRITE,
  },
  {
    name: 'forgejo_merge_pull_request',
    title: 'Merge Forgejo pull request',
    description: 'Merge a pull request. This is an irreversible repository mutation and is marked destructive.',
    inputSchema: repoSchema(
      {
        index: { type: 'integer', minimum: 1 },
        method: {
          type: 'string',
          enum: ['merge', 'rebase', 'rebase-merge', 'squash', 'fast-forward-only'],
          default: 'merge',
        },
        title: { type: 'string' },
        message: { type: 'string' },
        delete_branch_after_merge: { type: 'boolean', default: false },
        force_merge: { type: 'boolean', default: false },
        head_commit_id: { type: 'string', minLength: 1, description: 'Optional expected PR head SHA for stale-head protection' },
        merge_when_checks_succeed: { type: 'boolean', default: false },
      },
      ['index'],
    ),
    annotations: DESTRUCTIVE,
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
    case 'forgejo_create_branch':
      return client.createBranch(args.owner, args.repo, args.new_branch_name, {
        oldRefName: args.old_ref_name,
      });
    case 'forgejo_delete_branch':
      return client.deleteBranch(args.owner, args.repo, args.branch);
    case 'forgejo_list_commits':
      return client.listCommits(args.owner, args.repo, args);
    case 'forgejo_get_tree':
      return client.getTree(args.owner, args.repo, args.ref, args);
    case 'forgejo_read_file':
      return client.readFile(args.owner, args.repo, args.path, args);
    case 'forgejo_create_file':
      return client.createFile(args.owner, args.repo, args.path, args.content, args);
    case 'forgejo_update_file':
      return client.updateFile(args.owner, args.repo, args.path, args.sha, args.content, args);
    case 'forgejo_delete_file':
      return client.deleteFile(args.owner, args.repo, args.path, args.sha, args);
    case 'forgejo_commit_changes':
      return client.commitChanges(args.owner, args.repo, args);
    case 'forgejo_search_code':
      return client.searchCode(args.owner, args.repo, args.query, args);
    case 'forgejo_list_issues':
      return client.listIssues(args.owner, args.repo, args);
    case 'forgejo_get_issue':
      return client.getIssue(args.owner, args.repo, args.index);
    case 'forgejo_create_issue':
      return client.createIssue(args.owner, args.repo, args);
    case 'forgejo_edit_issue':
      return client.editIssue(args.owner, args.repo, args.index, args);
    case 'forgejo_comment_issue':
      return client.commentIssue(args.owner, args.repo, args.index, args.body);
    case 'forgejo_list_pull_requests':
      return client.listPullRequests(args.owner, args.repo, args);
    case 'forgejo_get_pull_request':
      return client.getPullRequest(args.owner, args.repo, args.index);
    case 'forgejo_create_pull_request':
      return client.createPullRequest(args.owner, args.repo, args);
    case 'forgejo_edit_pull_request':
      return client.editPullRequest(args.owner, args.repo, args.index, args);
    case 'forgejo_comment_pull_request':
      return client.commentIssue(args.owner, args.repo, args.index, args.body);
    case 'forgejo_get_pull_request_files':
      return client.getPullRequestFiles(args.owner, args.repo, args.index, args);
    case 'forgejo_get_pull_request_diff':
      return client.getPullRequestDiff(args.owner, args.repo, args.index);
    case 'forgejo_request_pull_request_reviewers':
      return client.requestPullRequestReviewers(args.owner, args.repo, args.index, args);
    case 'forgejo_review_pull_request':
      return client.reviewPullRequest(args.owner, args.repo, args.index, args);
    case 'forgejo_merge_pull_request':
      return client.mergePullRequest(args.owner, args.repo, args.index, args);
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
          serverInfo: { name: 'forgejo-chatgpt-plugin', version: '0.2.0' },
          instructions:
            'Forgejo repository access with explicit read and write tools. Prefer feature branches plus pull requests for code changes. Read current file SHAs before update/delete operations. Merge, branch deletion, and file deletion are destructive actions and should only be used when the user clearly requests them.',
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
