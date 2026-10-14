import crypto from 'node:crypto';

/**
 * Verify an HMAC signature header.
 * Supports configurable algorithm (sha256, sha1, etc.), header name, and prefix.
 */
function verifyHmac(rawBody, headers, authConfig, secret) {
  const sigHeader = headers[authConfig.header.toLowerCase()];
  const prefix = authConfig.prefix || '';

  if (typeof sigHeader !== 'string' || (prefix && !sigHeader.startsWith(prefix))) {
    return false;
  }

  const algorithm = authConfig.algorithm || 'sha256';
  const expected = prefix + crypto.createHmac(algorithm, secret).update(rawBody).digest('hex');
  const provided = Buffer.from(sigHeader);
  const computed = Buffer.from(expected);
  if (provided.length !== computed.length) return false;
  return crypto.timingSafeEqual(provided, computed);
}

/**
 * Verify a bearer token.
 */
function verifyBearer(headers, secret) {
  const auth = headers['authorization'] || '';
  if (!auth.startsWith('Bearer ')) return false;
  const token = auth.slice(7);
  // Timing-safe comparison
  const provided = Buffer.from(token);
  const expected = Buffer.from(secret);
  if (provided.length !== expected.length) return false;
  return crypto.timingSafeEqual(provided, expected);
}

/**
 * Verify the request based on the configured auth type.
 * Returns true if auth passes (or if no auth is configured).
 */
export function verifyAuth(rawBody, headers, authConfig, secret) {
  if (!authConfig || authConfig.type === 'none') return true;

  switch (authConfig.type) {
    case 'hmac':
      return verifyHmac(rawBody, headers, authConfig, secret);
    case 'bearer':
      return verifyBearer(headers, secret);
    default:
      throw new Error(`Unknown auth type: ${authConfig.type}`);
  }
}
