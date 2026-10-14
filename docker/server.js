import http from 'node:http';
import { loadConfig } from './lib/config.js';
import { verifyAuth } from './lib/auth.js';
import { isIpAllowed } from './lib/ipAllowlist.js';
import { matchRoutes, processRoute } from './lib/router.js';
import { upsertRecord, insertRecord } from './lib/tulip.js';

const config = loadConfig();

function json(res, statusCode, data) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function collectBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function getSourceIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim()
    || req.headers['x-real-ip']
    || req.socket.remoteAddress;
}

async function executeRoute(processed) {
  if (processed.mode === 'insert') {
    const record = { id: processed.recordId, ...processed.fields };
    return insertRecord(config, processed.tableId, record);
  }
  return upsertRecord(config, processed.tableId, processed.recordId, processed.fields);
}

async function handleWebhook(req, res) {
  // IP allowlist check
  const sourceIp = getSourceIp(req);
  if (!isIpAllowed(sourceIp, config.allowedSourceIps)) {
    console.warn(JSON.stringify({ rejected: 'source ip not allowed', sourceIp }));
    return json(res, 403, { message: 'forbidden' });
  }

  const rawBody = await collectBody(req);

  // Auth verification
  if (!verifyAuth(rawBody, req.headers, config.auth, config.webhookSecret)) {
    return json(res, 401, { message: 'unauthorized' });
  }

  // Parse body
  let body;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return json(res, 400, { message: 'invalid JSON body' });
  }

  // Match routes
  const matched = matchRoutes(body, req.headers, config.routes);
  if (matched.length === 0) {
    return json(res, 200, { message: 'no matching routes' });
  }

  // Process all matching routes
  const results = [];
  const errors = [];

  await Promise.all(matched.map(async (route) => {
    const processed = processRoute(body, route);
    if (!processed.recordId) {
      errors.push({ route: processed.name, error: 'missing record id' });
      return;
    }
    try {
      const result = await executeRoute(processed);
      results.push({ route: processed.name, recordId: processed.recordId, action: result.action });
      console.log(JSON.stringify({
        route: processed.name, recordId: processed.recordId, action: result.action,
      }));
    } catch (err) {
      errors.push({ route: processed.name, error: err.message });
      console.error(JSON.stringify({
        route: processed.name, recordId: processed.recordId, error: err.message,
      }));
    }
  }));

  if (errors.length > 0 && results.length === 0) {
    return json(res, 502, { message: 'all routes failed', errors });
  }

  return json(res, 200, { message: 'ok', results, errors: errors.length > 0 ? errors : undefined });
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    return json(res, 200, { status: 'ok', routes: config.routes.length });
  }
  if (req.method === 'POST' && (req.url === '/' || req.url === '/webhook')) {
    return handleWebhook(req, res);
  }
  json(res, 404, { message: 'not found' });
});

server.listen(config.port, () => {
  console.log(`Webhook-to-Tulip bridge listening on port ${config.port}`);
  console.log(`${config.routes.length} route(s) configured`);
  console.log(`Auth: ${config.auth?.type || 'none'}`);
});
