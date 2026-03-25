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

function sanitizeValue(value, options = {}, depth = 0) {
  const maxDepth = options.maxDepth ?? 4;
  const maxStringLength = options.maxStringLength ?? 12000;
  const maxArrayLength = options.maxArrayLength ?? 40;
  const maxObjectKeys = options.maxObjectKeys ?? 40;

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

  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: truncateString(value.stack || '', maxStringLength),
    };
  }

  if (Array.isArray(value)) {
    return value
      .slice(0, maxArrayLength)
      .map(item => sanitizeValue(item, options, depth + 1));
  }

  if (typeof FormData !== 'undefined' && value instanceof FormData) {
    return '[FormData]';
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value).slice(0, maxObjectKeys);

    return entries.reduce((accumulator, [key, entryValue]) => {
      accumulator[key] = maskIfSensitive(
        key,
        sanitizeValue(entryValue, options, depth + 1),
      );
      return accumulator;
    }, {});
  }

  return truncateString(String(value), maxStringLength);
}

function normalizeHeaders(headers, method) {
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

  return Object.entries(flattened).reduce((accumulator, [key, value]) => {
    accumulator[key] = maskIfSensitive(key, sanitizeValue(value, { maxStringLength: 1000 }));
    return accumulator;
  }, {});
}

module.exports = {
  normalizeHeaders,
  sanitizeValue,
  truncateString,
};
