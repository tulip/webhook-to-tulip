# webhook-to-tulip

Bridge webhooks from any source into Tulip Tables. Configuration-driven — define extraction rules in JSON (or a Node-RED function), no code changes needed.

Two deployment options:

| Option | Directory | Best for |
|--------|-----------|----------|
| Docker container | [`docker/`](docker/) | Cloud or on-prem servers, customer deployments |
| Node-RED flow | [`node-red/`](node-red/) | Tulip Edge Devices, on-machine deployments |

Both do the same thing: receive a webhook, verify auth, extract fields from the payload, and create or update records in Tulip Tables.

## How it works

```
  Webhook source                 Bridge                        Tulip
  ──────────────                 ──────                        ─────
  POST /webhook  ──────────────▶ verify auth (HMAC/bearer)
                                        │
                                 match routes by field/header
                                        │
                                 extract fields via dot-paths
                                        │
                                 GET record ──▶ PUT  (exists)  ──▶ Tulip Tables
                                            └─▶ POST (new)
```

## Quick start (Docker)

```bash
cd docker
cp .env.example .env            # add your Tulip credentials
cp mapping.example.json mapping.json   # define your routes
docker compose up -d
```

Point your webhook at `http://<your-host>:3000/webhook`.

See [`docker/README.md`](docker/README.md) for the full configuration reference.

## Quick start (Node-RED)

1. Import `node-red/flows.json` into Node-RED.
2. Set environment variables on the flow tab (double-click the tab name).
3. Edit the "Extract & Route" function node with your extraction logic.
4. Deploy.

See [`node-red/README.md`](node-red/README.md) for details.

## Configuration concepts

Both versions share the same model:

**Routes** — a route matches incoming webhooks and maps them to a Tulip table. Match by body field value, regex pattern, or header value. Omit the condition to match everything. All matching routes execute, so you can run a specific route alongside a catch-all event logger.

**Dot-path extraction** — pull values out of arbitrary JSON using expressions like `data.order.status` or `items.0.sku`. Missing paths are skipped rather than written as nulls.

**Modes** — `upsert` checks whether the record exists and creates or updates accordingly. `insert` always creates a new record, which suits append-only event logs.

**Auth** — HMAC signature verification (configurable algorithm, header, and prefix), bearer token, or none.

## Requirements

- A Tulip instance with Tables
- A bot API token with Tables read/write scope (Account Settings > API Tokens)
- Docker (for the container) or a Node-RED instance (for the flow)

## Finding your table and column IDs

```bash
curl -u "API_KEY:API_SECRET" https://your-instance.tulip.co/api/v3/tables/TABLE_ID
```

The response contains the table's `columns` array — each entry has an `id` you reference in your mapping.

If your instance has multiple workspaces, or your API token is account-level, include the workspace in the path and set `TULIP_WORKSPACE` in your config:

```bash
curl -u "API_KEY:API_SECRET" https://your-instance.tulip.co/api/v3/w/WORKSPACE_ID/tables/TABLE_ID
```
