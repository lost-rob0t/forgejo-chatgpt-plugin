# forgejo-chatgpt-plugin

A small, read-only Forgejo MCP server intended for ChatGPT custom apps / Developer Mode.

It gives a normal ChatGPT conversation structured access to a private Forgejo instance without giving the model a shell, SSH key, or raw database access.

## Current scope

v0.1 is intentionally read-only. It can:

- test Forgejo connectivity/version
- list and inspect repositories
- list branches and commits
- read Git trees and bounded UTF-8 files
- search repository code
- list/read issues
- list/read pull requests
- inspect changed files and bounded unified diffs

It cannot mutate Forgejo state.

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

The initial server uses Node's standard library and the stable JSON-RPC/MCP tool surface directly. This keeps the Nix closure small and avoids an npm supply-chain dependency for the service boundary.

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
- max file: 512 KiB
- max PR diff: 1 MiB

Optional inbound MCP authentication:

```sh
export MCP_BEARER_TOKEN_FILE='/run/secrets/mcp-bearer-token'
```

The Forgejo secret may also be supplied as `FORGEJO_TOKEN`, but a file-backed secret is preferred for deployment.

## Test

```sh
npm test
```

The tests use Node's built-in test runner and have no external dependencies.

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
    forgejoBaseUrl = "https://git.starintel.actor";
    tokenFile = config.sops.secrets.forgejo-chatgpt-token.path;
    listenAddress = "127.0.0.1";
    port = 9473;
  };
}
```

The module loads secrets with systemd credentials so the token value is not placed in the Nix store or process arguments.

## ChatGPT

See [`docs/chatgpt.md`](docs/chatgpt.md) for the Developer Mode and **normal Chat mode** test flow.

The intended StarIntel endpoint is:

```text
https://mcp.git.starintel.actor/mcp
```

Do not expose an unauthenticated MCP endpoint to the public Internet. Prefer Secure MCP Tunnel for a private deployment, or put an appropriate authentication layer in front of the MCP endpoint.

## License

AGPL-3.0-only.
