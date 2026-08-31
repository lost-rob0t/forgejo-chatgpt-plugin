function segment(value) {
  return encodeURIComponent(String(value));
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

  async request(path, { query = {}, accept = 'application/json' } = {}) {
    const url = this.apiUrl(path, query);
    const response = await this.fetchImpl(url, {
      method: 'GET',
      headers: {
        Accept: accept,
        Authorization: `token ${this.token}`,
        'User-Agent': 'forgejo-chatgpt-plugin/0.1.0',
      },
    });

    if (!response.ok) {
      const body = (await response.text()).slice(0, 4096);
      throw new ForgejoError(
        `Forgejo request failed: ${response.status} ${response.statusText}`,
        { status: response.status, body, url: url.toString() },
      );
    }

    return response;
  }

  async json(path, options) {
    const response = await this.request(path, options);
    return response.json();
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
    return this.json(`/repos/${segment(owner)}/${segment(repo)}`);
  }

  async listBranches(owner, repo, { page, limit } = {}) {
    return this.json(`/repos/${segment(owner)}/${segment(repo)}/branches`, {
      query: { page: pageNumber(page), limit: clampLimit(limit, 30) },
    });
  }

  async listCommits(owner, repo, { ref, page, limit } = {}) {
    return this.json(`/repos/${segment(owner)}/${segment(repo)}/commits`, {
      query: {
        sha: ref,
        page: pageNumber(page),
        limit: clampLimit(limit, 30),
      },
    });
  }

  async getTree(owner, repo, ref, { recursive = false } = {}) {
    return this.json(
      `/repos/${segment(owner)}/${segment(repo)}/git/trees/${segment(ref)}`,
      { query: { recursive: Boolean(recursive) } },
    );
  }

  async readFile(owner, repo, path, { ref } = {}) {
    const encodedPath = String(path)
      .split('/')
      .filter(Boolean)
      .map(segment)
      .join('/');
    const value = await this.json(
      `/repos/${segment(owner)}/${segment(repo)}/contents/${encodedPath}`,
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

  async searchCode(owner, repo, query, { ref, page, limit } = {}) {
    return this.json(`/repos/${segment(owner)}/${segment(repo)}/search`, {
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
    return this.json(`/repos/${segment(owner)}/${segment(repo)}/issues`, {
      query: {
        state,
        type: 'issues',
        page: pageNumber(page),
        limit: clampLimit(limit, 30),
      },
    });
  }

  async getIssue(owner, repo, index) {
    return this.json(
      `/repos/${segment(owner)}/${segment(repo)}/issues/${segment(index)}`,
    );
  }

  async listPullRequests(owner, repo, { state = 'open', page, limit } = {}) {
    return this.json(`/repos/${segment(owner)}/${segment(repo)}/pulls`, {
      query: {
        state,
        page: pageNumber(page),
        limit: clampLimit(limit, 30),
      },
    });
  }

  async getPullRequest(owner, repo, index) {
    return this.json(
      `/repos/${segment(owner)}/${segment(repo)}/pulls/${segment(index)}`,
    );
  }

  async getPullRequestFiles(owner, repo, index, { page, limit } = {}) {
    return this.json(
      `/repos/${segment(owner)}/${segment(repo)}/pulls/${segment(index)}/files`,
      { query: { page: pageNumber(page), limit: clampLimit(limit, 30) } },
    );
  }

  async getPullRequestDiff(owner, repo, index) {
    const response = await this.request(
      `/repos/${segment(owner)}/${segment(repo)}/pulls/${segment(index)}.diff`,
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
}
