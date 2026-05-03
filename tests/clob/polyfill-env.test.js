import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { exportPolymarketCredentialsToPolyfillEnv } from '../../src/clob/polyfill-env.js';

const creds = {
  privateKey: '1'.repeat(64),
  apiKey: 'api-key',
  apiSecret: 'api-secret',
  apiPassphrase: 'api passphrase',
};

test('exports Polymarket credentials to a polymarket-copy-trade env file', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'polyfill-env-'));
  const envPath = path.join(dir, '.env');
  await fs.writeFile(envPath, 'EXISTING=value\nPOLYMARKET_API_KEY=old\n', 'utf8');

  const result = await exportPolymarketCredentialsToPolyfillEnv(creds, envPath);
  const content = await fs.readFile(envPath, 'utf8');

  assert.equal(result.envPath, envPath);
  assert.match(content, /^EXISTING=value$/m);
  assert.match(content, /^POLYMARKET_API_KEY=api-key$/m);
  assert.match(content, /^POLYMARKET_PRIVATE_KEY=0x1111111111111111111111111111111111111111111111111111111111111111$/m);
  assert.match(content, /^POLYMARKET_SECRET=api-secret$/m);
  assert.match(content, /^POLYMARKET_API_SECRET=api-secret$/m);
  assert.match(content, /^POLYMARKET_PASSPHRASE="api passphrase"$/m);
  assert.match(content, /^POLYMARKET_API_PASSPHRASE="api passphrase"$/m);

  const stat = await fs.stat(envPath);
  assert.equal(stat.mode & 0o777, 0o600);
});

test('rejects incomplete Polymarket sessions', async () => {
  await assert.rejects(
    () => exportPolymarketCredentialsToPolyfillEnv({ ...creds, apiSecret: '' }, '/tmp/not-used.env'),
    /Session Polymarket incomplete/
  );
});
