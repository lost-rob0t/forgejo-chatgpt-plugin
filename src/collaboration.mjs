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

function pageNumber(page) {
  if (page === undefined) return 1;
  const value = Number(page);
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error('page must be a positive integer');
  }
  return value;
}

function clampLimit(limit, fallback = 30, max = 100) {
  if (limit === undefined) return fallback;
  const value = Number(limit);
  if (!Number.isSafeInteger(value) || value < 1 || value > max) {
    throw new Error(`limit must be between 1 and ${max}`);
  }
  return value;
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

const labelValue = {
  anyOf: [
    { type: 'integer', minimum: 1 },
    { type: 'string', minLength: 1 },
  ],
  description: 'Forgejo label ID or label name',
};

export const COLLABORATION_TOOLS = [
  {
    name: 'forgejo_list_labels',
    title: 'List Forgejo repository labels',
    description: 'List repository labels so subsequent issue and pull-request mutations can use valid label IDs or names.',
    inputSchema: repoSchema({
      sort: {
        type: 'string',
        enum: ['mostissues', 'leastissues', 'reversealphabetically'],
      },
      ...pagination,
    }),
    annotations: READ_ONLY,
  },
  {
    name: 'forgejo_list_issue_comments',
    title: 'List Forgejo issue comments',
    description: 'Read conversation comments on an issue.',
    inputSchema: repoSchema(
      {
        index: { type: 'integer', minimum: 1 },
        since: { type: 'string', description: 'Optional RFC3339 lower bound on comment update time' },
        before: { type: 'string', description: 'Optional RFC3339 upper bound on comment update time' },
        ...pagination,
      },
      ['index'],
    ),
    annotations: READ_ONLY,
  },
  {
    name: 'forgejo_list_pull_request_comments',
    title: 'List Forgejo pull request comments',
    description: 'Read the normal conversation comments on a pull request. Forgejo exposes these through its issue-comment API.',
    inputSchema: repoSchema(
      {
        index: { type: 'integer', minimum: 1 },
        since: { type: 'string', description: 'Optional RFC3339 lower bound on comment update time' },
        before: { type: 'string', description: 'Optional RFC3339 upper bound on comment update time' },
        ...pagination,
      },
      ['index'],
    ),
    annotations: READ_ONLY,
  },
  {
    name: 'forgejo_replace_issue_labels',
    title: 'Replace Forgejo issue labels',
    description: 'Replace the complete label set on an issue. Labels may be Forgejo label IDs or names.',
    inputSchema: repoSchema(
      {
        index: { type: 'integer', minimum: 1 },
        labels: { type: 'array', items: labelValue, maxItems: 100 },
      },
      ['index', 'labels'],
    ),
    annotations: WRITE,
  },
  {
    name: 'forgejo_replace_pull_request_labels',
    title: 'Replace Forgejo pull request labels',
    description: 'Replace the complete label set on a pull request. Pull requests share Forgejo issue labels.',
    inputSchema: repoSchema(
      {
        index: { type: 'integer', minimum: 1 },
        labels: { type: 'array', items: labelValue, maxItems: 100 },
      },
      ['index', 'labels'],
    ),
    annotations: WRITE,
  },
  {
    name: 'forgejo_list_pull_request_reviews',
    title: 'List Forgejo pull request reviews',
    description: 'List submitted reviews for a pull request, including review state, reviewer, commit, and comment count.',
    inputSchema: repoSchema(
      { index: { type: 'integer', minimum: 1 }, ...pagination },
      ['index'],
    ),
    annotations: READ_ONLY,
  },
  {
    name: 'forgejo_get_pull_request_review_comments',
    title: 'Get Forgejo pull request review comments',
    description: 'Read inline review comments for one submitted pull-request review.',
    inputSchema: repoSchema(
      {
        index: { type: 'integer', minimum: 1 },
        review_id: { type: 'integer', minimum: 1 },
      },
      ['index', 'review_id'],
    ),
    annotations: READ_ONLY,
  },
  {
    name: 'forgejo_get_pull_request_commits',
    title: 'Get Forgejo pull request commits',
    description: 'List commits belonging to a pull request. File and signature verification expansion can be disabled to reduce payload size.',
    inputSchema: repoSchema(
      {
        index: { type: 'integer', minimum: 1 },
        verification: { type: 'boolean', default: false },
        files: { type: 'boolean', default: false },
        ...pagination,
      },
      ['index'],
    ),
    annotations: READ_ONLY,
  },
  {
    name: 'forgejo_get_combined_status',
    title: 'Get Forgejo combined commit status',
    description: 'Get the combined status for a branch, tag, or commit reference.',
    inputSchema: repoSchema(
      {
        ref: { type: 'string', minLength: 1 },
        ...pagination,
      },
      ['ref'],
    ),
    annotations: READ_ONLY,
  },
  {
    name: 'forgejo_list_commit_statuses',
    title: 'List Forgejo commit statuses',
    description: 'List individual commit statuses for a branch, tag, or commit reference.',
    inputSchema: repoSchema(
      {
        ref: { type: 'string', minLength: 1 },
        state: {
          type: 'string',
          enum: ['pending', 'success', 'error', 'failure', 'warning'],
        },
        ...pagination,
      },
      ['ref'],
    ),
    annotations: READ_ONLY,
  },
];

export const EDIT_PULL_REQUEST_OVERRIDE = {
  name: 'forgejo_edit_pull_request',
  title: 'Edit Forgejo pull request',
  description: 'Edit pull request title, body, state, base branch, assignees, labels, milestone, due date, and maintainer-edit permission.',
  inputSchema: repoSchema(
    {
      index: { type: 'integer', minimum: 1 },
      title: { type: 'string', minLength: 1 },
      body: { type: 'string' },
      state: { type: 'string', enum: ['open', 'closed'] },
      base: { type: 'string', minLength: 1 },
      assignees: { type: 'array', items: { type: 'string', minLength: 1 } },
      labels: { type: 'array', items: { type: 'integer', minimum: 1 }, maxItems: 100 },
      milestone: { type: 'integer', minimum: 0 },
      due_date: { type: 'string' },
      unset_due_date: { type: 'boolean' },
      allow_maintainer_edit: { type: 'boolean' },
    },
    ['index'],
  ),
  annotations: WRITE,
};

async function listLabels(client, args) {
  return client.json(`${repoPath(args.owner, args.repo)}/labels`, {
    query: {
      sort: args.sort,
      page: pageNumber(args.page),
      limit: clampLimit(args.limit),
    },
  });
}

async function listComments(client, args) {
  return client.json(
    `${repoPath(args.owner, args.repo)}/issues/${segment(args.index)}/comments`,
    {
      query: {
        since: args.since,
        before: args.before,
        page: pageNumber(args.page),
        limit: clampLimit(args.limit),
      },
    },
  );
}

async function replaceLabels(client, args) {
  return client.json(
    `${repoPath(args.owner, args.repo)}/issues/${segment(args.index)}/labels`,
    {
      method: 'PUT',
      body: { labels: args.labels },
    },
  );
}

async function listPullReviews(client, args) {
  return client.json(
    `${repoPath(args.owner, args.repo)}/pulls/${segment(args.index)}/reviews`,
    {
      query: {
        page: pageNumber(args.page),
        limit: clampLimit(args.limit),
      },
    },
  );
}

async function getPullReviewComments(client, args) {
  return client.json(
    `${repoPath(args.owner, args.repo)}/pulls/${segment(args.index)}/reviews/${segment(args.review_id)}/comments`,
  );
}

async function getPullRequestCommits(client, args) {
  return client.json(
    `${repoPath(args.owner, args.repo)}/pulls/${segment(args.index)}/commits`,
    {
      query: {
        verification: args.verification,
        files: args.files,
        page: pageNumber(args.page),
        limit: clampLimit(args.limit),
      },
    },
  );
}

async function getCombinedStatus(client, args) {
  return client.json(
    `${repoPath(args.owner, args.repo)}/commits/${segment(args.ref)}/status`,
    {
      query: {
        page: pageNumber(args.page),
        limit: clampLimit(args.limit),
      },
    },
  );
}

async function listCommitStatuses(client, args) {
  return client.json(
    `${repoPath(args.owner, args.repo)}/commits/${segment(args.ref)}/statuses`,
    {
      query: {
        state: args.state,
        page: pageNumber(args.page),
        limit: clampLimit(args.limit),
      },
    },
  );
}

async function editPullRequest(client, args) {
  return client.json(
    `${repoPath(args.owner, args.repo)}/pulls/${segment(args.index)}`,
    {
      method: 'PATCH',
      body: compact({
        title: args.title,
        body: args.body,
        state: args.state,
        base: args.base,
        assignees: args.assignees,
        labels: args.labels,
        milestone: args.milestone,
        due_date: args.due_date,
        unset_due_date: args.unset_due_date,
        allow_maintainer_edit: args.allow_maintainer_edit,
      }),
    },
  );
}

export function collaborationToolNames() {
  return new Set(COLLABORATION_TOOLS.map((tool) => tool.name));
}

export async function callCollaborationTool(client, name, args) {
  switch (name) {
    case 'forgejo_list_labels':
      return listLabels(client, args);
    case 'forgejo_list_issue_comments':
    case 'forgejo_list_pull_request_comments':
      return listComments(client, args);
    case 'forgejo_replace_issue_labels':
    case 'forgejo_replace_pull_request_labels':
      return replaceLabels(client, args);
    case 'forgejo_list_pull_request_reviews':
      return listPullReviews(client, args);
    case 'forgejo_get_pull_request_review_comments':
      return getPullReviewComments(client, args);
    case 'forgejo_get_pull_request_commits':
      return getPullRequestCommits(client, args);
    case 'forgejo_get_combined_status':
      return getCombinedStatus(client, args);
    case 'forgejo_list_commit_statuses':
      return listCommitStatuses(client, args);
    case 'forgejo_edit_pull_request':
      return editPullRequest(client, args);
    default:
      throw new Error(`unknown collaboration tool: ${name}`);
  }
}
