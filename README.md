# forgejo-chatgpt-plugin

A Forgejo MCP server for ChatGPT custom apps / Developer Mode.

It gives a normal ChatGPT conversation structured **read and write** access to a Forgejo instance without giving the model a shell, SSH key, generic HTTP client, or raw database access.

## Current scope

v0.2 exposes **39 MCP tools: 22 read tools and 17 mutation tools**.

Read operations cover:

- Forgejo connectivity/version and repositories
- branches, commits, trees, and bounded UTF-8 files
- repository code search
- issues and issue conversation comments
- repository labels
- pull requests, changed files, bounded unified diffs, and PR commits
- PR conversation comments
- submitted PR reviews and inline review comments
- combined and individual commit statuses

Write operations cover:

- create/delete branches
- create/update/delete one file
- atomically create/update/move/delete up to 100 files in one commit
- create/edit/comment on issues
- replace issue labels
- create/edit/comment on pull requests
- replace pull-request labels
- request PR reviewers
- submit APPROVED / COMMENT / REQUEST_CHANGES reviews
- merge pull requests using Forgejo merge/rebase/rebase-merge/squash/fast-forward-only modes

`forgejo_delete_branch`, `forgejo_delete_file`, and `forgejo_merge_pull_request` are explicitly marked destructive in MCP tool annotations. Other mutation tools are marked writable/non-destructive.

For coding work, prefer `forgejo_commit_changes`: it can make a feature branch and apply a multi-file patch in one Forgejo commit rather than producing one commit per file.

## Architecture

```text
ChatGPT normal chat
        |
        | MCP over HTTPS
        v
forgejo-chatgpt-plugin
        |
        | Forgejo REST API + scoped token
        v
Forgejo
```

The MCP service does not execute arbitrary commands and does not require a Git SSH key.

## MCP protocol support

The server supports both MCP lifecycle eras on the same `/mcp` endpoint:

- **MCP 2026-07-28**: stateless lifecycle with `server/discover`, request metadata, `MCP-Protocol-Version`, `Mcp-Method`, and `Mcp-Name` routing headers, and `resultType` response envelopes.
- **2025 handshake-era MCP**: `initialize`, `notifications/initialized`, `tools/list`, and `tools/call` remain supported for compatible clients.

Modern requests are validated against both JSON-RPC metadata and HTTP routing headers so a mismatched tool name/method/version fails closed instead of being routed ambiguously.

## Why no runtime dependencies?

The server uses Node's standard library and the JSON-RPC/MCP tool surface directly. This keeps the runtime closure small and avoids an npm runtime dependency chain at a repository write boundary.

## Run locally

Requirements: Node 22+.

```sh
export FORGEJO_BASE_URL='https://git.example.com'
export FORGEJO_TOKEN_FILE='/run/secrets/forgejo-chatgpt-token'
node src/index.mjs
```

Defaults:

- MCP: `http://127.0.0.1:9473/mcp`
- health: `http://127.0.0.1:9473/healthz`
- max file read: 512 KiB
- max PR diff: 1 MiB

Optional inbound MCP authentication:

```sh
export MCP_BEARER_TOKEN_FILE='/run/secrets/mcp-bearer-token'
```

The Forgejo token determines what the plugin can mutate. For coding/issue/PR operation it needs repository write permission; instance-admin permission is not required.

## Test

```sh
npm test
```

The test suite covers:

- Forgejo authentication and bounded reads
- write HTTP verbs and payloads
- atomic multi-file commits and required file SHAs
- issue/PR labels and comments
- PR review reads/writes
- PR commit and status inspection
- merge payloads
- MCP read/write/destructive annotations
- the 39-tool composed registry
- legacy MCP lifecycle compatibility
- MCP 2026 `server/discover` and routing-header validation
- HTTP media-type and bearer-auth failure paths

GitHub CI runs syntax checks and the full suite on Node 22 and Node 24.

## Modern MCP smoke test

Discovery:

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

Tool discovery:

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

For a modern `tools/call` request, also send `Mcp-Name` with the exact MCP tool name.

## Nix

Build the package:

```sh
nix build
```

The flake exports:

- `packages.<system>.default`
- `nixosModules.default`
- `devShells.<system>.default`

Example NixOS service:

```nix
{
  imports = [ inputs.forgejo-chatgpt-plugin.nixosModules.default ];

  services.forgejo-chatgpt-plugin = {
    enable = true;
    forgejoBaseUrl = "http://127.0.0.1:3000";
    tokenFile = "/run/secrets/forgejo-chatgpt-token";
    listenAddress = "127.0.0.1";
    port = 9473;
  };
}
```

`tokenFile` and `inboundBearerTokenFile` are runtime path strings. The module loads them with systemd credentials so token values do not enter the Nix store or process arguments.

## ChatGPT

See [`docs/chatgpt.md`](docs/chatgpt.md) for Developer Mode setup and **normal Chat mode** read/write smoke tests.

Do not expose an unauthenticated write-capable MCP endpoint to the public Internet.

## License

AGPL-3.0-only.
