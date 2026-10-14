import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { matchRoutes, processRoute } from '../lib/router.js';

const routes = [
  {
    name: 'Orders',
    when: { field: 'type', equals: 'order' },
    table: 'tbl_orders',
    recordId: 'data.orderId',
    fields: { col_status: 'data.status', col_total: 'data.total' },
  },
  {
    name: 'Alerts by header',
    when: { header: 'X-Event-Type', equals: 'alert' },
    table: 'tbl_alerts',
    recordId: 'id',
    fields: { col_msg: 'message' },
  },
  {
    name: 'Sensor pattern',
    when: { field: 'topic', pattern: 'sensor\\..*' },
    table: 'tbl_sensors',
    recordId: 'sensorId',
    fields: { col_reading: 'value' },
  },
  {
    name: 'Catch-all log',
    table: 'tbl_log',
    recordId: 'id',
    mode: 'insert',
    fields: { col_payload: { from: '$body', transform: 'jsonStringify' } },
  },
];

describe('matchRoutes', () => {
  it('matches by field equals', () => {
    const body = { type: 'order', data: { orderId: '1', status: 'new', total: 100 }, id: 'e1' };
    const matched = matchRoutes(body, {}, routes);
    const names = matched.map((r) => r.name);
    assert.ok(names.includes('Orders'));
    assert.ok(names.includes('Catch-all log'));
    assert.ok(!names.includes('Sensor pattern'));
  });

  it('matches by header equals', () => {
    const body = { id: 'e2', message: 'disk full' };
    const headers = { 'x-event-type': 'alert' };
    const matched = matchRoutes(body, headers, routes);
    const names = matched.map((r) => r.name);
    assert.ok(names.includes('Alerts by header'));
    assert.ok(names.includes('Catch-all log'));
  });

  it('matches by field pattern (regex)', () => {
    const body = { topic: 'sensor.temperature', sensorId: 'S1', value: 23.5, id: 'e3' };
    const matched = matchRoutes(body, {}, routes);
    const names = matched.map((r) => r.name);
    assert.ok(names.includes('Sensor pattern'));
    assert.ok(names.includes('Catch-all log'));
    assert.ok(!names.includes('Orders'));
  });

  it('catch-all matches when no condition', () => {
    const body = { id: 'e4', random: 'data' };
    const matched = matchRoutes(body, {}, routes);
    assert.equal(matched.length, 1);
    assert.equal(matched[0].name, 'Catch-all log');
  });

  it('returns empty when field value is missing', () => {
    const onlyConditional = [routes[0]]; // Orders — requires type=order
    const body = { id: 'e5', something: 'else' };
    const matched = matchRoutes(body, {}, onlyConditional);
    assert.equal(matched.length, 0);
  });
});

describe('processRoute', () => {
  it('extracts recordId and fields from body', () => {
    const body = { data: { orderId: 'ORD-1', status: 'shipped', total: 250 } };
    const result = processRoute(body, routes[0]);
    assert.equal(result.tableId, 'tbl_orders');
    assert.equal(result.recordId, 'ORD-1');
    assert.equal(result.fields.col_status, 'shipped');
    assert.equal(result.fields.col_total, 250);
    assert.equal(result.mode, 'upsert');
  });

  it('returns null recordId when path is missing', () => {
    const body = { data: {} };
    const result = processRoute(body, routes[0]);
    assert.equal(result.recordId, null);
  });

  it('respects insert mode', () => {
    const body = { id: 'log-1', some: 'data' };
    const result = processRoute(body, routes[3]);
    assert.equal(result.mode, 'insert');
    assert.equal(result.recordId, 'log-1');
  });

  it('applies transforms in field extraction', () => {
    const body = { id: 'log-2', nested: { key: 'val' } };
    const result = processRoute(body, routes[3]);
    // $body transform → jsonStringify
    assert.equal(typeof result.fields.col_payload, 'string');
    assert.ok(result.fields.col_payload.includes('"id":"log-2"'));
  });
});
