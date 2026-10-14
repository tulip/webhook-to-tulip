import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { verifyAuth } from '../lib/auth.js';

describe('verifyAuth', () => {
  const secret = 'test-secret-123';
  const rawBody = '{"hello":"world"}';

  describe('type: none', () => {
    it('always passes when auth is null', () => {
      assert.ok(verifyAuth(rawBody, {}, null, secret));
    });

    it('always passes when type is none', () => {
      assert.ok(verifyAuth(rawBody, {}, { type: 'none' }, secret));
    });
  });

  describe('type: hmac', () => {
    const hmacConfig = {
      type: 'hmac',
      algorithm: 'sha256',
      header: 'x-signature',
      prefix: 'sha256=',
    };

    function sign(body) {
      return 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');
    }

    it('passes with valid HMAC signature', () => {
      const headers = { 'x-signature': sign(rawBody) };
      assert.ok(verifyAuth(rawBody, headers, hmacConfig, secret));
    });

    it('rejects invalid signature', () => {
      const headers = { 'x-signature': 'sha256=deadbeef' };
      assert.ok(!verifyAuth(rawBody, headers, hmacConfig, secret));
    });

    it('rejects missing header', () => {
      assert.ok(!verifyAuth(rawBody, {}, hmacConfig, secret));
    });

    it('rejects wrong prefix', () => {
      const headers = { 'x-signature': 'md5=something' };
      assert.ok(!verifyAuth(rawBody, headers, hmacConfig, secret));
    });

    it('works with sha1 algorithm', () => {
      const sha1Config = { ...hmacConfig, algorithm: 'sha1', prefix: 'sha1=' };
      const sig = 'sha1=' + crypto.createHmac('sha1', secret).update(rawBody).digest('hex');
      const headers = { 'x-signature': sig };
      assert.ok(verifyAuth(rawBody, headers, sha1Config, secret));
    });

    it('works without prefix', () => {
      const noPrefixConfig = { ...hmacConfig, prefix: '' };
      const sig = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
      const headers = { 'x-signature': sig };
      assert.ok(verifyAuth(rawBody, headers, noPrefixConfig, secret));
    });
  });

  describe('type: bearer', () => {
    const bearerConfig = { type: 'bearer' };

    it('passes with correct token', () => {
      const headers = { authorization: `Bearer ${secret}` };
      assert.ok(verifyAuth(rawBody, headers, bearerConfig, secret));
    });

    it('rejects wrong token', () => {
      const headers = { authorization: 'Bearer wrong-token' };
      assert.ok(!verifyAuth(rawBody, headers, bearerConfig, secret));
    });

    it('rejects missing authorization header', () => {
      assert.ok(!verifyAuth(rawBody, {}, bearerConfig, secret));
    });

    it('rejects non-bearer auth', () => {
      const headers = { authorization: `Basic ${secret}` };
      assert.ok(!verifyAuth(rawBody, headers, bearerConfig, secret));
    });
  });

  it('throws on unknown auth type', () => {
    assert.throws(() => verifyAuth(rawBody, {}, { type: 'magic' }, secret), /Unknown auth type/);
  });
});
