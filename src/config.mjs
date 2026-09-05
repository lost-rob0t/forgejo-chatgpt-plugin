import { readFile } from 'node:fs/promises';

const DEFAULT_PORT = 9473;
const DEFAULT_MAX_FILE_BYTES = 512 * 1024;
const DEFAULT_MAX_DIFF_BYTES = 1024 * 1024;

function parsePositiveInt(name, value, fallback) {
  if (value === undefined || value === '') return fallback;

  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }

  return parsed;
}

function normalizeBaseUrl(value) {
  if (!value) throw new Error('FORGEJO_BASE_URL is required');

  const url = new URL(value);
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('FORGEJO_BASE_URL must use http or https');
  }

  return url.toString().replace(/\/$/, '');
}

async function readSecret(env, directName, fileName, required = false) {
  const file = env[fileName];
  if (file) {
    const value = (await readFile(file, 'utf8')).trim();
    if (!value && required) throw new Error(`${fileName} is empty`);
    return value || undefined;
  }

  const value = env[directName]?.trim();
  if (!value && required) {
    throw new Error(`${directName} or ${fileName} is required`);
  }

  return value || undefined;
}

export async function loadConfig(env = process.env) {
  const forgejoToken = await readSecret(
    env,
    'FORGEJO_TOKEN',
    'FORGEJO_TOKEN_FILE',
    true,
  );
  const inboundBearerToken = await readSecret(
    env,
    'MCP_BEARER_TOKEN',
    'MCP_BEARER_TOKEN_FILE',
    false,
  );

  return {
    forgejoBaseUrl: normalizeBaseUrl(env.FORGEJO_BASE_URL),
    forgejoToken,
    inboundBearerToken,
    listenAddress: env.LISTEN_ADDRESS?.trim() || '127.0.0.1',
    port: parsePositiveInt('PORT', env.PORT, DEFAULT_PORT),
    maxFileBytes: parsePositiveInt(
      'MAX_FILE_BYTES',
      env.MAX_FILE_BYTES,
      DEFAULT_MAX_FILE_BYTES,
    ),
    maxDiffBytes: parsePositiveInt(
      'MAX_DIFF_BYTES',
      env.MAX_DIFF_BYTES,
      DEFAULT_MAX_DIFF_BYTES,
    ),
  };
}
