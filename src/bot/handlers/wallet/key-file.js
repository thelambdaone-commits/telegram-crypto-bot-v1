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
  const filename = storage && chatId
    ? await storage.getNextKeysFilename(chatId, scope)
    : scope === 'default' ? 'keys.txt' : `keys-${scope}.txt`;

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
  const filename = storage && chatId
    ? await storage.getNextKeysFilename(chatId, 'polymarket', 'credentials')
    : 'credentials-polymarket.txt';

  return sendTextDocument(ctx, content, filename);
}
