# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Telegram multi-chain crypto wallet manager bot (Telegraf). Supports Ethereum, Polygon, Arbitrum, Optimism, Base, Avalanche (C-Chain), Bitcoin, Litecoin, Bitcoin Cash, Solana, Tron, TON, Monero, Zcash, and BNB Chain (15 chains; the canonical list and metadata live in `src/shared/chains.js` `CHAIN_REGISTRY`, and the runtime registry is `WalletService.chains`). Core features: wallet create/import/derive-from-seed, send funds, public-address analysis (multi-EVM scan with balances/tokens/history), EUR prices (CoinGecko), QR codes, and an admin panel. ESM only (`"type": "module"`), Node `>=20.18.0`. User-facing strings are in **French** — match that when editing UI text.

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
- **`src/providers/`** — one class per chain, all extending `BaseProvider` (`base.provider.js`) with the contract: `createWallet`, `importFromKey`, `importFromSeed`, `getBalance`, `estimateFees`, `sendTransaction`, `getTransactionHistory`, `validateAddress`. The seven EVM chains (eth, arb, matic, op, base, avax, bsc) share `evm-base.js`. `WalletService` (`src/modules/wallet/wallet.service.js`) maps chain keys (`eth`, `btc`, `sol`, `trx`, `xmr`, …) to provider instances — **register a new chain here**. One BIP39 seed derives all non-Monero chains; the first-wallet derivation set is `FIRST_WALLET_CHAINS` near the top of `wallet.service.js`.
- **`src/core/storage.js`** — `StorageService`: per-`chatId` encrypted file (`<chatId>.enc`) under `DATA_PATH`. Each user's data is encrypted with a key derived from `MASTER_ENCRYPTION_KEY` + chatId (`deriveUserKey`). Private keys and mnemonics are always stored encrypted; never return them in plaintext to Telegram.
- **`src/core/session/`** — `SessionManager` combines an in-memory store with an encrypted file store (`sessions.enc`) for restart recovery. Multi-step flows (send, import, address analysis) keep state here, keyed by user.

### No-KYC cross-chain exchange (`src/modules/swap/exchange.service.js`)

CakeWallet-style, **keyless** by default. `ExchangeService` builds a Trocador **AnonPay** link (`anonPayUrl`) pre-filled with the pair + the user's own receiving address — the user completes a real, no-KYC exchange on Trocador; **the bot never holds funds or deposit addresses**. A SimpleSwap link is offered as a fallback (`simpleSwapUrl`).

- **Coin catalog** is auto-generated (`buildCoins`) from `CHAIN_REGISTRY` (natives) + `TOKEN_CONFIGS` (tokens) + `EXTRA_COINS` (TON jettons not in any wallet). Keys: native = chain key (`eth`); token = `<ticker>_<chain>` (`usdt_eth`).
- **Network labels** (`CHAIN_NETWORK` natives + `TOKEN_NETWORK` token overrides) are per-`(coin × network)` and were **verified live against the AnonPay endpoint** (e.g. native ETH = `ERC20`, native BNB = `BEP20`, native AVAX = `AVAXC`, native ARB-chain ETH = `Arbitrum`; Polygon native = ticker `pol`/`Mainnet` via `NATIVE_TICKER` but Polygon tokens = `MATIC`; USDT-tron = `TRC20`, USDT-ton = `TON`). A **wrong label breaks the AnonPay link outright** (Trocador returns "Invalid ticker_to/network_to…"), so keep them in sync with Trocador's catalog — they are not cosmetic. `UNSUPPORTED_TOKENS` lists `(chain, ticker)` pairs Trocador has no route for (also ARB/OP, which it only lists on Ethereum) so the picker shows no dead options. TON receivers get `memo=0` (AnonPay rejects the link otherwise).
- **UI** (`src/bot/handlers/exchange/`, `exchange.keyboards.js`): two-step picker (coin symbol → network, network step only when multi-network). Reachable from `/swaps` and the per-wallet **🔄 Échanger** button (`exch_w_<id>` → pre-selects that wallet's coin). `finalize()` shows a best-effort **devis** (exact Trocador rate if `TROCADOR_API_KEY` set, else a market-rate estimate from the EUR price map) + network fee, then the link.
- `TROCADOR_API_KEY` / `TROCADOR_REF` are **optional** (env or `SecretVault`). Tested in `tests/exchange.service.test.js` (mocked aggregator).

```
EXCHANGE / CALLBACKS  (src/bot/handlers/exchange/index.js)
  exchange ───────────────▶ pick FROM symbol  (exch_fs_<SYM>)
  exch_w_<id> (wallet) ────▶ pick TO symbol    (skips FROM; coin pre-set)
  exch_fs_<SYM> / exch_ts_<SYM> ─ 1 network → next ; many → exch_from_/exch_to_<key>
  exch_to_<key> ──▶ finalize → anonPayUrl (+ simpleSwapUrl) + devis + fee
```

### Payment gateway (`src/modules/payments/`) — in progress

BTCPay-style, **non-custodial** crypto invoicing being built in phases (funds go to the merchant's own wallet; the bot orchestrates + notifies, never custodies). **Phase 0 done**: pure domain — `invoice.service.js` (state machine `new → processing → settled → complete`, plus `expired`/`invalid`; fiat→crypto rate-lock at creation; under/over-payment tolerance) + `ledger.js` (double-entry, balanced). No I/O/funds yet; deps (price, clock) injected; tested in `tests/payments.test.js`. **Phase 1 done**: `payment.service.js` resolves the merchant's own wallet, persists invoices (`storage.addInvoice/...`), and a 30s watcher settles by balance delta + notifies. Merchant UI `src/bot/handlers/payments/` (`/invoice` → method picker → amount → address/BOLT11 + QR; `/invoices`). **Lightning done** (`lightning.service.js`, phoenixd HTTP client — BOLT11 + instant settle via `lookupIncoming`): the ⚡ option appears in `/invoice` only when `LN_BACKEND_URL` + `LN_PASSWORD` are set (run a phoenixd node; OFF by default). Invoicing also covers **tokens/stablecoins** (USDT/USDC/DAI… via an asset picker). **Lightning treasury**: settlement credits a per-merchant INTERNAL balance (`storage.creditLnBalance`, decoupled from physical funds); a separate threshold-based sweep (`PaymentService.sweepLightningBalance`, every `LN_SWEEP_INTERVAL_HOURS`, when node balance ≥ `LN_SWEEP_THRESHOLD_SAT`) moves pooled funds to a **resolved BTC destination** — NOT per-payment. The destination (`PaymentService.sweepDestination`/`_resolveSweepAddress`) is: an explicit cold address (`LN_SWEEP_BTC_ADDRESS`/vault) if set, else the operator's **admin-chosen BTC wallet** (persisted in the admin's `settings.lnSweepWalletId`), else the first `/gen btc` BTC wallet. The receiving wallet is selectable from **both** the ⚡ invoice flow (admin-only step) and admin `/treasury`; every Lightning invoice shows `💰 Encaissé sur`. Payouts persisted (pending/withdrawn/failed); node balance is source of truth so a failed payout retries next cycle without loss. Admin `/treasury` shows node balance + payouts + manual sweep + the wallet picker. Invoices can be **canceled / viewed / recreated** (`getOpenInvoices`/`cancelInvoice`; `/invoices` and the invoice card expose 👁 Voir / 🗑 Annuler; `storage.updateInvoiceIfStatus` makes cancel atomic vs. a concurrent settle). **Next**: signed webhooks, fiat on-ramp deep-links (MoonPay/Transak — compliance offloaded), a Greenfield-style merchant API.

## Conventions

- **Handler module shape**: each feature is a directory under `src/bot/handlers/<feature>/` with an `index.js` exporting `setupXHandlers(...)` that registers Telegraf actions/commands. Multi-step text input is typically isolated in a `text-input.js` within the feature.
- **Keyboards, UI text, callbacks** are centralized: `src/bot/keyboards/`, `src/bot/ui/` + `src/bot/messages/fr.js`, and `src/bot/constants/callbacks.js`. Reuse these rather than inlining strings or callback data.
- **Adding a chain**: create a provider in `src/providers/` (extend `EvmBaseProvider` for EVM chains), register it in `WalletService.chains` (+ `FIRST_WALLET_CHAINS`), add it to `CHAIN_REGISTRY` (`src/shared/chains.js` — drives emojis/labels/derived maps), add RPC defaults in `src/core/config.js`, tokens in `src/core/tokens.config.js`, explorer in `src/shared/explorer.js`, CoinGecko id in `src/shared/coingecko.js` `COIN_IDS` (so it shows a EUR price), a QR logo/label in `src/shared/qr.js` (bundle a PNG under `assets/coin-logos/` if the icon CDN lacks it), the chain-selection keyboard entry, and its Trocador network label in `CHAIN_NETWORK` (`src/modules/swap/exchange.service.js`) to make it exchangeable (tokens auto-sync from `TOKEN_CONFIGS`). EVM addresses can't be auto-detected per-network, so they're swept across all EVM chains in the analyze flow (`src/bot/handlers/send/text-input.js`). `src/bot/handlers/commands/info.commands.js` `/list` & `/chains` derive their lists from these registries automatically.
- **Security**: `src/shared/security/` (audit logger, rate limiter with auto-blacklist), `src/bot/middlewares/` (auth/admin guard, rate limit, daily volume circuit breaker). The structured logger (`src/shared/logger.js`) auto-redacts sensitive fields — log via it, not `console`. The bot auto-leaves any group chat not in `ADMIN_CHAT_ID`. Admin-only `/audit` (alias `/stress`, plus a 🧪 button in the 🔒 Sécurité panel; `src/bot/handlers/admin/audit.js`) runs a **passive, read-only** security report — config check, limiter/blacklist + audit-log stats, wallet-label injection scan, and RPC reachability probes. It mutates nothing; despite the `/stress` name there is no destructive load component.
- **RPC resilience**: `src/shared/rpc/`, `rpc-fallback.js`, `resilient-rpc.js` provide multi-endpoint fallback and a circuit breaker. Solana takes a primary RPC plus `SOL_RPC_FALLBACK_URLS`.
- **Privacy coins** (Monero, Zcash) can route through a Tor SOCKS proxy (`src/shared/tor-proxy.js`, `TOR_PROXY_URL`).

## Security notes

`npm audit` may flag transitive vulns in the Solana stack — do **not** run `npm audit fix --force` without review (it can pull breaking/regressive versions). Never commit `.env` or the `data/` directory.

## Claude Code memory (claude-mem)

This project uses [claude-mem](https://docs.claude-mem.ai/installation) — a Claude Code plugin that persists context across sessions and auto-loads it at the start of each one. Requires Node `>=20`; Bun/uv are auto-installed if missing.

- **Install**: `npx claude-mem install` (recommended — checks runtime, detects the IDE, installs deps, configures the LLM provider, and starts the worker). Or via the marketplace: `/plugin marketplace add thedotmack/claude-mem` then `/plugin install claude-mem`.
- **Do not** `npm install -g claude-mem` — that installs the SDK only; it does **not** register the plugin hooks or start the worker.
- **Verify**: `cat plugin/hooks/hooks.json`, `npm run worker:logs`, `npm run test:context`. Data lives in `~/.claude-mem/` (override with `CLAUDE_MEM_DATA_DIR`).
- **Repair/upgrade**: marketplace updates are automatic; otherwise run `npx claude-mem repair`.
