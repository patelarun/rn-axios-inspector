const fs = require('fs');
const http = require('http');
const path = require('path');

const DASHBOARD_HTML_PATH = path.join(__dirname, 'dashboard.html');
const DASHBOARD_JS_PATH = path.join(__dirname, 'dashboard.js');
const DASHBOARD_CSS_PATH = path.join(__dirname, 'dashboard.css');

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json; charset=utf-8',
  });
  response.end(JSON.stringify(payload));
}

function sendText(response, statusCode, body, contentType) {
  response.writeHead(statusCode, {
    'Content-Type': `${contentType}; charset=utf-8`,
  });
  response.end(body);
}

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];

    request.on('data', chunk => {
      chunks.push(chunk);
    });

    request.on('end', () => {
      resolve(Buffer.concat(chunks).toString('utf8'));
    });

    request.on('error', reject);
  });
}

function broadcast(clients, event) {
  const payload = `data: ${JSON.stringify(event)}\n\n`;
  clients.forEach(client => client.write(payload));
}

function startInspectorServer(options = {}) {
  const port = Number(options.port || process.env.AXIOS_INSPECTOR_PORT || 5517);
  const host = options.host || process.env.AXIOS_INSPECTOR_HOST || '0.0.0.0';
  const maxLogs = Number(options.maxLogs || process.env.AXIOS_INSPECTOR_MAX_LOGS || 300);
  const logs = [];
  const sseClients = new Set();

  const server = http.createServer(async (request, response) => {
    if (!request.url) {
      sendJson(response, 404, { error: 'Missing URL' });
      return;
    }

    if (request.method === 'OPTIONS') {
      response.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      });
      response.end();
      return;
    }

    if (request.method === 'GET' && request.url === '/api/health') {
      sendJson(response, 200, { ok: true });
      return;
    }

    if (request.method === 'GET' && request.url === '/api/logs') {
      sendJson(response, 200, { logs });
      return;
    }

    if (request.method === 'GET' && request.url === '/api/stream') {
      response.writeHead(200, {
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'Content-Type': 'text/event-stream',
      });
      response.write('retry: 2000\n\n');
      sseClients.add(response);

      request.on('close', () => {
        sseClients.delete(response);
      });
      return;
    }

    if (request.method === 'POST' && request.url === '/api/events') {
      try {
        const rawBody = await readRequestBody(request);
        const payload = JSON.parse(rawBody || '{}');
        const incomingEvents = Array.isArray(payload) ? payload : [payload];

        incomingEvents
          .filter(Boolean)
          .forEach(event => {
            const normalizedEvent = {
              ...event,
              receivedAt: Date.now(),
            };

            logs.unshift(normalizedEvent);
            if (logs.length > maxLogs) {
              logs.length = maxLogs;
            }

            broadcast(sseClients, { type: 'log', payload: normalizedEvent });
          });

        sendJson(response, 200, { ok: true });
      } catch (error) {
        sendJson(response, 400, {
          ok: false,
          error: error && error.message ? error.message : 'Invalid JSON payload',
        });
      }
      return;
    }

    if (request.method === 'GET' && request.url === '/') {
      sendText(response, 200, fs.readFileSync(DASHBOARD_HTML_PATH, 'utf8'), 'text/html');
      return;
    }

    if (request.method === 'GET' && request.url === '/dashboard.js') {
      sendText(response, 200, fs.readFileSync(DASHBOARD_JS_PATH, 'utf8'), 'application/javascript');
      return;
    }

    if (request.method === 'GET' && request.url === '/dashboard.css') {
      sendText(response, 200, fs.readFileSync(DASHBOARD_CSS_PATH, 'utf8'), 'text/css');
      return;
    }

    sendJson(response, 404, { ok: false, error: 'Not found' });
  });

  server.listen(port, host, () => {
    console.log(`[Axios Inspector] Dashboard running at http://localhost:${port}`);
  });

  return server;
}

module.exports = {
  startInspectorServer,
};
