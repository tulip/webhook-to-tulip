import { readFileSync } from 'node:fs';
import { parseAllowlist } from './ipAllowlist.js';

const REQUIRED_ENV = [
  'TULIP_INSTANCE_URL',
  'TULIP_API_KEY',
  'TULIP_API_SECRET',
];

export function loadConfig(env = process.env) {
  const missing = REQUIRED_ENV.filter((key) => !env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required env vars: ${missing.join(', ')}`);
  }

  const mappingPath = env.MAPPING_FILE || '/app/mapping.json';
  let mapping;
  try {
    mapping = JSON.parse(readFileSync(mappingPath, 'utf8'));
  } catch (err) {
    throw new Error(`Failed to load mapping file at ${mappingPath}: ${err.message}`);
  }

  if (!mapping.routes || !Array.isArray(mapping.routes) || mapping.routes.length === 0) {
    throw new Error('Mapping file must contain a non-empty "routes" array');
  }

  // Validate routes have required fields
  for (const [i, route] of mapping.routes.entries()) {
    if (!route.table) throw new Error(`Route ${i} (${route.name || 'unnamed'}) missing "table"`);
    if (!route.recordId) throw new Error(`Route ${i} (${route.name || 'unnamed'}) missing "recordId"`);
    if (!route.fields || Object.keys(route.fields).length === 0) {
      throw new Error(`Route ${i} (${route.name || 'unnamed'}) missing "fields"`);
    }
  }

  return {
    tulipInstanceUrl: env.TULIP_INSTANCE_URL.replace(/\/$/, ''),
    tulipApiKey: env.TULIP_API_KEY,
    tulipApiSecret: env.TULIP_API_SECRET,
    tulipWorkspace: env.TULIP_WORKSPACE || null,
    webhookSecret: env.WEBHOOK_SECRET || null,
    allowedSourceIps: parseAllowlist(env.ALLOWED_SOURCE_IPS || null),
    auth: mapping.auth || null,
    routes: mapping.routes,
    port: parseInt(env.PORT || '3000', 10),
  };
}
