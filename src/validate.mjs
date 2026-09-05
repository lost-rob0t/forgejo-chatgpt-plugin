export class ToolArgumentError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ToolArgumentError';
  }
}

function fail(path, message) {
  throw new ToolArgumentError(`${path}: ${message}`);
}

function isPlainObject(value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype ||
      Object.getPrototypeOf(value) === null)
  );
}

function validateEnum(schema, value, path) {
  if (!Array.isArray(schema.enum)) return;
  if (!schema.enum.some((item) => Object.is(item, value))) {
    fail(path, `must be one of ${schema.enum.map((item) => JSON.stringify(item)).join(', ')}`);
  }
}

function validateAnyOf(schema, value, path, depth) {
  if (!Array.isArray(schema.anyOf)) return false;

  const errors = [];
  for (const candidate of schema.anyOf) {
    try {
      validateSchema(candidate, value, path, depth + 1);
      return true;
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  fail(path, `does not match any allowed schema (${errors.join('; ')})`);
}

function validateObject(schema, value, path, depth) {
  if (!isPlainObject(value)) fail(path, 'must be an object');

  const properties = schema.properties ?? {};
  const required = schema.required ?? [];

  for (const key of required) {
    if (!Object.hasOwn(value, key)) fail(`${path}.${key}`, 'is required');
  }

  if (schema.additionalProperties === false) {
    for (const key of Object.keys(value)) {
      if (!Object.hasOwn(properties, key)) {
        fail(`${path}.${key}`, 'is not an allowed property');
      }
    }
  }

  for (const [key, childSchema] of Object.entries(properties)) {
    if (!Object.hasOwn(value, key)) continue;
    validateSchema(childSchema, value[key], `${path}.${key}`, depth + 1);
  }
}

function validateArray(schema, value, path, depth) {
  if (!Array.isArray(value)) fail(path, 'must be an array');

  if (schema.minItems !== undefined && value.length < schema.minItems) {
    fail(path, `must contain at least ${schema.minItems} item(s)`);
  }
  if (schema.maxItems !== undefined && value.length > schema.maxItems) {
    fail(path, `must contain at most ${schema.maxItems} item(s)`);
  }

  if (schema.items) {
    value.forEach((item, index) => {
      validateSchema(schema.items, item, `${path}[${index}]`, depth + 1);
    });
  }
}

function validateString(schema, value, path) {
  if (typeof value !== 'string') fail(path, 'must be a string');
  if (schema.minLength !== undefined && value.length < schema.minLength) {
    fail(path, `must contain at least ${schema.minLength} character(s)`);
  }
}

function validateInteger(schema, value, path) {
  if (!Number.isSafeInteger(value)) fail(path, 'must be a safe integer');
  if (schema.minimum !== undefined && value < schema.minimum) {
    fail(path, `must be >= ${schema.minimum}`);
  }
  if (schema.maximum !== undefined && value > schema.maximum) {
    fail(path, `must be <= ${schema.maximum}`);
  }
}

function validateNumber(schema, value, path) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    fail(path, 'must be a finite number');
  }
  if (schema.minimum !== undefined && value < schema.minimum) {
    fail(path, `must be >= ${schema.minimum}`);
  }
  if (schema.maximum !== undefined && value > schema.maximum) {
    fail(path, `must be <= ${schema.maximum}`);
  }
}

export function validateSchema(schema, value, path = '$', depth = 0) {
  if (!schema || typeof schema !== 'object') return;
  if (depth > 64) fail(path, 'schema validation depth exceeded');

  if (validateAnyOf(schema, value, path, depth)) return;

  validateEnum(schema, value, path);

  switch (schema.type) {
    case undefined:
      return;
    case 'object':
      validateObject(schema, value, path, depth);
      return;
    case 'array':
      validateArray(schema, value, path, depth);
      return;
    case 'string':
      validateString(schema, value, path);
      return;
    case 'integer':
      validateInteger(schema, value, path);
      return;
    case 'number':
      validateNumber(schema, value, path);
      return;
    case 'boolean':
      if (typeof value !== 'boolean') fail(path, 'must be a boolean');
      return;
    case 'null':
      if (value !== null) fail(path, 'must be null');
      return;
    default:
      fail(path, `unsupported schema type ${String(schema.type)}`);
  }
}

export function validateToolArguments(tool, args) {
  if (!tool) throw new ToolArgumentError('unknown tool');
  validateSchema(tool.inputSchema, args ?? {}, '$');
}
