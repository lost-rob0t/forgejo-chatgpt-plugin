#!/usr/bin/env node

import { loadConfig } from './config.mjs';
import { ForgejoClient } from './forgejo.mjs';
import { createMcpHttpServer } from './http.mjs';
import { handleMcpMessage } from './protocol.mjs';

const config = await loadConfig();
const client = new ForgejoClient({
  baseUrl: config.forgejoBaseUrl,
  token: config.forgejoToken,
  maxFileBytes: config.maxFileBytes,
  maxDiffBytes: config.maxDiffBytes,
});

const server = createMcpHttpServer({
  client,
  handleMessage: handleMcpMessage,
  inboundBearerToken: config.inboundBearerToken,
});

server.listen(config.port, config.listenAddress, () => {
  console.error(
    `forgejo-chatgpt-plugin listening on http://${config.listenAddress}:${config.port}/mcp`,
  );
});

function shutdown(signal) {
  console.error(`received ${signal}; shutting down`);
  server.close((error) => {
    if (error) {
      console.error(error);
      process.exitCode = 1;
    }
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
