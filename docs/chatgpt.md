# ChatGPT Developer Mode test flow

This server is intended to be used as a custom MCP app from an ordinary ChatGPT conversation. It does not require Work mode.

## 1. Make the MCP endpoint reachable by ChatGPT

ChatGPT must be able to reach the MCP HTTPS endpoint. The application itself can remain bound to a private/local listener behind the authentication/TLS boundary used for the deployment.

The MCP URL ends in:

```text
/mcp
```

The health endpoint is:

```text
/healthz
```

Do not expose an unauthenticated write-capable MCP endpoint to the public Internet.

## 2. Create the custom app

The exact UI may change while Developer Mode is evolving.

1. Enable **Developer mode** in ChatGPT's Apps advanced settings.
2. Open the Apps creation screen.
3. Name the app `Forgejo` or another clear name.
4. Set its MCP endpoint to the deployed `/mcp` URL.
5. Select the authentication mode used by that endpoint.
6. Select **Scan Tools**.
7. Verify the scan finds **39 unique `forgejo_*` tools**.
8. Verify write tools such as `forgejo_commit_changes`, `forgejo_create_issue`, and `forgejo_create_pull_request` are present.
9. Verify merge/file-delete/branch-delete are marked destructive if the UI exposes MCP annotations.
10. Save the app.

## 3. Test in normal Chat mode

Open a **new normal chat**. Do not enter Work mode.

Select the Forgejo app from the tools/apps menu for the message, or mention the app if the UI offers app mentions.

ChatGPT may require confirmation before executing mutation/destructive tools.

Read smoke tests:

```text
Use Forgejo and tell me which Forgejo version it is connected to.
```

```text
Use Forgejo and list the repositories you can see.
```

```text
Use Forgejo to inspect OWNER/REPO and show me its open pull requests, the latest PR comments/reviews, and the current combined status of the PR head.
```

## 4. Prove writes work from Chat mode

Use a disposable/test repository for the first mutation test.

Create a branch:

```text
Use Forgejo to create branch chatgpt-mcp-smoke from main in OWNER/TEST-REPO.
```

Make an atomic commit with `forgejo_commit_changes`:

```text
Use Forgejo to commit two files to chatgpt-mcp-smoke in OWNER/TEST-REPO in one commit:
- mcp-smoke.txt containing "ChatGPT Forgejo write path works"
- mcp-smoke-2.txt containing "atomic multi-file commit works"
Use commit message "test: prove ChatGPT MCP writes".
```

Read both files back and inspect their SHAs:

```text
Use Forgejo to read both smoke files from chatgpt-mcp-smoke and show me their contents and SHAs.
```

Open a pull request:

```text
Use Forgejo to open a pull request from chatgpt-mcp-smoke into main titled "test: ChatGPT MCP write smoke test".
```

Exercise collaboration reads:

```text
Use Forgejo to read the PR conversation, submitted reviews, inline review comments, commits, and commit statuses for that pull request.
```

Exercise issue/label mutation in the disposable repo:

```text
Use Forgejo to list the available repository labels, create a test issue, set one valid label on it, and add a comment saying "ChatGPT issue write path works".
```

Do not use `forgejo_merge_pull_request`, `forgejo_delete_file`, or `forgejo_delete_branch` in the smoke test unless you intentionally want those destructive actions.

## 5. Tool surface

### Read (22)

- `forgejo_ping`
- `forgejo_list_repositories`
- `forgejo_get_repository`
- `forgejo_list_branches`
- `forgejo_list_commits`
- `forgejo_get_tree`
- `forgejo_read_file`
- `forgejo_search_code`
- `forgejo_list_labels`
- `forgejo_list_issues`
- `forgejo_get_issue`
- `forgejo_list_issue_comments`
- `forgejo_list_pull_requests`
- `forgejo_get_pull_request`
- `forgejo_get_pull_request_files`
- `forgejo_get_pull_request_diff`
- `forgejo_list_pull_request_comments`
- `forgejo_list_pull_request_reviews`
- `forgejo_get_pull_request_review_comments`
- `forgejo_get_pull_request_commits`
- `forgejo_get_combined_status`
- `forgejo_list_commit_statuses`

### Write (17)

- `forgejo_create_branch`
- `forgejo_delete_branch` **destructive**
- `forgejo_create_file`
- `forgejo_update_file`
- `forgejo_delete_file` **destructive**
- `forgejo_commit_changes`
- `forgejo_create_issue`
- `forgejo_edit_issue`
- `forgejo_comment_issue`
- `forgejo_replace_issue_labels`
- `forgejo_create_pull_request`
- `forgejo_edit_pull_request`
- `forgejo_comment_pull_request`
- `forgejo_replace_pull_request_labels`
- `forgejo_request_pull_request_reviewers`
- `forgejo_review_pull_request`
- `forgejo_merge_pull_request` **destructive**

The Forgejo account/token decides which operations actually succeed.

## 6. Modern MCP protocol smoke test

The preferred direct protocol test uses MCP `2026-07-28`.

### Discovery

```sh
curl -sS http://127.0.0.1:9473/mcp \
  -H 'content-type: application/json' \
  -H 'MCP-Protocol-Version: 2026-07-28' \
  -H 'Mcp-Method: server/discover' \
  --data '{
    "jsonrpc":"2.0",
    "id":"discover",
    "method":"server/discover",
    "params":{"_meta":{
      "io.modelcontextprotocol/protocolVersion":"2026-07-28",
      "io.modelcontextprotocol/clientCapabilities":{}
    }}
  }'
```

### List tools

```sh
curl -sS http://127.0.0.1:9473/mcp \
  -H 'content-type: application/json' \
  -H 'MCP-Protocol-Version: 2026-07-28' \
  -H 'Mcp-Method: tools/list' \
  --data '{
    "jsonrpc":"2.0",
    "id":"tools",
    "method":"tools/list",
    "params":{"_meta":{
      "io.modelcontextprotocol/protocolVersion":"2026-07-28",
      "io.modelcontextprotocol/clientCapabilities":{}
    }}
  }'
```

### Call a tool

A modern `tools/call` request must include `Mcp-Name` matching `params.name`:

```sh
curl -sS http://127.0.0.1:9473/mcp \
  -H 'content-type: application/json' \
  -H 'MCP-Protocol-Version: 2026-07-28' \
  -H 'Mcp-Method: tools/call' \
  -H 'Mcp-Name: forgejo_ping' \
  --data '{
    "jsonrpc":"2.0",
    "id":"ping",
    "method":"tools/call",
    "params":{
      "name":"forgejo_ping",
      "arguments":{},
      "_meta":{
        "io.modelcontextprotocol/protocolVersion":"2026-07-28",
        "io.modelcontextprotocol/clientCapabilities":{}
      }
    }
  }'
```

If inbound bearer authentication is configured, add `Authorization: Bearer ...` to these requests.

## 7. Legacy compatibility

Handshake-era MCP remains supported for compatible clients:

```sh
curl -sS http://127.0.0.1:9473/mcp \
  -H 'content-type: application/json' \
  --data '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"curl-smoke","version":"1"}}}'
```

The modern path should be used when testing current ChatGPT tool discovery.
