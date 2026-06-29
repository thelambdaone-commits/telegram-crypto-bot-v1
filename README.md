# 🤖 Crypto Bot - Telegram Multi-Chain Wallet Manager

Bot Telegram modulaire pour gerer des wallets crypto multi-chain : creation/import/derivation, suivi des soldes, envoi de fonds, analyse d'adresses (scan multi-EVM) et prix en EUR.

## ⚡ Pour Commencer

```bash
git clone https://github.com/thelambdaone-commits/telegram-crypto-bot-v1.git
cd telegram-crypto-bot
npm install
cp .env.example .env
# Editez .env avec vos valeurs
npm run precheck
npm start
```

## ✨ Fonctionnalites

| Module | Description |
| ------ |-------------|
| 🪙 Multi-chain | Ethereum, Polygon, Solana, Bitcoin, Litecoin, BCH, Arbitrum, Optimism, Base, Avalanche, Monero, Zcash, Tron, **TON**, **BNB Chain** (15 chaînes) |
| 📷 QR Code | QR d'adresse avec logo de la crypto et nom du réseau au centre |
| 💳 Wallets | Creation, import (cle privee / seed) et derivation depuis une seed existante |
| 💸 Transferts | Estimation dynamique des frais, envoi de tokens (USDC/USDT) |
| 🔄 Échange sans KYC | Échange cross-chain **keyless** (Trocador AnonPay) : depuis le menu ou un wallet, devis + frais affichés, adresse de réception pré-remplie. Repli SimpleSwap. `/swaps` `/list` |
| 💳 Payment gateway | Factures crypto **non-custodial** (BTCPay-style) : `/invoice` → adresse + QR, surveillance auto, notif au paiement. **⚡ Lightning** (BOLT11, instantané) si un nœud phoenixd est branché, avec choix du wallet BTC de réception. Annuler / revoir / recréer une facture (`/invoices`). Trésorerie admin (`/treasury`) : sweep + sélection du wallet |
| 🔍 Analyse | Detection auto d'adresse + scan multi-EVM (solde, tokens, historique, valeur EUR) |
| 💵 Prix EUR | CoinGecko integre (`/price`, `/gas`, `/graph`) — tous les coins/tokens pricés |
| 🔐 Privacy | Monero & Zcash via Tor (optionnel) |
| 👮 Admin | Panel, logs audit, rate limiting, stockage chiffre, secrets RPC |

## 🏗️ Architecture

```
src/
├── bot/                 # Interface Telegram: handlers, keyboards, textes, middlewares
├── core/                # Config, stockage chiffre, sessions, monitor
├── modules/             # Services metier: wallet/ + swap/ (echange no-KYC)
├── providers/           # Adaptateurs blockchain (un par chaine, 15 chaines)
├── shared/              # Logger, chiffrement, prix, QR, securite, RPC resilient
├── bootstrap.js         # Initialisation et verification au demarrage
└── index.js             # Point d'entree
```

Le bot garde la couche Telegram (`bot/`) sans logique blockchain : elle delegue aux services de `modules/` et aux `providers/`.

```
Telegram → Telegraf → middlewares (auth · rate-limit · circuit-breaker)
        → handlers → modules/services → providers → RPC / APIs externes
```

### 🔄 Flux d'echange sans KYC (keyless)

```
/swaps  ou  bouton « 🔄 Echanger » d'un wallet (exch_w_<id>)
   │
   ▼
[1] Crypto a DONNER  ─ picker de symboles (20)  ─┐ multi-reseau ?
   │                                              └─▶ choix du reseau
   ▼
[2] Crypto a RECEVOIR ─ picker (bridges meme-symbole OK) ─┐ multi-reseau ?
   │                                                       └─▶ choix du reseau
   ▼
finalize(from, to)
   ├─ adresse de reception = TON wallet sur la chaine cible (pre-rempli)
   ├─ devis : taux exact Trocador (si TROCADOR_API_KEY) sinon taux marche EUR
   ├─ frais reseau (estimateFees du provider source)
   └─ lien Trocador AnonPay (keyless)  +  repli SimpleSwap
          → l'utilisateur finalise sur Trocador ; le bot ne touche jamais les fonds
```

## 📋 Prérequis

- Node.js `>=20.18.0`
- npm
- Un token Telegram BotFather
- Une cle de chiffrement 32 bytes en hexadecimal

### 🔑 Generation de la cle de chiffrement

```bash
openssl rand -hex 32
```

## 📦 Installation

```bash
git clone https://github.com/thelambdaone-commits/telegram-crypto-bot-v1.git
cd telegram-crypto-bot
npm install
cp .env.example .env
```

Editez ensuite `.env` avec vos valeurs reelles.

## ⚙️ Configuration

### Variables Requises

| Variable | Description |
| --- | --- |
| `BOT_TOKEN` | Token Telegram cree via BotFather |
| `MASTER_ENCRYPTION_KEY` | Cle hex 64 caracteres (AES-256-GCM) |
| `ADMIN_USER_ID` | ID Telegram autorise a utiliser `/admin` |
| `SOL_RPC_URL` | RPC Solana (Helius, QuickNode, etc.) |

### Variables Optionnelles

| Variable | Defaut | Description |
| --- | --- | --- |
| `DATA_PATH` | `./data` | Dossier de stockage local |
| `ADMIN_CHAT_ID` | — | IDs de chats autorises (separes par virgules) |
| `SESSION_TIMEOUT` | `5` | Timeout de session en minutes |
| `RATE_LIMIT` | `30` | Requetes par minute |
| `DAILY_LIMIT_SOL` | — | Limite journaliere en SOL (circuit breaker) |
| `DAILY_LIMIT_ETH` | — | Limite journaliere en ETH (circuit breaker) |
| `DAILY_LIMIT_USD` | — | Limite journaliere en USD (circuit breaker) |
| `TON_API_KEY` | — | Clé TonCenter (optionnelle — le wallet TON marche sans, juste rate-limité) |
| `TROCADOR_API_KEY` | — | Optionnelle : active le devis exact dans le bot. L'échange AnonPay marche **sans** (keyless) |
| `TROCADOR_REF` | — | Code de parrainage Trocador (commissions, optionnel) |
 
<details>
<summary><b>RPC & Endpoints</b> (cliquer pour déplier)</summary>

| Variable | Defaut |
| --- | --- |
| `ETH_RPC_URL` | `https://eth.llamarpc.com` |
| `BTC_API_URL` | `https://mempool.space/api` |
| `POLYGON_RPC_URL` | `https://polygon-rpc.com` |
| `ARB_RPC_URL` | `https://arb1.arbitrum.io/rpc` |
| `LTC_API_URL` | `https://litecoinspace.org/api` |
| `BCH_API_URL` | `https://api.blockchain.info/bch` |
| `OPTIMISM_RPC_URL` | `https://mainnet.optimism.io` |
| `BASE_RPC_URL` | `https://mainnet.base.org` |
| `AVAX_RPC_URL` | `https://api.avax.network/ext/bc/C/rpc` |
| `TON_RPC_URL` | `https://toncenter.com/api/v2/jsonRPC` |

</details>

<details>
<summary><b>Privacy coins (Monero / Zcash) & Tor</b> (optionnel)</summary>

| Variable | Defaut | Description |
| --- | --- | --- |
| `XMR_DAEMON_URL` | `http://node.moneroworld.com:18089` | Daemon Monero (lecture) |
| `XMR_WALLET_RPC_URL` | — | Wallet RPC Monero (requis pour envoyer) |
| `XMR_WALLET_RPC_AUTH` | — | Auth `user:pass` du wallet RPC Monero |
| `ZEC_API_URL` | `https://api.zcha.in/v2/mainnet` | API Zcash (lecture) |
| `ZEC_RPC_URL` | — | Node RPC Zcash (requis pour envoyer) |
| `ZEC_RPC_AUTH` | — | Auth du node RPC Zcash |
| `TOR_PROXY_URL` | — | Proxy SOCKS5 (ex. `socks5://127.0.0.1:9050`) pour router les privacy coins |

</details>

<details>
<summary><b>CoinGecko</b> (optionnel, recommande si l'API publique renvoie 401/429)</summary>

| Variable | Defaut | Description |
| --- | --- | --- |
| `COINGECKO_API_URL` | `https://api.coingecko.com/api/v3` | Endpoint API |
| `COINGECKO_API_KEY` | — | Cle API (demo ou pro) |
| `COINGECKO_API_KEY_HEADER` | `x-cg-demo-api-key` | Header d'authentification |

</details>

<details>
<summary><b>⚡ Lightning (payment gateway, optionnel)</b></summary>

L'invoicing on-chain marche sans config. Pour activer **Lightning** (BOLT11, règlement instantané), fais tourner un nœud **phoenixd** (ACINQ, liquidité auto) et branche son API HTTP :

```bash
# Installer + lancer phoenixd : https://phoenix.acinq.co/server
phoenixd
# Le mot de passe HTTP est dans ~/.phoenix/phoenix.conf (http-password)
```

| Variable | Exemple |
| --- | --- |
| `LN_BACKEND_URL` | `http://127.0.0.1:9740` |
| `LN_PASSWORD` | *(http-password de phoenixd)* |

Sans ces variables, l'option ⚡ Lightning n'apparaît pas dans `/invoice`.

</details>

## 🚀 Lancement

```bash
npm run precheck
npm start
```

### Mode developpement

```bash
npm run dev
```

## 🧪 Commandes Utiles

### Tests et verification

```bash
npm test
npm run precheck
npm run lint
npm run lint:fix
npm run format
npm run config:check
npm run ci
```

### Commandes Telegram

| Commande | Role |
| --- | --- |
| `/wallet`, `/gen <reseau>` | Lister / generer un wallet |
| `/bal <reseau> <adresse>`, `/tx <reseau> <adresse>` | Solde / historique d'une adresse |
| `/send <reseau> <adresse> <montant>` | Envoyer des fonds — montant en crypto (`0.1`), en euros (`25€`) ou `max` (tout le solde) |
| `/validate <reseau> <adresse>` | Vérifier qu'une adresse est valide avant d'envoyer |
| `/price`, `/gas [reseau]`, `/graph <token> <periode>`, `/unit` | Infos marche (`/gas` couvre **toutes** les chaînes : `/gas eth`, `/gas xmr`, `/gas trx`…) |
| `/swaps`, `/list` | Échange sans KYC / liste des coins & tokens supportés |
| `/menu`, `/help`, `/chains`, `/learn` | Navigation et aide |

## 🔒 Securite

- Les private keys et mnemonic sont stockes chiffres avec `MASTER_ENCRYPTION_KEY`.
- Les handlers ne renvoient pas les secrets en clair dans Telegram.
- Les logs d'audit evitent les valeurs sensibles.
- `.env` ne doit jamais etre committe.
- `npm audit` peut signaler des vulnerabilites transitives dans la stack Solana actuelle. Ne lancez pas `npm audit fix --force` sans review, car npm peut proposer des versions incompatibles ou regressives.

## 📝 Notes Production

- Utilisez Node `>=20.18.0`.
- Gardez une sauvegarde securisee de `MASTER_ENCRYPTION_KEY`; sans elle, les secrets stockes ne seront plus lisibles.
- Protegez le dossier `data/`.
- Surveillez regulierement `npm audit`, mais appliquez les corrections de dependances avec prudence.

---

**⚠️ Avertissement**

Ce bot est destine a un usage personnel et educatif. Verifiez les transactions et les permissions avant toute utilisation avec des fonds reels.
