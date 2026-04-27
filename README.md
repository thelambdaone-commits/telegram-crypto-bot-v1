# Crypto Bot - Telegram Multi-Chain Wallet Manager

Bot Telegram modulaire pour gerer des wallets crypto multi-chain, suivre les soldes, envoyer des fonds, utiliser les modules Solana, et connecter des wallets Ethereum/Polygon a Polymarket.

## Fonctionnalites

- Gestion multi-wallets sur Ethereum, Polygon, Solana, Bitcoin, Litecoin, Bitcoin Cash, Arbitrum, Optimism et Base.
- Creation et import de wallets avec numerotation automatique des labels importes.
- Transferts avec estimation dynamique des frais.
- Staking SOL via Jito et Marinade.
- Dust Keeper pour analyser/nettoyer les petits soldes Solana.
- Creation de tokens SPL et NFT Solana.
- Prix en EUR via CoinGecko.
- Detection automatique d'adresse publique.
- Panel admin, logs d'audit, rate limiting et stockage chiffre.
- Module Polymarket avec wallets ETH/Polygon, generation automatique de credentials CLOB, switch de sessions et historique des trades.

## Architecture

```text
src/
├── bot/                 # Interface Telegram: handlers, keyboards, textes, middlewares
│   └── handlers/
│       └── polymarket/  # UI et flow Polymarket
├── clob/                # Client Polymarket CLOB, Data API, credentials, markets
├── core/                # Config, stockage, monitor
├── modules/             # Services metier: wallet, staking, tokens, NFTs, dust
├── providers/           # Adaptateurs blockchain
├── shared/              # Logger, chiffrement, prix, securite
└── index.js             # Point d'entree
```

Le bot garde les integrations separees par module. La logique Polymarket ne depend pas des handlers generiques hors points d'entree Telegram, et le code CLOB/Data API reste dans `src/clob/`.

## Prerequis

- Node.js `>=20.18.0`
- npm
- Un token Telegram BotFather
- Une cle de chiffrement 32 bytes en hexadecimal

Generation de la cle de chiffrement :

```bash
openssl rand -hex 32
```

## Installation

```bash
git clone https://github.com/thelambdaone-commits/telegram-crypto-bot-v1.git
cd telegram-crypto-bot
npm install
cp .env.example .env
```

Editez ensuite `.env` avec vos valeurs reelles.

## Configuration

Variables minimales :

| Variable | Description |
| --- | --- |
| `BOT_TOKEN` | Token Telegram cree via BotFather |
| `MASTER_ENCRYPTION_KEY` | Cle hex 64 caracteres pour chiffrer les secrets |
| `ADMIN_CHAT_ID` | Un ou plusieurs IDs Telegram separes par des virgules |
| `SOL_RPC_URL` | RPC Solana |
| `DATA_PATH` | Dossier de stockage local, par defaut `./data` |

Variables Polymarket :

| Variable | Description |
| --- | --- |
| `POLYMARKET_HOST` | Endpoint CLOB, par defaut `https://clob.polymarket.com` |
| `POLYMARKET_CHAIN_ID` | Chain ID Polygon, par defaut `137` |
| `POLYMARKET_FEED_ENABLED` | Active/desactive le feed Polymarket |
| `POLYMARKET_FEED_INTERVAL` | Intervalle du feed en millisecondes |
| `POLYMARKET_ALERT_CHAT_ID` | Chat cible pour les alertes feed |

Les API keys Polymarket ne sont pas placees dans `.env`. Elles sont derivees automatiquement depuis le wallet quand possible, ou saisies dans Telegram en fallback, puis stockees chiffrees.

## Lancement

```bash
npm run precheck
npm start
```

Mode developpement :

```bash
npm run dev
```

## Commandes utiles

Tests et verification :

```bash
npm test
npm run test:clob
npm run precheck
npm run check:polymarket
npm run check:polymarket-history
npm run lint
```

Polymarket dans Telegram :

| Commande / action | Role |
| --- | --- |
| Bouton Polymarket ou `/poly` | Ouvre le menu Polymarket |
| `/polyconnect` ou bouton connexion | Choisit un wallet ETH/Polygon ou genere un nouveau wallet |
| Bouton Historique | Affiche les trades Polymarket via Data API |
| Bouton Changer wallet | Switch entre les credentials Polymarket sauvegardes |
| Bouton Deconnecter | Desactive la session active sans supprimer les credentials sauvegardes |
| `/cancel` | Annule un flow Polymarket en cours |

## Polymarket

Le flow Polymarket fonctionne ainsi :

1. L'utilisateur ouvre Polymarket.
2. Le bot propose les wallets ETH/Polygon existants ou la generation d'un nouveau wallet.
3. Si un nouveau wallet est genere, il est cree via le service wallet, sauvegarde, puis place en session pour la connexion.
4. Le bot tente de deriver automatiquement les credentials CLOB avec `@polymarket/clob-client`.
5. Si la derivation echoue, le bot bascule sur une saisie manuelle API Key / Secret / Passphrase.
6. Les credentials sont stockes chiffres et rattaches au wallet.
7. L'historique utilise la Data API Polymarket et resout le proxy wallet quand necessaire.

Le bot peut conserver plusieurs credentials Polymarket par utilisateur et changer le wallet actif sans supprimer les sessions precedentes.

## Securite

- Les private keys, mnemonic et credentials Polymarket sont stockes chiffres avec `MASTER_ENCRYPTION_KEY`.
- Les handlers ne renvoient pas les secrets en clair dans Telegram.
- Les logs d'audit evitent les valeurs sensibles.
- `.env` ne doit jamais etre committe.
- `npm audit` peut signaler des vulnerabilites transitives dans la stack Solana actuelle. Ne lancez pas `npm audit fix --force` sans review, car npm peut proposer des versions incompatibles ou regressives.

## Diagnostic

Pour verifier l'etat Polymarket local sans afficher les secrets :

```bash
npm run check:polymarket
```

Pour verifier que l'historique est visible via Polymarket Data API :

```bash
npm run check:polymarket-history
```

Ces scripts listent les wallets/credentials sauvegardes et les resultats d'historique sans exposer les private keys ni les secrets CLOB.

## Notes production

- Utilisez Node `>=20.18.0`.
- Gardez une sauvegarde securisee de `MASTER_ENCRYPTION_KEY`; sans elle, les secrets stockes ne seront plus lisibles.
- Protegez le dossier `data/`.
- Surveillez regulierement `npm audit`, mais appliquez les corrections de dependances avec prudence.

---

Ce bot est destine a un usage personnel et educatif. Verifiez les transactions et les permissions avant toute utilisation avec des fonds reels.
