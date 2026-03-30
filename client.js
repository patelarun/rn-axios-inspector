const { normalizeHeaders, sanitizeValue, truncateString } = require('./sanitize');

let ReactNative;
try {
  ReactNative = require('react-native');
} catch (error) {
  ReactNative = null;
}

const DEFAULT_PORT = 5517;
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);
const INTERNAL_META_KEY = '__axiosInspectorMeta';
const ATTACHED_MARKER_KEY = '__axiosInspectorAttached';

function createId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeBaseUrl(value) {
  if (typeof value !== 'string') {
    return '';
  }

  const trimmed = value.trim();
  return trimmed ? trimmed.replace(/\/+$/, '') : '';
}

function resolveSourceScriptUrl() {
  const sourceCode = ReactNative && ReactNative.NativeModules
    ? ReactNative.NativeModules.SourceCode
    : null;

  const candidates = [
    global.__AXIOS_INSPECTOR_SCRIPT_URL__,
    sourceCode && sourceCode.scriptURL,
    sourceCode && sourceCode.bundleURL,
  ];

  return candidates.find(value => typeof value === 'string' && /^(https?|exp):\/\//i.test(value)) || '';
}

function extractHostname(value) {
  try {
    return new URL(String(value)).hostname || '';
  } catch (error) {
    return '';
  }
}

function inferServerUrl(explicitUrl) {
  const normalizedExplicitUrl = normalizeBaseUrl(explicitUrl);
  if (normalizedExplicitUrl) {
    return normalizedExplicitUrl;
  }

  const sourceHost = extractHostname(resolveSourceScriptUrl());
  if (sourceHost && !LOOPBACK_HOSTS.has(sourceHost.toLowerCase())) {
    return `http://${sourceHost}:${DEFAULT_PORT}`;
  }

  const platform = ReactNative && ReactNative.Platform ? ReactNative.Platform.OS : '';
  if (platform === 'android') {
    return `http://10.0.2.2:${DEFAULT_PORT}`;
  }

  return `http://127.0.0.1:${DEFAULT_PORT}`;
}

function buildUrl(baseURL, url) {
  if (!url && !baseURL) {
    return '';
  }

  try {
    if (baseURL) {
      return new URL(String(url || ''), String(baseURL)).toString();
    }

    return new URL(String(url)).toString();
  } catch (error) {
    if (baseURL && url) {
      const normalizedBaseURL = String(baseURL).replace(/\/+$/, '');
      const normalizedUrl = String(url).replace(/^\/+/, '');
      return `${normalizedBaseURL}/${normalizedUrl}`;
    }

    return String(url || baseURL || '');
  }
}

function createTransport({ serverUrl, timeoutMs = 1500 }) {
  let didWarn = false;

  return async function send(event) {
    if (!global.fetch || !serverUrl) {
      return;
    }

    let timeoutId = null;

    try {
      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      timeoutId = controller
        ? setTimeout(() => controller.abort(), timeoutMs)
        : null;

      await global.fetch(`${serverUrl}/api/events`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(event),
        signal: controller ? controller.signal : undefined,
      });

      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    } catch (error) {
      if (!didWarn && typeof console !== 'undefined' && typeof console.warn === 'function') {
        didWarn = true;
        console.warn(
          `[Axios Inspector] Unable to reach ${serverUrl}. ` +
          'Start the local inspector server or set AXIOS_INSPECTOR_URL/EXPO_PUBLIC_AXIOS_INSPECTOR_URL.'
        );
      }
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  };
}

function createAxiosInspector(options = {}) {
  const serverUrl = inferServerUrl(options.serverUrl);
  const appName = options.appName || 'React Native App';
  const enabled = options.enabled !== false;
  const pendingRequests = new Map();
  const send = createTransport({ serverUrl, timeoutMs: options.timeoutMs });

  function rememberRequest(config, context = {}) {
    if (!enabled || !config) {
      return config;
    }

    const requestId = createId('request');
    const startedAt = Date.now();
    const requestMeta = {
      appName,
      clientName: context.clientName || 'default',
      requestId,
      startedAt,
      platform: ReactNative && ReactNative.Platform ? ReactNative.Platform.OS : 'unknown',
      method: String(config.method || 'get').toUpperCase(),
      baseURL: config.baseURL || '',
      url: config.url || '',
      fullUrl: buildUrl(config.baseURL, config.url),
      headers: normalizeHeaders(config.headers, config.method),
      params: sanitizeValue(config.params),
      data: sanitizeValue(config.data),
      timeout: config.timeout,
    };

    config[INTERNAL_META_KEY] = requestMeta;
    pendingRequests.set(requestId, requestMeta);
    return config;
  }

  function flushResponse(response, context = {}) {
    if (!enabled || !response || !response.config) {
      return response;
    }

    const requestMeta = response.config[INTERNAL_META_KEY];
    if (!requestMeta) {
      return response;
    }

    pendingRequests.delete(requestMeta.requestId);

    const finishedAt = Date.now();

    send({
      type: 'axios-request',
      id: requestMeta.requestId,
      appName: requestMeta.appName,
      clientName: context.clientName || requestMeta.clientName,
      platform: requestMeta.platform,
      startedAt: requestMeta.startedAt,
      finishedAt,
      durationMs: finishedAt - requestMeta.startedAt,
      method: requestMeta.method,
      url: requestMeta.fullUrl,
      request: {
        baseURL: requestMeta.baseURL,
        url: requestMeta.url,
        headers: requestMeta.headers,
        params: requestMeta.params,
        data: requestMeta.data,
        timeout: requestMeta.timeout,
      },
      response: {
        status: response.status,
        statusText: response.statusText,
        headers: normalizeHeaders(response.headers),
        data: sanitizeValue(response.data),
      },
      ok: response.status >= 200 && response.status < 400,
    });

    return response;
  }

  function flushError(error, context = {}) {
    if (!enabled) {
      return Promise.reject(error);
    }

    const config = error && error.config ? error.config : {};
    const requestMeta = config[INTERNAL_META_KEY] || {
      appName,
      clientName: context.clientName || 'default',
      requestId: createId('request'),
      startedAt: Date.now(),
      platform: ReactNative && ReactNative.Platform ? ReactNative.Platform.OS : 'unknown',
      method: String(config.method || 'get').toUpperCase(),
      baseURL: config.baseURL || '',
      url: config.url || '',
      fullUrl: buildUrl(config.baseURL, config.url),
      headers: normalizeHeaders(config.headers, config.method),
      params: sanitizeValue(config.params),
      data: sanitizeValue(config.data),
      timeout: config.timeout,
    };

    pendingRequests.delete(requestMeta.requestId);

    const response = error && error.response ? error.response : null;
    const finishedAt = Date.now();

    send({
      type: 'axios-request',
      id: requestMeta.requestId,
      appName: requestMeta.appName,
      clientName: context.clientName || requestMeta.clientName,
      platform: requestMeta.platform,
      startedAt: requestMeta.startedAt,
      finishedAt,
      durationMs: finishedAt - requestMeta.startedAt,
      method: requestMeta.method,
      url: requestMeta.fullUrl,
      request: {
        baseURL: requestMeta.baseURL,
        url: requestMeta.url,
        headers: requestMeta.headers,
        params: requestMeta.params,
        data: requestMeta.data,
        timeout: requestMeta.timeout,
      },
      response: response ? {
        status: response.status,
        statusText: response.statusText,
        headers: normalizeHeaders(response.headers),
        data: sanitizeValue(response.data),
      } : null,
      error: {
        message: truncateString(error && error.message ? error.message : 'Unknown axios error', 1000),
        code: error && error.code ? error.code : null,
        stack: truncateString(error && error.stack ? error.stack : '', 6000),
      },
      ok: false,
    });

    return Promise.reject(error);
  }

  return {
    appName,
    serverUrl,
    rememberRequest,
    flushResponse,
    flushError,
  };
}

function attachAxiosInspector(axiosInstance, inspector, options = {}) {
  if (!axiosInstance || !axiosInstance.interceptors || !inspector) {
    return () => {};
  }

  if (axiosInstance[ATTACHED_MARKER_KEY]) {
    return axiosInstance[ATTACHED_MARKER_KEY];
  }

  const requestInterceptorId = axiosInstance.interceptors.request.use(
    config => inspector.rememberRequest(config, options),
    error => inspector.flushError(error, { ...options, requestStage: 'request' }),
  );

  const responseInterceptorId = axiosInstance.interceptors.response.use(
    response => inspector.flushResponse(response, options),
    error => inspector.flushError(error, { ...options, requestStage: 'response' }),
  );

  const detach = () => {
    axiosInstance.interceptors.request.eject(requestInterceptorId);
    axiosInstance.interceptors.response.eject(responseInterceptorId);
    delete axiosInstance[ATTACHED_MARKER_KEY];
  };

  axiosInstance[ATTACHED_MARKER_KEY] = detach;
  return detach;
}

module.exports = {
  attachAxiosInspector,
  createAxiosInspector,
};
