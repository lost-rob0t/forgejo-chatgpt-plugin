import { handleMcpMessage as handleCoreMcpMessage, TOOLS as CORE_TOOLS } from './mcp.mjs';
import {
  callCollaborationTool,
  collaborationToolNames,
  COLLABORATION_TOOLS,
  EDIT_PULL_REQUEST_OVERRIDE,
} from './collaboration.mjs';

export const MODERN_PROTOCOL_VERSION = '2026-07-28';

const PROTOCOL_VERSION_META = 'io.modelcontextprotocol/protocolVersion';
const CLIENT_INFO_META = 'io.modelcontextprotocol/clientInfo';
const SERVER_INFO_META = 'io.modelcontextprotocol/serverInfo';
const SERVER_INFO = {
  name: 'forgejo-chatgpt-plugin',
  version: '0.2.0',
};
const INSTRUCTIONS =
  'Forgejo repository access with explicit read and write tools. Prefer feature branches plus pull requests for code changes. Read current file SHAs before update/delete operations. Read issue and pull-request comments/reviews before acting on discussion context. Merge, branch deletion, and file deletion are destructive actions and should only be used when the user clearly requests them.';

const TOOL_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    data: {},
  },
  required: ['data'],
  additionalProperties: false,
};

const COLLABORATION_NAMES = collaborationToolNames();
const OVERRIDDEN_TOOL_NAMES = new Set([EDIT_PULL_REQUEST_OVERRIDE.name]);

const COMPOSED_TOOLS = [
  ...CORE_TOOLS.filter((tool) => !OVERRIDDEN_TOOL_NAMES.has(tool.name)),
  EDIT_PULL_REQUEST_OVERRIDE,
  ...COLLABORATION_TOOLS,
];

export const TOOLS = COMPOSED_TOOLS.map((tool) => ({
  ...tool,
  outputSchema: tool.outputSchema ?? TOOL_OUTPUT_SCHEMA,
}));

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

function textResult(value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  return {
    content: [{ type: 'text', text }],
    structuredContent: { data: value },
  };
}

function errorResult(error) {
  const message = error instanceof Error ? error.message : String(error);
  return { content: [{ type: 'text', text: message }], isError: true };
}

function addStructuredContent(response) {
  if (
    !response ||
    response.error ||
    !response.result ||
    response.result.isError ||
    response.result.structuredContent !== undefined
  ) {
    return response;
  }

  const textBlock = response.result.content?.find((block) => block?.type === 'text');
  if (!textBlock || typeof textBlock.text !== 'string') return response;

  let data = textBlock.text;
  try {
    data = JSON.parse(textBlock.text);
  } catch {
    // Plain text is still useful structured data when wrapped in an object.
  }

  return {
    ...response,
    result: {
      ...response.result,
      structuredContent: { data },
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

function validateClientInfo(message) {
  const clientInfo = requestMeta(message)[CLIENT_INFO_META];
  if (clientInfo === undefined) return null;

  if (
    !clientInfo ||
    typeof clientInfo !== 'object' ||
    Array.isArray(clientInfo) ||
    typeof clientInfo.name !== 'string' ||
    clientInfo.name.length === 0 ||
    typeof clientInfo.version !== 'string' ||
    clientInfo.version.length === 0
  ) {
    return jsonRpcError(
      message.id,
      -32602,
      'io.modelcontextprotocol/clientInfo must contain non-empty name and version strings',
    );
  }

  return null;
}

function validateModernRequest(message, context) {
  const bodyVersion = bodyProtocolVersion(message);
  const headerVersion = context.protocolVersion;

  if (bodyVersion === undefined) {
    return jsonRpcError(
      message.id,
      -32602,
      'Modern MCP requests must declare io.modelcontextprotocol/protocolVersion in params._meta',
    );
  }

  if (bodyVersion !== MODERN_PROTOCOL_VERSION) {
    return jsonRpcError(
      message.id,
      -32022,
      `Unsupported MCP protocol version: ${String(bodyVersion)}`,
      { supportedVersions: [MODERN_PROTOCOL_VERSION] },
    );
  }

  const clientInfoError = validateClientInfo(message);
  if (clientInfoError) return clientInfoError;

  if (!headerVersion) {
    return jsonRpcError(
      message.id,
      -32602,
      'Modern MCP HTTP requests require MCP-Protocol-Version',
    );
  }

  if (headerVersion !== bodyVersion) {
    return jsonRpcError(
      message.id,
      -32020,
      'Header mismatch: MCP-Protocol-Version does not match request metadata',
      { header: headerVersion, body: bodyVersion },
    );
  }

  if (!isRequest(message)) return null;

  if (!context.methodHeader) {
    return jsonRpcError(
      message.id,
      -32020,
      'Header mismatch: Mcp-Method is required for modern MCP requests',
    );
  }

  if (context.methodHeader !== message.method) {
    return jsonRpcError(
      message.id,
      -32020,
      'Header mismatch: Mcp-Method does not match JSON-RPC method',
      { header: context.methodHeader, body: message.method },
    );
  }

  const expectedName = expectedNameHeader(message);
  if (expectedName !== undefined) {
    if (!context.nameHeader) {
      return jsonRpcError(
        message.id,
        -32020,
        'Header mismatch: Mcp-Name is required for this MCP request',
      );
    }
    if (context.nameHeader !== String(expectedName)) {
      return jsonRpcError(
        message.id,
        -32020,
        'Header mismatch: Mcp-Name does not match request parameters',
        { header: context.nameHeader, body: String(expectedName) },
      );
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

  return { ...response, result };
}

function discoverResponse(message) {
  return {
    jsonrpc: '2.0',
    id: message.id,
    result: {
      resultType: 'complete',
      supportedVersions: [MODERN_PROTOCOL_VERSION],
      capabilities: { tools: { listChanged: false } },
      instructions: INSTRUCTIONS,
      ttlMs: 30_000,
      cacheScope: 'private',
      _meta: modernMeta(),
    },
  };
}

function isCollaborationTool(name) {
  return COLLABORATION_NAMES.has(name) || OVERRIDDEN_TOOL_NAMES.has(name);
}

async function handleToolsCall(client, message) {
  const name = message.params?.name;
  const args = message.params?.arguments ?? {};

  if (typeof name !== 'string') {
    return jsonRpcError(message.id, -32602, 'tools/call requires a tool name');
  }

  if (!isCollaborationTool(name)) {
    return addStructuredContent(await handleCoreMcpMessage(client, message));
  }

  try {
    const result = await callCollaborationTool(client, name, args);
    return {
      jsonrpc: '2.0',
      id: message.id,
      result: textResult(result),
    };
  } catch (error) {
    return {
      jsonrpc: '2.0',
      id: message.id,
      result: errorResult(error),
    };
  }
}

async function handleApplicationMessage(client, message) {
  if (message.method === 'tools/list') {
    return {
      jsonrpc: '2.0',
      id: message.id,
      result: { tools: TOOLS },
    };
  }

  if (message.method === 'tools/call') {
    return handleToolsCall(client, message);
  }

  return handleCoreMcpMessage(client, message);
}

export function isModernMessage(message, context = {}) {
  return (
    bodyProtocolVersion(message) !== undefined ||
    context.protocolVersion === MODERN_PROTOCOL_VERSION
  );
}

export async function handleMcpMessage(client, message, context = {}) {
  const modern = isModernMessage(message, context);

  if (!modern) {
    return handleApplicationMessage(client, message);
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

  const response = await handleApplicationMessage(client, message);
  return completeModernResponse(response, message.method);
}
