# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Telegram multi-chain crypto wallet manager bot (Telegraf). Supports Ethereum, Polygon, Arbitrum, Optimism, Base, Avalanche (C-Chain), Bitcoin, Litecoin, Bitcoin Cash, Solana, Tron, TON, Monero, and Zcash (14 chains; the canonical list and metadata live in `src/shared/chains.js` `CHAIN_REGISTRY`, and the runtime registry is `WalletService.chains`). Core features: wallet create/import/derive-from-seed, send funds, public-address analysis (multi-EVM scan with balances/tokens/history), EUR prices (CoinGecko), QR codes, and an admin panel. ESM only (`"type": "module"`), Node `>=20.18.0`. User-facing strings are in **French** — match that when editing UI text.

## Commands

```bash
npm start              # run the bot (src/index.js)
npm run dev            # run with --watch (auto-restart)
npm test               # node --test over tests/
node --test tests/encryption.test.js   # run a single test file
npm run test:watch     # tests in watch mode
npm run lint           # eslint src/  (0 warnings expected)
npm run lint:fix       # eslint --fix
npm run format         # prettier --write src/
npm run precheck       # validate .env + encrypted-storage round-trip before running
npm run config:check   # validate config
npm run ci             # lint + test + precheck (run before considering work done)
```

Prettier: single quotes, semicolons required (enforced by ESLint too).

## Configuration

Config is centralized in `src/core/config.js`, loaded from `.env` (see `.env.example`). It **throws at startup** if `BOT_TOKEN`, `MASTER_ENCRYPTION_KEY` (64-char hex), `SOL_RPC_URL`, or `ADMIN_USER_ID` are missing/invalid. RPC URLs resolve from the encrypted `SecretVault` first, then env, then a hardcoded default — admins can override RPC endpoints at runtime via the admin panel (`src/core/secret-vault.js`, `src/bot/handlers/admin/secrets.js`) without redeploying.

## Architecture

Strictly layered. The Telegram layer (`src/bot/`) holds **no blockchain logic**; it delegates to services in `src/modules/` and `src/providers/`.

```
Telegram → Telegraf → middlewares (auth, rate-limit, profile sync)
        → handlers → modules/services → providers → RPC/external APIs
```

- **`src/index.js` → `src/bootstrap.js`** — `App` class wires everything: creates `Telegraf`, `StorageService`, `SessionManager`, `DepositMonitor`, registers middlewares, and calls `setupHandlers`. Also refuses to boot if an unencrypted `sessions.json` exists.
- **`src/bot/handlers/index.js`** — `setupHandlers(bot, storage)` is the composition root. It constructs the shared `WalletService` and `SessionManager`, then calls each feature's `setupXHandlers(...)`. **Dependency injection is positional** — handlers receive `(bot, storage, walletService, sessions)`. Handler groups: start, wallet, keys, send, admin, balance, navigation, plus the slash commands.
- **`src/providers/`** — one class per chain, all extending `BaseProvider` (`base.provider.js`) with the contract: `createWallet`, `importFromKey`, `importFromSeed`, `getBalance`, `estimateFees`, `sendTransaction`, `getTransactionHistory`, `validateAddress`. EVM chains (eth, arb, matic, op, base, avax) share `evm-base.js`. `WalletService` (`src/modules/wallet/wallet.service.js`) maps chain keys (`eth`, `btc`, `sol`, `trx`, `xmr`, …) to provider instances — **register a new chain here**. One BIP39 seed derives all non-Monero chains; the first-wallet derivation set is `FIRST_WALLET_CHAINS` near the top of `wallet.service.js`.
- **`src/core/storage.js`** — `StorageService`: per-`chatId` encrypted file (`<chatId>.enc`) under `DATA_PATH`. Each user's data is encrypted with a key derived from `MASTER_ENCRYPTION_KEY` + chatId (`deriveUserKey`). Private keys and mnemonics are always stored encrypted; never return them in plaintext to Telegram.
- **`src/core/session/`** — `SessionManager` combines an in-memory store with an encrypted file store (`sessions.enc`) for restart recovery. Multi-step flows (send, import, address analysis) keep state here, keyed by user.

### Swap / Exchange (`src/modules/swap/`)

Two **separate** features live here — keep them distinct:

1. **On-chain swap (dormant).** `swap.service.js` — `getQuote()` works keylessly via the KyberSwap `/routes` API (`aggregators/kyber.aggregator.js`), EVM-only, same-chain. `executeSwap()` (approve → build → `sendRaw`) is **hard-gated behind `config.swapEnabled`** (`SWAP_ENABLED`, default `false`). Tested in `tests/swap.service.test.js`. There is **no `swap` handler / no `/swap` command** — `swap.keyboards.js` is an orphan, and the service is not wired to Telegram.

2. **No-KYC cross-chain exchange (LIVE, quote-only).** `exchange.service.js` + `aggregators/trocador.aggregator.js` — CakeWallet-style. `ExchangeService.getQuote(fromChain, toChain, amount)` returns the best no-KYC rate (received amount + provider) across Trocador's partners; cross-chain (BTC↔XMR, ETH↔SOL, …). **Quote-only: no funds ever move, no address asked.** Needs `TROCADOR_API_KEY` (required even for quotes; via env or the `SecretVault`); without it the button shows a "non configuré" message. Wired through the **🔄 Échanger** button on the main menu → `setupExchangeHandlers` (`src/bot/handlers/exchange/`). The coin↔(ticker,network) map is `TROCADOR_COINS` in `exchange.service.js` — the **only** place to fix a network label if a pair returns "indisponible". `TON` is quotable here without a wallet provider (it carries its own `symbol`/`emoji` in that map). Tested in `tests/exchange.service.test.js` (mocked aggregator).

## Conventions

- **Handler module shape**: each feature is a directory under `src/bot/handlers/<feature>/` with an `index.js` exporting `setupXHandlers(...)` that registers Telegraf actions/commands. Multi-step text input is typically isolated in a `text-input.js` within the feature.
- **Keyboards, UI text, callbacks** are centralized: `src/bot/keyboards/`, `src/bot/ui/` + `src/bot/messages/fr.js`, and `src/bot/constants/callbacks.js`. Reuse these rather than inlining strings or callback data.
- **Adding a chain**: create a provider in `src/providers/` (extend `EvmBaseProvider` for EVM chains), register it in `WalletService.chains`, add RPC defaults in `src/core/config.js`, tokens in `src/core/tokens.config.js`, explorer in `src/shared/explorer.js`, CoinGecko id in `src/shared/coingecko.js`, a QR logo/label in `src/shared/qr.js`, and the chain-selection keyboard entry. EVM addresses can't be auto-detected per-network, so they're swept across all EVM chains in the analyze flow (`src/bot/handlers/send/text-input.js`).
- **Security**: `src/shared/security/` (audit logger, rate limiter with auto-blacklist), `src/bot/middlewares/` (auth/admin guard, rate limit, daily volume circuit breaker). The structured logger (`src/shared/logger.js`) auto-redacts sensitive fields — log via it, not `console`. The bot auto-leaves any group chat not in `ADMIN_CHAT_ID`.
- **RPC resilience**: `src/shared/rpc/`, `rpc-fallback.js`, `resilient-rpc.js` provide multi-endpoint fallback and a circuit breaker. Solana takes a primary RPC plus `SOL_RPC_FALLBACK_URLS`.
- **Privacy coins** (Monero, Zcash) can route through a Tor SOCKS proxy (`src/shared/tor-proxy.js`, `TOR_PROXY_URL`).

## Security notes

`npm audit` may flag transitive vulns in the Solana stack — do **not** run `npm audit fix --force` without review (it can pull breaking/regressive versions). Never commit `.env` or the `data/` directory.
