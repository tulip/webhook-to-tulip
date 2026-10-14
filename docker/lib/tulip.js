function authHeader(cfg) {
  return 'Basic ' + Buffer.from(`${cfg.tulipApiKey}:${cfg.tulipApiSecret}`).toString('base64');
}

function tableBase(cfg, tableId) {
  const ws = cfg.tulipWorkspace ? `/w/${cfg.tulipWorkspace}` : '';
  return `${cfg.tulipInstanceUrl}/api/v3${ws}/tables/${tableId}`;
}

export async function insertRecord(cfg, tableId, record, fetchImpl = fetch) {
  const base = tableBase(cfg, tableId);
  const headers = { Authorization: authHeader(cfg), 'Content-Type': 'application/json' };
  const res = await fetchImpl(`${base}/records`, {
    method: 'POST', headers, body: JSON.stringify(record),
  });
  if (!res.ok) throw new Error(`Tulip POST failed: ${res.status}`);
  return { action: 'created' };
}

export async function upsertRecord(cfg, tableId, recordId, fields, fetchImpl = fetch) {
  const base = tableBase(cfg, tableId);
  const headers = { Authorization: authHeader(cfg), 'Content-Type': 'application/json' };
  const recordUrl = `${base}/records/${encodeURIComponent(recordId)}`;

  const getRes = await fetchImpl(recordUrl, { headers });
  if (getRes.status === 200) {
    const putRes = await fetchImpl(recordUrl, {
      method: 'PUT', headers, body: JSON.stringify(fields),
    });
    if (!putRes.ok) throw new Error(`Tulip PUT ${recordId} failed: ${putRes.status}`);
    return { action: 'updated' };
  }
  if (getRes.status === 404) {
    const postRes = await fetchImpl(`${base}/records`, {
      method: 'POST', headers, body: JSON.stringify({ id: recordId, ...fields }),
    });
    if (!postRes.ok) throw new Error(`Tulip POST ${recordId} failed: ${postRes.status}`);
    return { action: 'created' };
  }
  throw new Error(`Tulip GET ${recordId} failed: ${getRes.status}`);
}
