import { handleMcpMessage as handleLegacyMcpMessage, TOOLS } from './mcp.mjs';

export const MODERN_PROTOCOL_VERSION = '2026-07-28';

const PROTOCOL_VERSION_META = 'io.modelcontextprotocol/protocolVersion';
const SERVER_INFO_META = 'io.modelcontextprotocol/serverInfo';
const SERVER_INFO = {
  name: 'forgejo-chatgpt-plugin',
  version: '0.2.0',
};
const INSTRUCTIONS =
  'Forgejo repository access with explicit read and write tools. Prefer feature branches plus pull requests for code changes. Read current file SHAs before update/delete operations. Merge, branch deletion, and file deletion are destructive actions and should only be used when the user clearly requests them.';

function jsonRpcError(id, code, message, data) {
  return {
    jsonrpc: '2.0',
    id: id ?? null,
    error: {
      code,
      message,
      ...(data === undefined ? {} : { data }),
    },
  };
}

function requestMeta(message) {
  return message?.params?._meta ?? {};
}

function bodyProtocolVersion(message) {
  return requestMeta(message)[PROTOCOL_VERSION_META];
}

function isRequest(message) {
  return message?.id !== undefined && message?.id !== null;
}

function expectedNameHeader(message) {
  if (message?.method === 'tools/call') return message?.params?.name;
  if (message?.method === 'resources/read') return message?.params?.uri;
  if (message?.method === 'prompts/get') return message?.params?.name;
  return undefined;
}

function validateModernRequest(message, context) {
  const bodyVersion = bodyProtocolVersion(message);
  const headerVersion = context.protocolVersion;

  if (bodyVersion !== MODERN_PROTOCOL_VERSION) {
    return jsonRpcError(
      message.id,
      -32602,
      'Modern MCP requests must declare io.modelcontextprotocol/protocolVersion in params._meta',
    );
  }

  if (!headerVersion) {
    return jsonRpcError(
      message.id,
      -32602,
      'Modern MCP HTTP requests require MCP-Protocol-Version',
    );
  }

  if (headerVersion !== bodyVersion) {
    return jsonRpcError(message.id, -32020, 'Header mismatch: MCP-Protocol-Version does not match request metadata', {
      header: headerVersion,
      body: bodyVersion,
    });
  }

  if (!isRequest(message)) return null;

  if (!context.methodHeader) {
    return jsonRpcError(message.id, -32020, 'Header mismatch: Mcp-Method is required for modern MCP requests');
  }

  if (context.methodHeader !== message.method) {
    return jsonRpcError(message.id, -32020, 'Header mismatch: Mcp-Method does not match JSON-RPC method', {
      header: context.methodHeader,
      body: message.method,
    });
  }

  const expectedName = expectedNameHeader(message);
  if (expectedName !== undefined) {
    if (!context.nameHeader) {
      return jsonRpcError(message.id, -32020, 'Header mismatch: Mcp-Name is required for this MCP request');
    }
    if (context.nameHeader !== String(expectedName)) {
      return jsonRpcError(message.id, -32020, 'Header mismatch: Mcp-Name does not match request parameters', {
        header: context.nameHeader,
        body: String(expectedName),
      });
    }
  }

  return null;
}

function modernMeta(existing = {}) {
  return {
    ...existing,
    [SERVER_INFO_META]: SERVER_INFO,
  };
}

function completeModernResponse(response, method) {
  if (!response || response.error || !response.result) return response;

  const result = {
    ...response.result,
    resultType: 'complete',
    _meta: modernMeta(response.result._meta),
  };

  if (method === 'tools/list') {
    result.ttlMs = 30_000;
    result.cacheScope = 'private';
  }

  return {
    ...response,
    result,
  };
}

function discoverResponse(message) {
  return {
    jsonrpc: '2.0',
    id: message.id,
    result: {
      resultType: 'complete',
      supportedVersions: [MODERN_PROTOCOL_VERSION],
      capabilities: {
        tools: { listChanged: false },
      },
      instructions: INSTRUCTIONS,
      ttlMs: 30_000,
      cacheScope: 'private',
      _meta: modernMeta(),
    },
  };
}

export function isModernMessage(message, context = {}) {
  return (
    bodyProtocolVersion(message) === MODERN_PROTOCOL_VERSION ||
    context.protocolVersion === MODERN_PROTOCOL_VERSION
  );
}

export function protocolHttpStatus(result, modern) {
  if (!modern || !result?.error) return 200;
  if ([-32602, -32020, -32022].includes(result.error.code)) return 400;
  return 200;
}

export async function handleMcpMessage(client, message, context = {}) {
  const modern = isModernMessage(message, context);

  if (!modern) {
    return handleLegacyMcpMessage(client, message);
  }

  const validationError = validateModernRequest(message, context);
  if (validationError) return validationError;

  if (message.method === 'server/discover') {
    return discoverResponse(message);
  }

  if (message.method === 'initialize' || message.method === 'ping') {
    return jsonRpcError(
      message.id,
      -32022,
      `${message.method} is not available in MCP ${MODERN_PROTOCOL_VERSION}`,
    );
  }

  const response = await handleLegacyMcpMessage(client, message);
  return completeModernResponse(response, message.method);
}

export { TOOLS };
