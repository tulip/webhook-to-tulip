# Webhook-to-Tulip bridge (generic)

A containerized bridge that receives webhooks from any source and pushes extracted data to Tulip Tables. All extraction logic is driven by a JSON config file — no code changes needed.

Zero external dependencies. Runs on any Docker host.

## Quick start

1. Copy the example files:

```bash
cp .env.example .env
cp mapping.example.json mapping.json
```

2. Edit `.env` with your Tulip credentials and (optionally) your webhook secret.

3. Edit `mapping.json` with your routes, extraction rules, and Tulip table/column IDs.

4. Start the container:

```bash
docker compose up -d
```

Point your webhook source to `http://<your-host>:3000/webhook`.

## How it works

1. A webhook arrives at `/webhook` (POST).
2. If auth is configured, the request is verified (HMAC signature or bearer token).
3. The JSON body is parsed and matched against your configured routes.
4. All matching routes execute in parallel (fan-out pattern).
5. For each route, field values are extracted from the body using dot-path expressions.
6. Records are created or updated in the target Tulip table.

## Configuration

### Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `TULIP_INSTANCE_URL` | Yes | Your Tulip instance URL (e.g. `https://acme.tulip.co`) |
| `TULIP_API_KEY` | Yes | Bot API key from Tulip Account Settings > API Tokens |
| `TULIP_API_SECRET` | Yes | Bot API secret |
| `WEBHOOK_SECRET` | No | Secret for webhook auth (HMAC signing secret or bearer token) |
| `TULIP_WORKSPACE` | Sometimes | Workspace ID. Required if your API token is account-level or your instance has multiple workspaces — use `DEFAULT` for the default workspace. Omitting it when required causes 403/404 errors. |
| `ALLOWED_SOURCE_IPS` | No | Comma-separated IPv4/CIDR allowlist |
| `PORT` | No | Server port (default: `3000`) |

### Mapping file (mapping.json)

The mapping file defines how incoming webhooks are authenticated, routed, and mapped to Tulip tables.

#### Auth (optional)

```json
{
  "auth": {
    "type": "hmac",
    "algorithm": "sha256",
    "header": "x-webhook-signature",
    "prefix": "sha256="
  }
}
```

Supported auth types:
- `hmac` — HMAC signature verification. Configure `algorithm` (sha256, sha1, etc.), `header` (which header contains the signature), and `prefix` (e.g. "sha256="). The secret comes from the `WEBHOOK_SECRET` env var.
- `bearer` — checks `Authorization: Bearer <token>` against `WEBHOOK_SECRET`.
- `none` — skip auth (or just omit the auth block). IP allowlist still applies.

#### Routes

Each route defines when to match, which table to write to, how to extract the record ID, and how to map fields.

```json
{
  "routes": [
    {
      "name": "Descriptive name (for logging)",
      "when": { ... },
      "table": "TULIP_TABLE_ID",
      "recordId": "path.to.record.id",
      "mode": "upsert",
      "fields": {
        "COLUMN_ID": "path.to.value",
        "COLUMN_ID_2": { "from": "path.to.timestamp", "transform": "isoTimestamp" },
        "COLUMN_ID_3": { "value": "static string" }
      }
    }
  ]
}
```

**Route matching (`when`)**

The `when` clause determines which webhooks trigger this route. Omit it entirely to match all webhooks.

| Pattern | Example | Matches when... |
|---------|---------|-----------------|
| Field equals | `{ "field": "type", "equals": "order" }` | `body.type === "order"` |
| Field regex | `{ "field": "topic", "pattern": "sensor\\..*" }` | `body.topic` matches regex |
| Header equals | `{ "header": "X-Event-Type", "equals": "alert" }` | Header value matches |
| (omitted) | — | Always matches |

All matching routes execute — not just the first. This lets you have specific routes alongside a catch-all logger.

**Mode**

- `upsert` (default) — checks if the record exists first, then creates or updates it.
- `insert` — always creates a new record (useful for event logs/history tables).

#### Dot-path extraction

Values are extracted from the webhook JSON body using dot-path expressions:

| Expression | Resolves to |
|-----------|-------------|
| `topic` | `body.topic` |
| `data.order.status` | `body.data.order.status` |
| `items.0.sku` | `body.items[0].sku` |
| `$body` | The entire request body (as an object) |
| `$now` | Current ISO-8601 timestamp |

Missing paths resolve to `undefined` and are skipped (no null overwrites).

#### Field rules

Fields can be specified in three ways:

| Format | Example | Behavior |
|--------|---------|----------|
| String | `"data.order.status"` | Extract value at path |
| Object with `from` | `{ "from": "data.ts", "transform": "isoTimestamp" }` | Extract + transform |
| Object with `value` | `{ "value": "webhook-bridge" }` | Static value |

#### Transforms

| Transform | Description |
|-----------|-------------|
| `isoTimestamp` | Convert epoch (ms or seconds) to ISO-8601 string |
| `jsonStringify` | JSON.stringify the value |
| `toString` | Convert to string |
| `lowercase` | Lowercase a string |
| `uppercase` | Uppercase a string |

## Example configurations

### Xemelgo RFID events

```json
{
  "auth": {
    "type": "hmac",
    "algorithm": "sha256",
    "header": "xemelgo-signature",
    "prefix": "sha256="
  },
  "routes": [
    {
      "name": "Work orders",
      "when": { "field": "topic", "pattern": "work_order\\.(created|moved)" },
      "table": "YOUR_TABLE_ID",
      "recordId": "data.workOrder.identifier",
      "fields": {
        "col_status": "data.workOrder.status",
        "col_location": "data.currentLocation.name"
      }
    },
    {
      "name": "Assets",
      "when": { "field": "topic", "pattern": "asset\\.(created|moved)" },
      "table": "YOUR_TABLE_ID",
      "recordId": "data.asset.identifier",
      "fields": {
        "col_type": "data.asset.type",
        "col_location": "data.currentLocation.name",
        "col_last_seen": { "from": "eventTimestamp", "transform": "isoTimestamp" }
      }
    }
  ]
}
```

### IoT sensor data (generic)

```json
{
  "auth": { "type": "bearer" },
  "routes": [
    {
      "name": "Temperature readings",
      "when": { "field": "sensorType", "equals": "temperature" },
      "table": "TEMP_TABLE_ID",
      "recordId": "sensorId",
      "fields": {
        "col_value": "reading.value",
        "col_unit": "reading.unit",
        "col_timestamp": { "from": "timestamp", "transform": "isoTimestamp" },
        "col_location": "location.name"
      }
    },
    {
      "name": "All readings log",
      "table": "LOG_TABLE_ID",
      "recordId": "eventId",
      "mode": "insert",
      "fields": {
        "col_sensor": "sensorId",
        "col_type": "sensorType",
        "col_raw": { "from": "$body", "transform": "jsonStringify" },
        "col_received": { "from": "$now" }
      }
    }
  ]
}
```

### GitHub webhook events

```json
{
  "auth": {
    "type": "hmac",
    "algorithm": "sha256",
    "header": "x-hub-signature-256",
    "prefix": "sha256="
  },
  "routes": [
    {
      "name": "Push events",
      "when": { "header": "X-GitHub-Event", "equals": "push" },
      "table": "PUSHES_TABLE_ID",
      "recordId": "after",
      "fields": {
        "col_repo": "repository.full_name",
        "col_branch": "ref",
        "col_pusher": "pusher.name",
        "col_message": "head_commit.message"
      }
    }
  ]
}
```

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/` or `/webhook` | Webhook receiver |
| `GET` | `/health` | Health check (returns route count) |

## Running without Docker

Requires Node.js 22+:

```bash
npm start
```

Set your env vars and ensure `mapping.json` is in the working directory (or set `MAPPING_FILE`).

## Finding Tulip table and column IDs

Use the Tulip API:

```bash
curl -u "API_KEY:API_SECRET" https://your-instance.tulip.co/api/v3/tables/TABLE_ID
```

The response contains the table ID and a `columns` array with each column's `id` field (e.g. `abcde_status`). Use these IDs in your mapping file.
