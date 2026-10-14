// Dot-path resolver and field extraction for arbitrary JSON payloads.
// Zero dependencies — handles the 95% case for webhook data extraction.

/**
 * Resolve a dot-path expression against an object.
 * Supports nested access ("data.workOrder.status") and array indices ("items.0.id").
 * Returns undefined if any segment is missing (safe traversal).
 */
export function resolvePath(obj, path) {
  if (path === '$body') return obj;
  if (path === '$now') return new Date().toISOString();
  return path.split('.').reduce((current, key) => current?.[key], obj);
}

const TRANSFORMS = {
  isoTimestamp(value) {
    if (value === undefined || value === null) return value;
    const n = Number(value);
    if (!Number.isFinite(n)) return value;
    // Heuristic: if the number looks like seconds (< 1e12), convert to ms
    const ms = n < 1e12 ? n * 1000 : n;
    return new Date(ms).toISOString();
  },
  jsonStringify(value) {
    return JSON.stringify(value);
  },
  toString(value) {
    return value === undefined || value === null ? value : String(value);
  },
  lowercase(value) {
    return typeof value === 'string' ? value.toLowerCase() : value;
  },
  uppercase(value) {
    return typeof value === 'string' ? value.toUpperCase() : value;
  },
};

/**
 * Extract a single field value from the payload using a field rule.
 *
 * Field rules can be:
 *   - A string:  "data.workOrder.status"  (shorthand for { from: "..." })
 *   - An object: { from: "data.ts", transform: "isoTimestamp" }
 *   - An object: { value: "static string" }
 */
export function extractField(body, rule) {
  if (typeof rule === 'string') {
    return resolvePath(body, rule);
  }
  if (rule.value !== undefined) {
    return rule.value;
  }
  let value = resolvePath(body, rule.from);
  if (rule.transform) {
    const fn = TRANSFORMS[rule.transform];
    if (!fn) throw new Error(`Unknown transform: ${rule.transform}`);
    value = fn(value);
  }
  return value;
}

/**
 * Extract all fields for a route, returning a { columnId: value } map.
 * Skips fields that resolve to undefined or null (no overwrite with blanks).
 */
export function extractFields(body, fieldRules) {
  const result = {};
  for (const [columnId, rule] of Object.entries(fieldRules)) {
    const value = extractField(body, rule);
    if (value !== undefined && value !== null) {
      result[columnId] = value;
    }
  }
  return result;
}
