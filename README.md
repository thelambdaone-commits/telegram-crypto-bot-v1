# 🤖 Crypto Bot - Telegram Multi-Chain Wallet Manager

Bot Telegram modulaire pour gerer des wallets crypto multi-chain, suivre les soldes, envoyer des fonds, utiliser les modules Solana, et connecter des wallets Ethereum/Polygon a Polymarket.

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
| 🪙 Multi-chain | Ethereum, Polygon, Solana, Bitcoin, Litecoin, BCH, Arbitrum, Optimism, Base |
| 💳 Wallets | Creation et import avec labels auto |
| 📤 Transferts | Estimation dynamique des frais |
| 🔐 Staking | SOL via Jito et Marinade |
| 🧹 Dust Keeper | Analyse/nettoyage petits soldes Solana |
| 🎨 Tokens SPL | Creation de tokens et NFTs |
| 💵 Prix EUR | CoinGecko intgre |
| 🔍 Detection | Reconnaissance automatique d'adresse publique |
| 👮 Admin | Panel, logs audit, rate limiting, stockage chiffre |
| 🎯 Polymarket | Wallets ETH/Polygon, credentials CLOB, switch sessions, historique trades |

## 🏗️ Architecture

```
src/
├── bot/                 # Interface Telegram: handlers, keyboards, textes, middlewares
│   └── handlers/
│       └── polymarket/  # UI et flow Polymarket
├── clob/                # Client Polymarket CLOB, Data API, credentials, markets
├── core/                # Config, stockage, monitor
├── modules/             # Services metier: wallet, staking, tokens, NFTs, dust
├── providers/           # Adaptateurs blockchain
├── shared/              # Logger, chiffrement, prix, securite
└── index.js            # Point d'entree
```

Le bot garde les integrations separees par module. La logique Polymarket ne depend pas des handlers generiques hors points d'entree Telegram, et le code CLOB/Data API reste dans `src/clob/`.

## 📋 Prerequisites

- Node.js `>=20.18.0`
- npm
- Un token Telegram BotFather
- Une cle de chiffrement 32 bytes en hexadecimal

###🔑 Generation de la cle de chiffrement

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

Variables minimales :

| Variable | Description |
| --- | --- |
| `BOT_TOKEN` | Token Telegram cree via BotFather |
| `MASTER_ENCRYPTION_KEY` | Cle hex 64 caracteres pour chiffrer les secrets |
| `ADMIN_CHAT_ID` | Un ou plusieurs IDs Telegram separes par des virgules |
| `SOL_RPC_URL` | RPC Solana |
| `DATA_PATH` | Dossier de stockage local, par defaut `./data` |

### Variables Polymarket

| Variable | Description |
| --- | --- |
| `POLYMARKET_HOST` | Endpoint CLOB, par defaut `https://clob.polymarket.com` |
| `POLYMARKET_CHAIN_ID` | Chain ID Polygon, par defaut `137` |
| `POLYMARKET_FEED_ENABLED` | Active/desactive le feed Polymarket |
| `POLYMARKET_FEED_INTERVAL` | Intervalle du feed en millisecondes |
| `POLYMARKET_ALERT_CHAT_ID` | Chat cible pour les alertes feed |

Les API keys Polymarket ne sont pas placees dans `.env`. Elles sont derivees automatiquement depuis le wallet quand possible, ou saisies dans Telegram en fallback, puis stockees chiffrees.

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
npm run test:clob
npm run precheck
npm run check:polymarket
npm run check:polymarket-history
npm run lint
```

### Polymarket dans Telegram

| Commande / action | Role |
| --- | --- |
| Bouton Polymarket ou `/poly` | Ouvre le menu Polymarket |
| `/polyconnect` ou bouton connexion | Choisit un wallet ETH/Polygon ou genere un nouveau wallet |
| Bouton Historique | Affiche les trades Polymarket via Data API |
| Bouton Changer wallet | Switch entre les credentials Polymarket sauvegardes |
| Bouton Deconnecter | Desactive la session active sans supprimer les credentials sauvegardes |
| `/cancel` | Annule un flow Polymarket en cours |

## 🎯 Polymarket

Le flow Polymarket fonctionne ainsi :

1. L'utilisateur ouvre Polymarket.
2. Le bot propose les wallets ETH/Polygon existants ou la generation d'un nouveau wallet.
3. Si un nouveau wallet est genere, il est cree via le service wallet, sauvegarde, puis place en session pour la connexion.
4. Le bot tente de deriver automatiquement les credentials CLOB avec `@polymarket/clob-client`.
5. Si la derivation echoue, le bot bascule sur une saisie manuelle API Key / Secret / Passphrase.
6. Les credentials sont stockes chiffres et rattaches au wallet.
7. L'historique utilise la Data API Polymarket et resout le proxy wallet quand necessaire.

Le bot peut conserver plusieurs credentials Polymarket par utilisateur et changer le wallet actif sans supprimer les sessions precedentes.

## 🔓 Portabilite des Credentials

Cette section explique comment exporter vos credentials Polymarket pour les'utiliser dans d'autres bots ou plateformes d'arbitrage.

### Pourquoi exporter?

- Utiliser les memes credentials sur plusieurs bots
- Migrer vers une nouvelle plateforme
- Back up de securite
- Tester d'autres bots d'arbitrage (sports, elections, crypto, meteo)

### Format d'Export

Les credentials sont exportees au format JSON suivant :

```json
{
  "version": "1.0",
  "platform": "polymarket",
  "credentials": [
    {
      "id": "pm-0x...-1234567890",
      "address": "0x...",
      "apiKey": "...",
      "apiSecret": "...",
      "apiPassphrase": "...",
      "chain": "ethereum",
      "connectedAt": "2024-01-01T00:00:00.000Z",
      "walletLabel": "My ETH Wallet"
    }
  ],
  "exportedAt": "2024-01-15T12:00:00.000Z"
}
```

### Etapes d'Export

1. **Generer l'export**
   ```bash
   npm run export:credentials
   ```

2. **Le fichier est enregistre** dans `data/exports/credentials-export-{date}.json`

3. **Verifier le contenu** (sans les valeurs sensibles)
   ```bash
   npm run check:exports
   ```

### Etapes d'Import (Autre Bot)

1. **Recuperer le fichier JSON** exporte
2. **Adapter le format** si necessaire (voir documentation du bot cible)
3. **Importer** via la methode supportee par le bot cible

### Integrations Futures Previsionnelles

Le systeme est concu pour supporter facilement d'autres types de bots d'arbitrage :

| Type | Status | Description |
|------|--------|-------------|
| Paris sportifs | En cours | Integration Polymarket existante |
| Elections | Planifie | Meme structure, marchés politiques |
| Crypto | Planifie | Prix crypto, defi arbitrage |
| Meteo | Planifie | Conditions meteorologiques |

> **Note:** Les credentials exportees sont en clair. Protegez le fichier JSON et ne le partagez pas.

## 🔒 Securite

- Les private keys, mnemonic et credentials Polymarket sont stockes chiffres avec `MASTER_ENCRYPTION_KEY`.
- Les handlers ne renvoient pas les secrets en clair dans Telegram.
- Les logs d'audit evitent les valeurs sensibles.
- `.env` ne doit jamais etre committe.
- `npm audit` peut signaler des vulnerabilites transitives dans la stack Solana actuelle. Ne lancez pas `npm audit fix --force` sans review, car npm peut proposer des versions incompatibles ou regressives.

## 🔧 Diagnostic

### Verifier l'etat Polymarket local

```bash
npm run check:polymarket
```

### Verifier l'historique via Polymarket Data API

```bash
npm run check:polymarket-history
```

Ces scripts listent les wallets/credentials sauvegardes et les resultats d'historique sans exposer les private keys ni les secrets CLOB.

## 📝 Notes Production

- Utilisez Node `>=20.18.0`.
- Gardez une sauvegarde securisee de `MASTER_ENCRYPTION_KEY`; sans elle, les secrets stockes ne seront plus lisibles.
- Protegez le dossier `data/`.
- Surveillez regulierement `npm audit`, mais appliquez les corrections de dependances avec prudence.

---

**⚠️ Avertissement**

Ce bot est destine a un usage personnel et educatif. Verifiez les transactions et les permissions avant toute utilisation avec des fonds reels.