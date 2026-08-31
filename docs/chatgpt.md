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
2. Open **Settings -> Apps -> Create** (or the matching workspace Apps creation screen).
3. Name the app `StarIntel Forgejo` or similar.
4. Set the MCP endpoint to `https://mcp.git.starintel.actor/mcp`.
5. Choose the authentication mode appropriate for the deployment.
6. Select **Scan Tools**.
7. Verify the scan finds only the read-only `forgejo_*` tools.
8. Create/save the draft app.

If the MCP endpoint is private, use Secure MCP Tunnel rather than exposing an unauthenticated MCP server publicly.

## 3. Test in normal Chat mode

Open a **new normal chat**. Do not enter Work mode or Agent mode.

Select the draft app from the tools/apps menu for the message, or mention the app if the UI offers app mentions.

Useful smoke-test prompts:

```
Use StarIntel Forgejo and tell me which Forgejo version it is connected to.
```

```
Use StarIntel Forgejo and list the repositories you can see.
```

```
Use StarIntel Forgejo to inspect lost-rob0t/prolog-rlm and show me its open pull requests.
```

```
Use StarIntel Forgejo to read README.md from lost-rob0t/prolog-rlm.
```

For a tool-routing test, ask for something that cannot be answered from the chat context alone and explicitly name the app.

## 4. Expected tool surface

The v0.1 server is deliberately read-only:

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

No issue creation, comments, merges, branch creation, file writes, repository deletion, or admin tools are present in this slice.

## 5. Local MCP protocol smoke test

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

If `MCP_BEARER_TOKEN_FILE` is configured, add `Authorization: Bearer ...` to local smoke-test requests.
