/**
 * QR Code Generation - Wallet address QR with the coin logo in the center
 * (Cake Wallet style: rounded modules, white-circled coin icon at center).
 *
 * Uses high error-correction (level H, ~30% recoverable) so the center logo
 * never breaks scanning.
 */
import { createCanvas, loadImage } from 'canvas';
import QRCode from 'qrcode';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import fs from 'node:fs/promises';
import { logger } from './logger.js';

// Native coin whose logo sits in the center. EVM L2s (arb/op/base) use ETH
// since their native/gas asset is ETH.
const LOGO_SYMBOL = {
  eth: 'eth',
  arb: 'eth',
  op: 'eth',
  base: 'eth',
  btc: 'btc',
  ltc: 'ltc',
  bch: 'bch',
  sol: 'sol',
  matic: 'matic',
  avax: 'avax',
  xmr: 'xmr',
  zec: 'zec',
  trx: 'trx',
};

// Network name drawn small under the logo so EVM chains sharing the ETH logo
// (Ethereum/Arbitrum/Optimism/Base) can't be confused with each other.
const NETWORK_LABEL = {
  eth: 'Ethereum',
  arb: 'Arbitrum',
  op: 'Optimism',
  base: 'Base',
  matic: 'Polygon',
  avax: 'Avalanche',
  btc: 'Bitcoin',
  ltc: 'Litecoin',
  bch: 'Bitcoin Cash',
  sol: 'Solana',
  xmr: 'Monero',
  zec: 'Zcash',
  trx: 'Tron',
};

const ICON_CDN = (sym) =>
  `https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/${sym}.png`;

const BACKGROUND = '#ffffff';
const FOREGROUND = '#11131f';
const LOGO_CACHE_DIR = join(tmpdir(), 'crypto-bot-qr-logos');

// In-memory cache of decoded logo images, keyed by symbol.
const logoImageCache = new Map();

async function fetchLogoBuffer(sym) {
  const cachePath = join(LOGO_CACHE_DIR, `${sym}.png`);
  try {
    return await fs.readFile(cachePath);
  } catch {
    // Not cached yet — fetch from CDN.
  }

  const res = await fetch(ICON_CDN(sym));
  if (!res.ok) throw new Error(`logo fetch failed (${res.status})`);
  const buffer = Buffer.from(await res.arrayBuffer());

  try {
    await fs.mkdir(LOGO_CACHE_DIR, { recursive: true });
    await fs.writeFile(cachePath, buffer);
  } catch (e) {
    logger.debug('[QR] logo cache write failed', { error: e.message });
  }
  return buffer;
}

async function loadLogo(sym) {
  if (!sym) return null;
  if (logoImageCache.has(sym)) return logoImageCache.get(sym);

  try {
    const buffer = await fetchLogoBuffer(sym);
    const image = await loadImage(buffer);
    logoImageCache.set(sym, image);
    return image;
  } catch (e) {
    logger.warn('[QR] coin logo unavailable, drawing QR without it', {
      symbol: sym,
      error: e.message,
    });
    logoImageCache.set(sym, null);
    return null;
  }
}

function roundedRect(ctx, x, y, size, radius) {
  roundedRectWH(ctx, x, y, size, size, radius);
}

function roundedRectWH(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * Generate a PNG buffer of the wallet-address QR with the coin logo centered.
 * @param {string} address - wallet address (used as fallback QR payload)
 * @param {string} chain - chain key (eth, btc, sol, ...)
 * @param {object} [options]
 * @param {string} [options.uri] - enriched payment URI to encode instead of the
 *        bare address (EIP-681 / Solana Pay / BIP-21).
 * @param {string} [options.logoSymbol] - override the centered logo (e.g. 'usdt'
 *        for a token deposit instead of the chain's native coin).
 * @param {string} [options.label] - override the label under the logo (e.g.
 *        'USDT · Base' so the QR itself states the token AND the network).
 * @param {string} [options.pastilleSymbol] - small network badge drawn at the
 *        bottom-right of the main logo (e.g. the chain key for a token deposit,
 *        so a USDT logo carries a small ◎/network mark). Skipped if it fails to
 *        load.
 * @returns {Promise<Buffer>} PNG image buffer
 */
export async function generateAddressQR(address, chain, options = {}) {
  const payload = options.uri || String(address);
  const qr = QRCode.create(payload, { errorCorrectionLevel: 'H' });
  const count = qr.modules.size;
  const data = qr.modules.data;

  const quiet = 4;
  const cell = Math.max(8, Math.floor(820 / (count + quiet * 2)));
  const dim = (count + quiet * 2) * cell;

  const canvas = createCanvas(dim, dim);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = BACKGROUND;
  ctx.fillRect(0, 0, dim, dim);

  ctx.fillStyle = FOREGROUND;
  const radius = cell * 0.28;
  for (let row = 0; row < count; row++) {
    for (let col = 0; col < count; col++) {
      if (!(data[row * count + col] & 1)) continue;
      roundedRect(ctx, (quiet + col) * cell, (quiet + row) * cell, cell, radius);
      ctx.fill();
    }
  }

  // Center badge: coin logo + small network name, on a white plate so it reads
  // cleanly over the QR and the user can't confuse two same-logo EVM networks.
  const mainLogoSymbol = options.logoSymbol || LOGO_SYMBOL[chain];
  const pastilleSymbolResolved = options.pastilleSymbol
    ? LOGO_SYMBOL[options.pastilleSymbol] || options.pastilleSymbol
    : null;
  const logo = await loadLogo(mainLogoSymbol);
  // Skip a pastille that would just duplicate the main logo (e.g. a native
  // wallet QR where coin === network) — only draw it when it adds info.
  const pastilleLogo =
    pastilleSymbolResolved && pastilleSymbolResolved !== mainLogoSymbol
      ? await loadLogo(pastilleSymbolResolved)
      : null;
  // An explicit empty label hides the text (token deposits rely on the
  // pastille); otherwise fall back to the network name.
  const label =
    options.label !== undefined ? options.label : NETWORK_LABEL[chain] || chain.toUpperCase();
  const hasLabel = Boolean(label);
  const center = dim / 2;

  const logoSide = Math.round(dim * 0.17);
  const fontSize = Math.max(13, Math.round(dim * 0.034));
  ctx.font = `600 ${fontSize}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const textW = hasLabel ? ctx.measureText(label).width : 0;

  const gap = Math.round(cell * 0.45);
  const padX = Math.round(cell * 1.3);
  const padTop = Math.round(cell * 0.9);
  const padBottom = Math.round(cell * 0.8);

  const contentW = Math.max(logo ? logoSide : 0, textW);
  const contentH = (logo ? logoSide : 0) + (hasLabel ? (logo ? gap : 0) + fontSize : 0);
  const badgeW = contentW + padX * 2;
  const badgeH = contentH + padTop + padBottom;
  const badgeR = Math.round(Math.min(badgeW, badgeH) * 0.18);

  ctx.fillStyle = BACKGROUND;
  roundedRectWH(ctx, center - badgeW / 2, center - badgeH / 2, badgeW, badgeH, badgeR);
  ctx.fill();

  let cursorY = center - badgeH / 2 + padTop;
  if (logo) {
    const logoX = center - logoSide / 2;
    const logoY = cursorY;
    ctx.drawImage(logo, logoX, logoY, logoSide, logoSide);

    // Network badge (pastille): half-overlapping the main logo's bottom-right
    // corner, on a white circle so it reads cleanly. Skipped if it didn't load.
    if (pastilleLogo) {
      const pastilleSide = Math.round(logoSide * 0.4);
      const pastilleR = pastilleSide / 2;
      const pastilleX = logoX + logoSide - Math.round(pastilleSide * 0.25);
      const pastilleY = logoY + logoSide - Math.round(pastilleSide * 0.25);
      ctx.save();
      ctx.beginPath();
      ctx.arc(pastilleX, pastilleY, pastilleR, 0, Math.PI * 2);
      ctx.fillStyle = BACKGROUND;
      ctx.fill();
      ctx.clip();
      ctx.drawImage(
        pastilleLogo,
        pastilleX - pastilleR,
        pastilleY - pastilleR,
        pastilleSide,
        pastilleSide
      );
      ctx.restore();
    }
    cursorY += logoSide + (hasLabel ? gap : 0);
  }
  if (hasLabel) {
    ctx.fillStyle = FOREGROUND;
    ctx.fillText(label, center, cursorY + fontSize / 2);
  }

  return canvas.toBuffer('image/png');
}
