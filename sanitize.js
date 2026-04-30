const RESERVED_HEADER_KEYS = new Set([
  'common',
  'delete',
  'get',
  'head',
  'post',
  'put',
  'patch',
  'options',
]);

const SENSITIVE_KEY_PATTERN = /authorization|token|cookie|secret|password|api[-_]?key/i;

/** Defaults tuned so typical API JSON matches console-style snapshots better than the old depth/key caps. */
const DEFAULT_SANITIZE_OPTIONS = {
  maxDepth: 16,
  maxStringLength: 50000,
  maxArrayLength: 500,
  maxObjectKeys: 200,
};

function truncateString(value, maxLength) {
  if (typeof value !== 'string') {
    return value;
  }

  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength)}... [truncated ${value.length - maxLength} chars]`;
}

function maskIfSensitive(key, value) {
  if (typeof key === 'string' && SENSITIVE_KEY_PATTERN.test(key)) {
    return '[REDACTED]';
  }

  return value;
}

function isTypedArray(value) {
  return typeof ArrayBuffer !== 'undefined'
    && ArrayBuffer.isView(value)
    && !(value instanceof DataView);
}

function sanitizeValue(value, options = {}, depth = 0, pathStack = null) {
  const maxDepth = options.maxDepth ?? DEFAULT_SANITIZE_OPTIONS.maxDepth;
  const maxStringLength = options.maxStringLength ?? DEFAULT_SANITIZE_OPTIONS.maxStringLength;
  const maxArrayLength = options.maxArrayLength ?? DEFAULT_SANITIZE_OPTIONS.maxArrayLength;
  const maxObjectKeys = options.maxObjectKeys ?? DEFAULT_SANITIZE_OPTIONS.maxObjectKeys;

  if (value == null) {
    return value;
  }

  if (depth >= maxDepth) {
    return '[Max depth reached]';
  }

  if (typeof value === 'string') {
    return truncateString(value, maxStringLength);
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'bigint') {
    return truncateString(String(value), maxStringLength);
  }

  if (typeof value === 'symbol') {
    return truncateString(String(value), maxStringLength);
  }

  if (typeof value === 'function') {
    return truncateString(`[Function ${value.name || 'anonymous'}]`, maxStringLength);
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: truncateString(value.stack || '', maxStringLength),
    };
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }

  if (typeof Map !== 'undefined' && value instanceof Map) {
    const entries = [...value.entries()].slice(0, maxObjectKeys);
    return entries.reduce((accumulator, [key, entryValue]) => {
      const keyLabel = typeof key === 'string' ? key : truncateString(String(key), 200);
      accumulator[keyLabel] = maskIfSensitive(
        keyLabel,
        sanitizeValue(entryValue, options, depth + 1, pathStack),
      );
      return accumulator;
    }, {});
  }

  if (typeof Set !== 'undefined' && value instanceof Set) {
    return [...value].slice(0, maxArrayLength).map(item =>
      sanitizeValue(item, options, depth + 1, pathStack),
    );
  }

  if (typeof ArrayBuffer !== 'undefined' && value instanceof ArrayBuffer) {
    return { __type: 'ArrayBuffer', byteLength: value.byteLength };
  }

  if (isTypedArray(value)) {
    return {
      __type: value.constructor.name,
      byteLength: value.byteLength,
      length: value.length,
    };
  }

  if (Array.isArray(value)) {
    return value
      .slice(0, maxArrayLength)
      .map(item => sanitizeValue(item, options, depth + 1, pathStack));
  }

  if (typeof FormData !== 'undefined' && value instanceof FormData) {
    return '[FormData]';
  }

  if (typeof value === 'object') {
    const stack = pathStack || [];
    if (stack.includes(value)) {
      return '[Circular]';
    }

    if (typeof value.toJSON === 'function') {
      try {
        const jsonResult = value.toJSON();
        stack.push(value);
        try {
          return sanitizeValue(jsonResult, options, depth + 1, stack);
        } finally {
          stack.pop();
        }
      } catch (error) {
        /* fall through to enumerable snapshot */
      }
    }

    stack.push(value);
    try {
      const entries = Object.entries(value).slice(0, maxObjectKeys);

      return entries.reduce((accumulator, [key, entryValue]) => {
        accumulator[key] = maskIfSensitive(
          key,
          sanitizeValue(entryValue, options, depth + 1, stack),
        );
        return accumulator;
      }, {});
    } finally {
      stack.pop();
    }
  }

  return truncateString(String(value), maxStringLength);
}

function normalizeHeaders(headers, method, sanitizeHeaderOptions) {
  if (!headers || typeof headers !== 'object') {
    return {};
  }

  const normalizedMethod = typeof method === 'string' ? method.toLowerCase() : '';
  const flattened = {};

  if (headers.common && typeof headers.common === 'object') {
    Object.assign(flattened, headers.common);
  }

  if (normalizedMethod && headers[normalizedMethod] && typeof headers[normalizedMethod] === 'object') {
    Object.assign(flattened, headers[normalizedMethod]);
  }

  Object.entries(headers).forEach(([key, value]) => {
    if (!RESERVED_HEADER_KEYS.has(key)) {
      flattened[key] = value;
    }
  });

  const headerSanitize = {
    ...DEFAULT_SANITIZE_OPTIONS,
    maxStringLength: 1000,
    maxDepth: 4,
    ...(sanitizeHeaderOptions || {}),
  };

  return Object.entries(flattened).reduce((accumulator, [key, value]) => {
    accumulator[key] = maskIfSensitive(key, sanitizeValue(value, headerSanitize));
    return accumulator;
  }, {});
}

module.exports = {
  DEFAULT_SANITIZE_OPTIONS,
  normalizeHeaders,
  sanitizeValue,
  truncateString,
};
