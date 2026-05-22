function normalizeSecret(value) {
  return String(value || '').trim();
}

function walletKeyBlock(wallet) {
  const lines = [
    `CHAIN=${normalizeSecret(wallet.chain).toUpperCase()}`,
    `ADDRESS=${normalizeSecret(wallet.address)}`,
    `PRIVATE_KEY=${normalizeSecret(wallet.privateKey)}`,
  ];

  if (wallet.mnemonic) {
    lines.push(`SEED=${normalizeSecret(wallet.mnemonic)}`);
  }

  return lines.join('\n');
}

function safeFilenamePart(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function getWalletNumber(wallet) {
  const labelMatch = String(wallet?.label || '').match(/(?:^|\s)(\d+)$/);
  return labelMatch?.[1] || null;
}

function buildWalletKeysFilename(wallets, scope = 'default') {
  const list = Array.isArray(wallets) ? wallets : [wallets];
  const safeScope = safeFilenamePart(scope);
  const scopePrefix = safeScope && safeScope !== 'default' ? `keys-${safeScope}` : 'keys';

  if (list.length === 1) {
    const wallet = list[0];
    const chain = safeFilenamePart(wallet?.chain);
    const number = getWalletNumber(wallet);

    if (chain && number) {
      return `${scopePrefix}-${chain}-${number}.txt`;
    }
  }

  const numbers = [...new Set(list.map(getWalletNumber).filter(Boolean))];
  if (numbers.length === 1) {
    return `${scopePrefix}-wallets-${numbers[0]}.txt`;
  }
  if (numbers.length > 1) {
    return `${scopePrefix}-wallets-${numbers.join('-')}.txt`;
  }

  return null;
}

export function buildWalletKeysText(wallets) {
  const list = Array.isArray(wallets) ? wallets : [wallets];
  return `${list.map(walletKeyBlock).join('\n\n')}\n`;
}

async function sendTextDocument(ctx, content, filename) {
  return ctx.replyWithDocument(
    {
      source: Buffer.from(content, 'utf8'),
      filename,
    },
    {
      protect_content: true,
    }
  );
}

export async function sendWalletKeysFile(ctx, wallets, storage = null, options = {}) {
  const content = buildWalletKeysText(wallets);
  const chatId = ctx.chat?.id || ctx.callbackQuery?.message?.chat?.id;
  const scope = options.scope || 'default';
  const walletFilename = buildWalletKeysFilename(wallets, scope);
  const filename =
    walletFilename ||
    (storage && chatId
      ? await storage.getNextKeysFilename(chatId, scope)
      : scope === 'default'
        ? 'keys.txt'
        : `keys-${scope}.txt`);

  return sendTextDocument(ctx, content, filename);
}

export function buildPolymarketCredentialsText(credentials) {
  const lines = [
    `POLYMARKET_API_KEY=${normalizeSecret(credentials.apiKey)}`,
    `POLYMARKET_API_SECRET=${normalizeSecret(credentials.apiSecret)}`,
    `POLYMARKET_API_PASSPHRASE=${normalizeSecret(credentials.apiPassphrase)}`,
  ];

  return `${lines.join('\n')}\n`;
}

export async function sendPolymarketCredentialsFile(ctx, credentials, storage = null) {
  const content = buildPolymarketCredentialsText(credentials);
  const chatId = ctx.chat?.id || ctx.callbackQuery?.message?.chat?.id;
  const filename =
    storage && chatId
      ? await storage.getNextKeysFilename(chatId, 'polymarket', 'credentials')
      : 'credentials-polymarket.txt';

  return sendTextDocument(ctx, content, filename);
}
