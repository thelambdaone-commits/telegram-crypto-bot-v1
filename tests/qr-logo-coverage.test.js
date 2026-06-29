import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { TOKEN_CONFIGS } from '../src/core/tokens.config.js';

const LOGO_DIR = fileURLToPath(new URL('../assets/coin-logos/', import.meta.url));

// Symbols (lower-case) known to be ABSENT from the spothq CDN icon set used by
// qr.js. They MUST be bundled locally, otherwise the deposit QR renders with no
// center logo. Verified by probing the CDN; update if the CDN coverage changes.
const CDN_MISSING = ['weth', 'wsol', 'msol', 'arb', 'op', 'ton'];

test('les logos absents du CDN sont bundlés dans assets/coin-logos/', () => {
  for (const sym of CDN_MISSING) {
    assert.ok(
      existsSync(`${LOGO_DIR}${sym}.png`),
      `Logo manquant: assets/coin-logos/${sym}.png (absent du CDN → QR sans logo)`
    );
  }
});

test('chaque symbole de token a un logo résoluble (bundle local OU sur le CDN)', () => {
  // Tokens présumés présents sur le CDN (sinon ils seraient dans CDN_MISSING).
  const tokenSymbols = new Set();
  for (const cfg of Object.values(TOKEN_CONFIGS)) {
    for (const sym of Object.keys(cfg.tokens || {})) tokenSymbols.add(sym.toLowerCase());
  }
  for (const sym of tokenSymbols) {
    const bundled = existsSync(`${LOGO_DIR}${sym}.png`);
    const assumedOnCdn = !CDN_MISSING.includes(sym);
    assert.ok(
      bundled || assumedOnCdn,
      `Token ${sym}: ni bundlé ni réputé présent sur le CDN → ajouter assets/coin-logos/${sym}.png`
    );
  }
});
