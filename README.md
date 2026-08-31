# forgejo-chatgpt-plugin

A Forgejo MCP server intended for ChatGPT custom apps / Developer Mode.

It gives a normal ChatGPT conversation structured **read and write** access to a private Forgejo instance without giving the model a shell, SSH key, or raw database access.

## Current scope

v0.2 exposes 29 MCP tools: 14 read tools and 15 mutation tools.

Read operations include:

- Forgejo connectivity/version
- repositories, branches, commits, trees, and bounded UTF-8 files
- repository code search
- issues
- pull requests, changed files, and bounded unified diffs

Write operations include:

- create/delete branches
- create/update/delete one file
- atomically create/update/move/delete up to 100 files in one commit
- create/edit/comment on issues
- create/edit/comment on pull requests
- request PR reviewers
- submit APPROVED / COMMENT / REQUEST_CHANGES reviews
- merge pull requests using Forgejo merge/rebase/rebase-merge/squash/fast-forward-only modes

`forgejo_delete_branch`, `forgejo_delete_file`, and `forgejo_merge_pull_request` are explicitly marked destructive in MCP tool annotations. Other mutation tools are marked writable/non-destructive.

For coding work, prefer `forgejo_commit_changes`: it can make a feature branch and apply a multi-file patch in one Forgejo commit rather than creating one commit per file.

## Architecture

```text
ChatGPT normal chat
        |
        | MCP over HTTPS / Secure MCP Tunnel
        v
forgejo-chatgpt-plugin
        |
        | Forgejo REST API + scoped token
        v
private Forgejo
```

The MCP service has no Git SSH key and does not execute arbitrary shell commands.

## Why no runtime dependencies?

The initial server uses Node's standard library and the JSON-RPC/MCP tool surface directly. This keeps the Nix closure small and avoids an npm runtime supply-chain dependency at the Git write boundary.

It implements the legacy Streamable HTTP request flow used by current MCP clients. A modern MCP client probing `server/discover` receives `Method not found`, allowing clients that support legacy fallback to continue with `initialize`.

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

The Forgejo secret may also be supplied as `FORGEJO_TOKEN`, but a file-backed secret is preferred for deployment.

The Forgejo account/token determines what ChatGPT can actually mutate. For full coding/issue/PR operation it needs repository write permission; avoid instance-admin scope.

## Test

```sh
npm test
```

The tests use Node's built-in test runner and have no external dependencies. They cover request authentication, bounded reads, mutation verbs/bodies, atomic multi-file commits, merge payloads, MCP tool routing, write/destructive annotations, HTTP transport, and inbound bearer auth.

## Nix

Build the package:

```sh
nix build
```

The flake exports:

- `packages.<system>.default`
- `nixosModules.default`
- `devShells.<system>.default`

Example NixOS service when the MCP server runs beside Forgejo:

```nix
{
  imports = [ inputs.forgejo-chatgpt-plugin.nixosModules.default ];

  services.forgejo-chatgpt-plugin = {
    enable = true;
    forgejoBaseUrl = "http://127.0.0.1:3000";
    tokenFile = "/var/lib/starintel/secrets/forgejo-chatgpt-token";
    listenAddress = "127.0.0.1";
    port = 9473;
  };
}
```

Using Forgejo's local/private listener avoids bouncing MCP API traffic through the public Git ingress path. `tokenFile` and `inboundBearerTokenFile` are runtime path strings. The module loads them with systemd credentials so token values are not placed in the Nix store or process arguments.

## ChatGPT

See [`docs/chatgpt.md`](docs/chatgpt.md) for the Developer Mode and **normal Chat mode** test flow.

The intended StarIntel endpoint is:

```text
https://mcp.git.starintel.actor/mcp
```

Do not expose an unauthenticated write-capable MCP endpoint to the public Internet. Prefer Secure MCP Tunnel for the first private deployment, or place an authenticated TLS boundary in front of `/mcp`.

## License

AGPL-3.0-only.
