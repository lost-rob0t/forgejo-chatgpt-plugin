# ChatGPT Developer Mode test flow

This server is designed to be used as a custom MCP app from an ordinary ChatGPT conversation. It does not require Work mode.

## 1. Deploy a remote MCP endpoint

ChatGPT does not connect directly to a localhost-only MCP endpoint. Deploy the service behind HTTPS or use OpenAI's Secure MCP Tunnel for a server on a private network.

The MCP URL is:

```
https://<host>/mcp
```

The health check is:

```
https://<host>/healthz
```

For the StarIntel deployment the intended endpoint is:

```
https://mcp.git.starintel.actor/mcp
```

Keep the application itself bound to `127.0.0.1:9473` when a local reverse proxy or tunnel terminates the external connection.

## 2. Create the custom app

The exact UI is account/workspace dependent and may change while Developer Mode is in beta.

1. Enable **Developer mode** in ChatGPT's Apps advanced settings.
2. Open **Settings -> Apps -> Create** (or the matching Apps creation screen).
3. Name the app `StarIntel Forgejo` or similar.
4. Set the MCP endpoint to the tunneled endpoint or `https://mcp.git.starintel.actor/mcp`.
5. Choose the authentication mode appropriate for the deployment.
6. Select **Scan Tools**.
7. Verify the scan finds 29 `forgejo_*` tools, including mutation tools such as `forgejo_commit_changes`, `forgejo_create_issue`, and `forgejo_create_pull_request`.
8. Verify delete/merge tools are shown as destructive/write operations if the UI surfaces MCP annotations.
9. Create/save the draft app.

If the MCP endpoint is private, use Secure MCP Tunnel rather than exposing an unauthenticated write-capable MCP server publicly.

## 3. Test in normal Chat mode

Open a **new normal chat**. Do not enter Work mode.

Select the draft app from the tools/apps menu for the message, or mention the app if the UI offers app mentions.

Read smoke tests:

```
Use StarIntel Forgejo and tell me which Forgejo version it is connected to.
```

```
Use StarIntel Forgejo and list the repositories you can see.
```

```
Use StarIntel Forgejo to inspect lost-rob0t/prolog-rlm and show me its open pull requests.
```

## 4. Prove writes work from Chat mode

Use a disposable/test repository for the first mutation test.

First ask ChatGPT to create a branch:

```
Use StarIntel Forgejo to create branch chatgpt-mcp-smoke from main in OWNER/TEST-REPO.
```

Then create a file on that branch:

```
Use StarIntel Forgejo to create mcp-smoke.txt on branch chatgpt-mcp-smoke in OWNER/TEST-REPO with the text "ChatGPT Forgejo write path works" and commit message "test: prove ChatGPT MCP writes".
```

Then make ChatGPT read it back:

```
Use StarIntel Forgejo to read mcp-smoke.txt from chatgpt-mcp-smoke in OWNER/TEST-REPO and show me the content and SHA.
```

Then update it using the SHA returned by the read call:

```
Use StarIntel Forgejo to update mcp-smoke.txt on chatgpt-mcp-smoke to add a second line "update works too" and commit it.
```

Then open a pull request:

```
Use StarIntel Forgejo to open a pull request from chatgpt-mcp-smoke into main titled "test: ChatGPT MCP write smoke test".
```

Do not use the merge tool for the first smoke test unless you intentionally want to merge the test PR. `forgejo_merge_pull_request`, `forgejo_delete_file`, and `forgejo_delete_branch` are marked destructive.

For a multi-file coding test, ask ChatGPT to use `forgejo_commit_changes`; it can create/update/delete up to 100 files in one commit and can create a new feature branch at the same time.

## 5. Tool surface

### Read

- `forgejo_ping`
- `forgejo_list_repositories`
- `forgejo_get_repository`
- `forgejo_list_branches`
- `forgejo_list_commits`
- `forgejo_get_tree`
- `forgejo_read_file`
- `forgejo_search_code`
- `forgejo_list_issues`
- `forgejo_get_issue`
- `forgejo_list_pull_requests`
- `forgejo_get_pull_request`
- `forgejo_get_pull_request_files`
- `forgejo_get_pull_request_diff`

### Write

- `forgejo_create_branch`
- `forgejo_delete_branch` (destructive)
- `forgejo_create_file`
- `forgejo_update_file`
- `forgejo_delete_file` (destructive)
- `forgejo_commit_changes`
- `forgejo_create_issue`
- `forgejo_edit_issue`
- `forgejo_comment_issue`
- `forgejo_create_pull_request`
- `forgejo_edit_pull_request`
- `forgejo_comment_pull_request`
- `forgejo_request_pull_request_reviewers`
- `forgejo_review_pull_request`
- `forgejo_merge_pull_request` (destructive)

The Forgejo token decides which of these operations actually succeed. For the intended coding workflow, give the dedicated account repository write permissions but not instance-admin privileges.

## 6. Local MCP protocol smoke test

With the service running locally:

```sh
curl -sS http://127.0.0.1:9473/mcp \
  -H 'content-type: application/json' \
  --data '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"curl-smoke","version":"1"}}}'
```

Then inspect tools:

```sh
curl -sS http://127.0.0.1:9473/mcp \
  -H 'content-type: application/json' \
  -H 'mcp-protocol-version: 2025-11-25' \
  --data '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'
```

A direct local write test against a disposable repository can call `tools/call` with `forgejo_create_branch` or `forgejo_create_issue` before connecting ChatGPT.

If `MCP_BEARER_TOKEN_FILE` is configured, add `Authorization: Bearer ...` to local smoke-test requests.
