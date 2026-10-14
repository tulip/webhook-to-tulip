import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolvePath, extractField, extractFields } from '../lib/extract.js';

describe('resolvePath', () => {
  const obj = {
    topic: 'order.created',
    data: {
      order: { id: 'ORD-1', status: 'open', tags: ['urgent', 'vip'] },
      location: { name: 'Warehouse A', coords: { lat: 42.36, lng: -71.06 } },
    },
    timestamp: 1700000000000,
    items: [{ sku: 'A' }, { sku: 'B' }],
  };

  it('resolves top-level fields', () => {
    assert.equal(resolvePath(obj, 'topic'), 'order.created');
  });

  it('resolves nested fields', () => {
    assert.equal(resolvePath(obj, 'data.order.status'), 'open');
    assert.equal(resolvePath(obj, 'data.location.coords.lat'), 42.36);
  });

  it('resolves array indices', () => {
    assert.equal(resolvePath(obj, 'items.0.sku'), 'A');
    assert.equal(resolvePath(obj, 'items.1.sku'), 'B');
    assert.equal(resolvePath(obj, 'data.order.tags.0'), 'urgent');
  });

  it('returns undefined for missing paths', () => {
    assert.equal(resolvePath(obj, 'data.nonexistent.field'), undefined);
    assert.equal(resolvePath(obj, 'totally.missing'), undefined);
  });

  it('handles $body special path', () => {
    assert.deepEqual(resolvePath(obj, '$body'), obj);
  });

  it('handles $now special path', () => {
    const result = resolvePath(obj, '$now');
    assert.ok(typeof result === 'string');
    assert.ok(!isNaN(Date.parse(result)));
  });

  it('handles null/undefined safely', () => {
    assert.equal(resolvePath(null, 'a.b'), undefined);
    assert.equal(resolvePath(undefined, 'a'), undefined);
  });
});

describe('extractField', () => {
  const body = { ts: 1700000000000, name: 'Test', deep: { val: 42 } };

  it('string shorthand resolves dot-path', () => {
    assert.equal(extractField(body, 'name'), 'Test');
    assert.equal(extractField(body, 'deep.val'), 42);
  });

  it('object with "from" resolves dot-path', () => {
    assert.equal(extractField(body, { from: 'name' }), 'Test');
  });

  it('object with "value" returns static value', () => {
    assert.equal(extractField(body, { value: 'constant' }), 'constant');
    assert.equal(extractField(body, { value: 0 }), 0);
  });

  it('isoTimestamp transform converts ms epoch', () => {
    const result = extractField(body, { from: 'ts', transform: 'isoTimestamp' });
    assert.equal(result, new Date(1700000000000).toISOString());
  });

  it('isoTimestamp transform handles seconds epoch', () => {
    const body2 = { ts: 1700000000 };
    const result = extractField(body2, { from: 'ts', transform: 'isoTimestamp' });
    assert.equal(result, new Date(1700000000000).toISOString());
  });

  it('jsonStringify transform', () => {
    const result = extractField(body, { from: 'deep', transform: 'jsonStringify' });
    assert.equal(result, '{"val":42}');
  });

  it('lowercase transform', () => {
    assert.equal(extractField(body, { from: 'name', transform: 'lowercase' }), 'test');
  });

  it('uppercase transform', () => {
    assert.equal(extractField(body, { from: 'name', transform: 'uppercase' }), 'TEST');
  });

  it('toString transform', () => {
    assert.equal(extractField(body, { from: 'deep.val', transform: 'toString' }), '42');
  });

  it('throws on unknown transform', () => {
    assert.throws(() => extractField(body, { from: 'name', transform: 'bogus' }), /Unknown transform/);
  });
});

describe('extractFields', () => {
  const body = { a: 'hello', b: 42, c: null };

  it('extracts multiple fields', () => {
    const result = extractFields(body, {
      col_a: 'a',
      col_b: 'b',
    });
    assert.deepEqual(result, { col_a: 'hello', col_b: 42 });
  });

  it('skips null and undefined values', () => {
    const result = extractFields(body, {
      col_a: 'a',
      col_c: 'c',
      col_missing: 'nonexistent',
    });
    assert.deepEqual(result, { col_a: 'hello' });
  });

  it('handles mixed rule formats', () => {
    const result = extractFields(body, {
      col_a: 'a',
      col_static: { value: 'fixed' },
      col_b: { from: 'b', transform: 'toString' },
    });
    assert.deepEqual(result, { col_a: 'hello', col_static: 'fixed', col_b: '42' });
  });
});
