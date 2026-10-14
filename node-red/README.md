# webhook-to-tulip (Node-RED)

A Node-RED flow that receives webhooks from any source and pushes extracted data to Tulip Tables. Runs on a Tulip Edge Device or any Node-RED instance.

## Setup

### 1. Import the flow

1. Open the Node-RED editor (on an Edge Device, typically `http://<device-ip>:1880`).
2. Hamburger menu (top right) > Import.
3. Paste the contents of `flows.json` or upload the file.
4. Click Import.

### 2. Set environment variables

Double-click the **flow tab name** ("Webhook-to-Tulip Bridge") at the top of the editor. In the properties panel, find the **Environment Variables** section and add:

**Required:**

| Variable | Description |
|----------|-------------|
| `TULIP_INSTANCE_URL` | Your Tulip instance URL (e.g. `https://acme.tulip.co`) |
| `TULIP_API_KEY` | Bot API key from Account Settings > API Tokens |
| `TULIP_API_SECRET` | Bot API secret |

**Workspace:**

| Variable | Description |
|----------|-------------|
| `TULIP_WORKSPACE` | Workspace ID. Required if your API token is account-level or your instance has multiple workspaces — use `DEFAULT` for the default workspace. Omitting it when required causes 403/404 errors. |

**Auth (optional):**

| Variable | Description |
|----------|-------------|
| `AUTH_TYPE` | `hmac`, `bearer`, or `none` (default: `none`) |
| `WEBHOOK_SECRET` | Shared secret for HMAC or bearer auth |
| `HMAC_HEADER` | Header containing the signature (default: `x-webhook-signature`) |
| `HMAC_ALGORITHM` | `sha256`, `sha1`, etc. (default: `sha256`) |
| `HMAC_PREFIX` | Prefix before the hex digest (default: `sha256=`) |

> Flow-level environment variables require Node-RED 2.1 or newer. On older versions, set them as system environment variables on the host instead.

### 3. Write your extraction logic

Open the **"Extract & Route (EDIT THIS)"** function node. The webhook body is in `msg.req.body` and headers in `msg.req.headers`. Build an array of route objects:

```javascript
function getPath(obj, path) {
    return path.split('.').reduce((o, k) => o && o[k], obj);
}

const body = msg.req.body;
const routes = [];

// Example: sensor readings
if (body.sensorType === 'temperature') {
    routes.push({
        name: 'Temperature readings',
        tableId: 'YOUR_TABLE_ID',
        recordId: body.sensorId,
        mode: 'upsert',              // or 'insert' for append-only tables
        fields: {
            'COL_VALUE': body.reading.value,
            'COL_UNIT': body.reading.unit,
            'COL_TIMESTAMP': new Date(body.timestamp).toISOString(),
        },
    });
}
```

The node includes commented examples you can uncomment and adapt.

**Route object fields:**

| Field | Description |
|-------|-------------|
| `name` | Label used in logs |
| `tableId` | Target Tulip table ID |
| `recordId` | Value used as the record's unique ID |
| `mode` | `upsert` (create or update) or `insert` (always create) |
| `fields` | Map of Tulip column ID to value |

Null and undefined field values are stripped automatically, so partial payloads won't overwrite existing data with blanks.

### 4. Deploy

Click Deploy. Point your webhook source at:

```
http://<host>:1880/webhook
```

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/webhook` | Webhook receiver |
| `GET` | `/webhook/health` | Health check |

## How the flow works

1. The webhook arrives and auth is verified (if configured).
2. The "Extract & Route" function builds route messages from the payload.
3. A `200 accepted` response is returned immediately — Tulip writes happen asynchronously so slow API calls don't trip webhook timeouts.
4. Each route runs independently: `GET` to check existence, then `PUT` (update) or `POST` (create).
5. Results are logged to the Node-RED debug sidebar.

Because the response is sent before the Tulip write completes, a `200 accepted` means the webhook was received and routed — not that the write succeeded. Check the debug sidebar to confirm writes.

## Debugging

The flow has debug nodes wired at each stage. Open the debug sidebar (bug icon, top right) to watch messages as they flow:

| Node | Shows |
|------|-------|
| 1. Incoming payload | The raw webhook body as received |
| 2. Extracted route | The route object built by Extract & Route — table ID, record ID, and mapped fields |
| 3. Tulip request URL | The exact URL being called (useful for catching workspace path problems) |
| 4. Tulip API response | Tulip's raw response body, with the status code shown under the node |
| 5. Final result | Summary: route name, record ID, action taken (`created`/`updated`), status, success or failure |
| Auth rejected | Fires only when auth fails |

Function nodes also show live status underneath them — green for success, red for failure, blue for in-progress. This gives you an at-a-glance view without opening the sidebar.

To quiet things down in production, click the toggle on the right edge of any debug node to disable it, then redeploy. The `Final result` node is the one worth keeping on.

None of the debug nodes expose credentials — node 3 shows only the URL, not the `Authorization` header.

### Reading the output

A healthy upsert against an existing record produces, in order:

```
1. Incoming payload    { "id": "test-1", "message": "hello" }
2. Extracted route     { name: "...", tableId: "...", recordId: "test-1", mode: "upsert", fields: {...} }
3. Tulip request URL   "https://acme.tulip.co/api/v3/w/DEFAULT/tables/TBL/records/test-1"
4. Tulip API response  { ...the existing record... }        (status 200 → record exists)
3. Tulip request URL   "https://acme.tulip.co/api/v3/w/DEFAULT/tables/TBL/records/test-1"
4. Tulip API response  { ...updated record... }             (status 200 → PUT succeeded)
5. Final result        { route: "...", recordId: "test-1", action: "updated", statusCode: 200, result: "success" }
```

Nodes 3 and 4 appear twice for upserts — once for the existence check, once for the write. For a new record, the first response is a `404` and the second call is a `POST` with `action: "created"`.

## Troubleshooting

**`403` or `404 NoSuchEndpoint` on writes** — usually a workspace path issue. Check debug node 3 to see the URL being called. Set `TULIP_WORKSPACE` (try `DEFAULT`) and redeploy.

**`no matching routes`** — the Extract & Route function returned an empty array. Check that your conditions match the actual payload shape.

**Nothing in the debug sidebar** — confirm the flow is deployed and the webhook reached it. The health endpoint (`GET /webhook/health`) confirms the flow is listening.

## Finding table and column IDs

```bash
curl -u "API_KEY:API_SECRET" https://your-instance.tulip.co/api/v3/tables/TABLE_ID
```

Add `/w/WORKSPACE_ID` before `/tables` if your instance uses workspaces.
