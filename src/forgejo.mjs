function segment(value) {
  return encodeURIComponent(String(value));
}

function repoPath(owner, repo) {
  return `/repos/${segment(owner)}/${segment(repo)}`;
}

function contentPath(path) {
  return String(path)
    .split('/')
    .filter(Boolean)
    .map(segment)
    .join('/');
}

function compact(value) {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined && item !== null),
  );
}

function clampLimit(limit, fallback = 30, max = 100) {
  if (limit === undefined) return fallback;
  const value = Number(limit);
  if (!Number.isSafeInteger(value) || value < 1 || value > max) {
    throw new Error(`limit must be between 1 and ${max}`);
  }
  return value;
}

function pageNumber(page) {
  if (page === undefined) return 1;
  const value = Number(page);
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error('page must be a positive integer');
  }
  return value;
}

function addQuery(url, query) {
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    url.searchParams.set(key, String(value));
  }
}

function base64Utf8(content) {
  return Buffer.from(String(content), 'utf8').toString('base64');
}

export class ForgejoError extends Error {
  constructor(message, { status, body, url } = {}) {
    super(message);
    this.name = 'ForgejoError';
    this.status = status;
    this.body = body;
    this.url = url;
  }
}

export class ForgejoClient {
  constructor({ baseUrl, token, maxFileBytes, maxDiffBytes, fetchImpl = fetch }) {
    if (!baseUrl) throw new Error('baseUrl is required');
    if (!token) throw new Error('token is required');

    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.token = token;
    this.maxFileBytes = maxFileBytes ?? 512 * 1024;
    this.maxDiffBytes = maxDiffBytes ?? 1024 * 1024;
    this.fetchImpl = fetchImpl;
  }

  apiUrl(path, query = {}) {
    const url = new URL(`${this.baseUrl}/api/v1${path}`);
    addQuery(url, query);
    return url;
  }

  async request(
    path,
    { query = {}, accept = 'application/json', method = 'GET', body } = {},
  ) {
    const url = this.apiUrl(path, query);
    const headers = {
      Accept: accept,
      Authorization: `token ${this.token}`,
      'User-Agent': 'forgejo-chatgpt-plugin/0.2.0',
    };
    if (body !== undefined) headers['Content-Type'] = 'application/json';

    const response = await this.fetchImpl(url, {
      method,
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });

    if (!response.ok) {
      const responseBody = (await response.text()).slice(0, 4096);
      throw new ForgejoError(
        `Forgejo request failed: ${response.status} ${response.statusText}`,
        { status: response.status, body: responseBody, url: url.toString() },
      );
    }

    return response;
  }

  async json(path, options) {
    const response = await this.request(path, options);
    if (response.status === 204) return { ok: true, status: 204 };
    const text = await response.text();
    if (!text) return { ok: true, status: response.status };
    return JSON.parse(text);
  }

  async ping() {
    return this.json('/version');
  }

  async listRepositories({ page, limit } = {}) {
    return this.json('/user/repos', {
      query: { page: pageNumber(page), limit: clampLimit(limit, 30) },
    });
  }

  async getRepository(owner, repo) {
    return this.json(repoPath(owner, repo));
  }

  async listBranches(owner, repo, { page, limit } = {}) {
    return this.json(`${repoPath(owner, repo)}/branches`, {
      query: { page: pageNumber(page), limit: clampLimit(limit, 30) },
    });
  }

  async createBranch(owner, repo, newBranchName, { oldRefName } = {}) {
    return this.json(`${repoPath(owner, repo)}/branches`, {
      method: 'POST',
      body: compact({
        new_branch_name: newBranchName,
        old_ref_name: oldRefName,
      }),
    });
  }

  async deleteBranch(owner, repo, branch) {
    return this.json(`${repoPath(owner, repo)}/branches/${segment(branch)}`, {
      method: 'DELETE',
    });
  }

  async listCommits(owner, repo, { ref, page, limit } = {}) {
    return this.json(`${repoPath(owner, repo)}/commits`, {
      query: {
        sha: ref,
        page: pageNumber(page),
        limit: clampLimit(limit, 30),
      },
    });
  }

  async getTree(owner, repo, ref, { recursive = false } = {}) {
    return this.json(`${repoPath(owner, repo)}/git/trees/${segment(ref)}`, {
      query: { recursive: Boolean(recursive) },
    });
  }

  async readFile(owner, repo, path, { ref } = {}) {
    const value = await this.json(
      `${repoPath(owner, repo)}/contents/${contentPath(path)}`,
      { query: { ref } },
    );

    if (Array.isArray(value) || value.type === 'dir') {
      throw new Error(`${path} is a directory; use forgejo_get_tree instead`);
    }
    if (value.encoding !== 'base64' || typeof value.content !== 'string') {
      throw new Error(`Forgejo did not return base64 file content for ${path}`);
    }

    const content = Buffer.from(value.content.replace(/\s/g, ''), 'base64');
    if (content.byteLength > this.maxFileBytes) {
      throw new Error(
        `file exceeds MAX_FILE_BYTES (${content.byteLength} > ${this.maxFileBytes})`,
      );
    }

    return {
      name: value.name,
      path: value.path,
      sha: value.sha,
      size: value.size,
      html_url: value.html_url,
      download_url: value.download_url,
      content: content.toString('utf8'),
    };
  }

  async createFile(owner, repo, path, content, options = {}) {
    return this.json(`${repoPath(owner, repo)}/contents/${contentPath(path)}`, {
      method: 'POST',
      body: compact({
        content: base64Utf8(content),
        branch: options.branch,
        new_branch: options.new_branch,
        message: options.message,
        signoff: options.signoff,
      }),
    });
  }

  async updateFile(owner, repo, path, sha, content, options = {}) {
    return this.json(`${repoPath(owner, repo)}/contents/${contentPath(path)}`, {
      method: 'PUT',
      body: compact({
        sha,
        content: base64Utf8(content),
        branch: options.branch,
        new_branch: options.new_branch,
        message: options.message,
        signoff: options.signoff,
        from_path: options.from_path,
      }),
    });
  }

  async deleteFile(owner, repo, path, sha, options = {}) {
    return this.json(`${repoPath(owner, repo)}/contents/${contentPath(path)}`, {
      method: 'DELETE',
      body: compact({
        sha,
        branch: options.branch,
        new_branch: options.new_branch,
        message: options.message,
        signoff: options.signoff,
      }),
    });
  }

  async commitChanges(owner, repo, { branch, new_branch, message, signoff, files }) {
    if (!Array.isArray(files) || files.length < 1 || files.length > 100) {
      throw new Error('files must contain between 1 and 100 operations');
    }

    const normalized = files.map((file) => {
      const operation = file.operation;
      if (!['create', 'update', 'delete'].includes(operation)) {
        throw new Error(`unsupported file operation: ${operation}`);
      }
      if (!file.path) throw new Error('every file operation requires path');
      if ((operation === 'update' || operation === 'delete') && !file.sha) {
        throw new Error(`${operation} requires the current file sha`);
      }
      if (operation !== 'delete' && typeof file.content !== 'string') {
        throw new Error(`${operation} requires UTF-8 content`);
      }

      return compact({
        operation,
        path: file.path,
        sha: file.sha,
        from_path: file.from_path,
        content: operation === 'delete' ? undefined : base64Utf8(file.content),
      });
    });

    return this.json(`${repoPath(owner, repo)}/contents`, {
      method: 'POST',
      body: compact({ branch, new_branch, message, signoff, files: normalized }),
    });
  }

  async searchCode(owner, repo, query, { ref, page, limit } = {}) {
    return this.json(`${repoPath(owner, repo)}/search`, {
      query: {
        q: query,
        type: 'code',
        ref,
        page: pageNumber(page),
        limit: clampLimit(limit, 30),
      },
    });
  }

  async listIssues(owner, repo, { state = 'open', page, limit } = {}) {
    return this.json(`${repoPath(owner, repo)}/issues`, {
      query: {
        state,
        type: 'issues',
        page: pageNumber(page),
        limit: clampLimit(limit, 30),
      },
    });
  }

  async getIssue(owner, repo, index) {
    return this.json(`${repoPath(owner, repo)}/issues/${segment(index)}`);
  }

  async createIssue(owner, repo, options) {
    return this.json(`${repoPath(owner, repo)}/issues`, {
      method: 'POST',
      body: compact({
        title: options.title,
        body: options.body,
        assignees: options.assignees,
        labels: options.labels,
        milestone: options.milestone,
        due_date: options.due_date,
        closed: options.closed,
      }),
    });
  }

  async editIssue(owner, repo, index, options) {
    return this.json(`${repoPath(owner, repo)}/issues/${segment(index)}`, {
      method: 'PATCH',
      body: compact({
        title: options.title,
        body: options.body,
        state: options.state,
        assignees: options.assignees,
        milestone: options.milestone,
        due_date: options.due_date,
        unset_due_date: options.unset_due_date,
      }),
    });
  }

  async commentIssue(owner, repo, index, body) {
    return this.json(`${repoPath(owner, repo)}/issues/${segment(index)}/comments`, {
      method: 'POST',
      body: { body },
    });
  }

  async listPullRequests(owner, repo, { state = 'open', page, limit } = {}) {
    return this.json(`${repoPath(owner, repo)}/pulls`, {
      query: {
        state,
        page: pageNumber(page),
        limit: clampLimit(limit, 30),
      },
    });
  }

  async getPullRequest(owner, repo, index) {
    return this.json(`${repoPath(owner, repo)}/pulls/${segment(index)}`);
  }

  async createPullRequest(owner, repo, options) {
    return this.json(`${repoPath(owner, repo)}/pulls`, {
      method: 'POST',
      body: compact({
        title: options.title,
        body: options.body,
        head: options.head,
        base: options.base,
        assignees: options.assignees,
        labels: options.labels,
        milestone: options.milestone,
        due_date: options.due_date,
      }),
    });
  }

  async editPullRequest(owner, repo, index, options) {
    return this.json(`${repoPath(owner, repo)}/pulls/${segment(index)}`, {
      method: 'PATCH',
      body: compact({
        title: options.title,
        body: options.body,
        state: options.state,
        base: options.base,
        assignees: options.assignees,
        milestone: options.milestone,
        due_date: options.due_date,
        unset_due_date: options.unset_due_date,
      }),
    });
  }

  async getPullRequestFiles(owner, repo, index, { page, limit } = {}) {
    return this.json(`${repoPath(owner, repo)}/pulls/${segment(index)}/files`, {
      query: { page: pageNumber(page), limit: clampLimit(limit, 30) },
    });
  }

  async getPullRequestDiff(owner, repo, index) {
    const response = await this.request(
      `${repoPath(owner, repo)}/pulls/${segment(index)}.diff`,
      { accept: 'text/plain, application/octet-stream;q=0.9, */*;q=0.1' },
    );
    const bytes = Buffer.from(await response.arrayBuffer());
    const truncated = bytes.byteLength > this.maxDiffBytes;
    const visible = truncated ? bytes.subarray(0, this.maxDiffBytes) : bytes;

    return {
      truncated,
      original_bytes: bytes.byteLength,
      returned_bytes: visible.byteLength,
      diff: visible.toString('utf8'),
    };
  }

  async requestPullRequestReviewers(owner, repo, index, { reviewers, team_reviewers }) {
    return this.json(
      `${repoPath(owner, repo)}/pulls/${segment(index)}/requested_reviewers`,
      { method: 'POST', body: compact({ reviewers, team_reviewers }) },
    );
  }

  async reviewPullRequest(owner, repo, index, { event, body, commit_id, comments }) {
    return this.json(`${repoPath(owner, repo)}/pulls/${segment(index)}/reviews`, {
      method: 'POST',
      body: compact({ event, body, commit_id, comments }),
    });
  }

  async mergePullRequest(owner, repo, index, options = {}) {
    return this.json(`${repoPath(owner, repo)}/pulls/${segment(index)}/merge`, {
      method: 'POST',
      body: compact({
        Do: options.method ?? 'merge',
        MergeTitleField: options.title,
        MergeMessageField: options.message,
        delete_branch_after_merge: options.delete_branch_after_merge,
        force_merge: options.force_merge,
        head_commit_id: options.head_commit_id,
        merge_when_checks_succeed: options.merge_when_checks_succeed,
      }),
    });
  }
}
