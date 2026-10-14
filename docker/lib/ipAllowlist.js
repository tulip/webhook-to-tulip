export function parseIpv4(text) {
  if (typeof text !== 'string') return null;
  const parts = text.trim().split('.');
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const octet = Number(part);
    if (octet > 255) return null;
    value = value * 256 + octet;
  }
  return value;
}

function maskFor(bits) {
  return bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
}

export function parseAllowlist(raw) {
  if (raw === undefined || raw === null || raw === '') return null;
  const entries = String(raw).split(',').map((e) => e.trim()).filter(Boolean);
  if (entries.length === 0) return null;

  return entries.map((entry) => {
    const [address, prefix, ...rest] = entry.split('/');
    if (rest.length > 0) throw new Error(`Invalid IP allowlist entry: ${entry}`);
    const ip = parseIpv4(address);
    if (ip === null) throw new Error(`Invalid IP allowlist entry: ${entry}`);
    let bits = 32;
    if (prefix !== undefined) {
      if (!/^\d{1,2}$/.test(prefix)) throw new Error(`Invalid IP allowlist entry: ${entry}`);
      bits = Number(prefix);
      if (bits > 32 || bits < 8) throw new Error(`Invalid IP allowlist entry: ${entry}`);
    }
    const mask = maskFor(bits);
    return { entry, network: (ip & mask) >>> 0, mask };
  });
}

export function isIpAllowed(sourceIp, rules) {
  if (!rules || rules.length === 0) return true;
  const ip = parseIpv4(sourceIp);
  if (ip === null) return false;
  return rules.some((rule) => ((ip & rule.mask) >>> 0) === rule.network);
}
