{ config, lib, pkgs, ... }:

let
  cfg = config.services.forgejo-chatgpt-plugin;
  credentialDir = "/run/credentials/forgejo-chatgpt-plugin.service";
  defaultPackage = pkgs.callPackage ./package.nix { };
in
{
  options.services.forgejo-chatgpt-plugin = {
    enable = lib.mkEnableOption "Forgejo ChatGPT MCP server";

    package = lib.mkOption {
      type = lib.types.package;
      default = defaultPackage;
      description = "Package providing the forgejo-chatgpt-plugin executable.";
    };

    forgejoBaseUrl = lib.mkOption {
      type = lib.types.str;
      example = "https://git.starintel.actor";
      description = "Base URL of the Forgejo instance.";
    };

    tokenFile = lib.mkOption {
      type = lib.types.path;
      description = "Runtime path to a read-only Forgejo access token.";
    };

    inboundBearerTokenFile = lib.mkOption {
      type = lib.types.nullOr lib.types.path;
      default = null;
      description = "Optional runtime bearer token required by the MCP HTTP endpoint.";
    };

    listenAddress = lib.mkOption {
      type = lib.types.str;
      default = "127.0.0.1";
      description = "Address the MCP HTTP server binds to.";
    };

    port = lib.mkOption {
      type = lib.types.port;
      default = 9473;
      description = "TCP port for the MCP HTTP server.";
    };

    maxFileBytes = lib.mkOption {
      type = lib.types.ints.positive;
      default = 524288;
      description = "Maximum decoded repository file size returned to ChatGPT.";
    };

    maxDiffBytes = lib.mkOption {
      type = lib.types.ints.positive;
      default = 1048576;
      description = "Maximum pull-request diff bytes returned to ChatGPT.";
    };
  };

  config = lib.mkIf cfg.enable {
    assertions = [
      {
        assertion = cfg.forgejoBaseUrl != "";
        message = "services.forgejo-chatgpt-plugin.forgejoBaseUrl must not be empty";
      }
    ];

    systemd.services.forgejo-chatgpt-plugin = {
      description = "Forgejo ChatGPT MCP server";
      wantedBy = [ "multi-user.target" ];
      wants = [ "network-online.target" ];
      after = [ "network-online.target" ];

      environment = {
        FORGEJO_BASE_URL = cfg.forgejoBaseUrl;
        FORGEJO_TOKEN_FILE = "${credentialDir}/forgejo-token";
        LISTEN_ADDRESS = cfg.listenAddress;
        PORT = toString cfg.port;
        MAX_FILE_BYTES = toString cfg.maxFileBytes;
        MAX_DIFF_BYTES = toString cfg.maxDiffBytes;
      } // lib.optionalAttrs (cfg.inboundBearerTokenFile != null) {
        MCP_BEARER_TOKEN_FILE = "${credentialDir}/mcp-bearer-token";
      };

      serviceConfig = {
        ExecStart = lib.getExe cfg.package;
        Restart = "on-failure";
        RestartSec = "2s";
        DynamicUser = true;

        LoadCredential =
          [ "forgejo-token:${toString cfg.tokenFile}" ]
          ++ lib.optional (cfg.inboundBearerTokenFile != null)
            "mcp-bearer-token:${toString cfg.inboundBearerTokenFile}";

        NoNewPrivileges = true;
        PrivateDevices = true;
        PrivateTmp = true;
        ProtectClock = true;
        ProtectControlGroups = true;
        ProtectHome = true;
        ProtectHostname = true;
        ProtectKernelLogs = true;
        ProtectKernelModules = true;
        ProtectKernelTunables = true;
        ProtectSystem = "strict";
        RestrictAddressFamilies = [ "AF_UNIX" "AF_INET" "AF_INET6" ];
        RestrictNamespaces = true;
        RestrictRealtime = true;
        SystemCallArchitectures = "native";
        UMask = "0077";
      };
    };
  };
}
