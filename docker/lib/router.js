import { resolvePath, extractFields } from './extract.js';

/**
 * Test whether a "when" condition matches the request.
 * Supports:
 *   - { field: "topic", equals: "work_order.created" }
 *   - { field: "topic", pattern: "work_order\\..*" }
 *   - { header: "X-Event-Type", equals: "order" }
 *   - omitted → always matches
 */
function matchesCondition(body, headers, when) {
  if (!when) return true;

  let actual;
  if (when.field) {
    actual = resolvePath(body, when.field);
  } else if (when.header) {
    actual = headers[when.header.toLowerCase()];
  } else {
    return true;
  }

  if (actual === undefined || actual === null) return false;
  const str = String(actual);

  if (when.equals !== undefined) return str === String(when.equals);
  if (when.pattern) return new RegExp(when.pattern).test(str);
  return true;
}

/**
 * Find all routes that match the incoming request.
 * All matching routes execute (fan-out), not just the first.
 */
export function matchRoutes(body, headers, routes) {
  return routes.filter((route) => matchesCondition(body, headers, route.when));
}

/**
 * Process a single matched route: extract recordId and fields.
 * Returns { tableId, recordId, fields, mode, name } or null if recordId missing.
 */
export function processRoute(body, route) {
  const recordId = resolvePath(body, route.recordId);
  const fields = extractFields(body, route.fields);
  return {
    name: route.name || route.table,
    tableId: route.table,
    recordId: recordId != null ? String(recordId) : null,
    fields,
    mode: route.mode || 'upsert',
  };
}
