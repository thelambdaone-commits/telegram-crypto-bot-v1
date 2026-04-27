# 🪙 Crypto Bot — Telegram Multi-Chain Wallet Manager

Bot Telegram professionnel et modulaire pour gérer vos portefeuilles crypto sur de multiples blockchains (Ethereum, Bitcoin, Solana, Arbitrum, Polygon, Optimism, Base, etc.).

## 🚀 Fonctionnalités

- 💰 **Gestion Multi-Wallets** : Créez ou importez (Clé Privée / Seed Phrase) des portefeuilles sur 9+ chaînes.
- 💸 **Transferts Intelligents** : Envoi de fonds avec gestion dynamique des frais (Lent, Moyen, Rapide, Auto).
- 📈 **Staking Liquide** : Staking SOL via Jito et Marinade directement depuis l'interface.
- 🧹 **Dust Keeper** : Analysez et nettoyez vos petits soldes (dust) sur Solana.
- 🔨 **Asset Minting** : Créez vos propres Tokens SPL et NFT sur Solana en quelques clics.
- 📊 **Cours EUR** : Suivi des prix en temps réel convertis en Euros via CoinGecko.
- 🔍 **Analyseur d'Adresses** : Détection automatique de la chaîne et consultation des soldes publics.
- 🔒 **Sécurité Avancée** : Double chiffrement des clés, logs d'audit et protection par rate-limiting.
- 👑 **Panel Admin** : Statistiques globales, gestion des utilisateurs et diffusion de messages.

## 📁 Architecture Modulaire

Le projet suit une structure strictement organisée pour une maintenabilité maximale :

```
src/
├── bot/            # Interface Telegram (Handlers, Keyboards, Messages)
├── core/           # Cœur du système (Config, Stockage, Monitor)
├── modules/        # Services métier (Wallet, Staking, Tokens, NFTs, Dust)
├── providers/      # Adaptateurs blockchain (BaseProvider et implémentations)
├── shared/         # Utilitaires partagés (Logger, Prix, Chiffrement)
└── index.js        # Point d'entrée de l'application
```

## 🛠️ Installation

```bash
# 1. Cloner le projet
git clone <url-du-repo> && cd crypto-bot-Dust-Keeper

# 2. Installer les dépendances
npm install

# 3. Configurer l'environnement
cp .env.example .env
# Éditez .env avec vos clés API et paramètres
```

## ⚙️ Configuration (.env)

| Variable | Description |
| :--- | :--- |
| `BOT_TOKEN` | Token obtenu via @BotFather |
| `MASTER_ENCRYPTION_KEY` | Clé 32 bytes hex (`openssl rand -hex 32`) |
| `ADMIN_CHAT_ID` | Vos IDs Telegram (ex: `1234567,8901234`) |
| `SOL_RPC_URL` | Endpoint RPC Solana (recommandé: Helius) |
| `DATA_PATH` | Chemin de stockage des données (défaut: `./data`) |

*Note: Consultez `.env.example` pour la liste complète des RPC optionnels par chaîne.*

## 🏁 Lancement

```bash
# Lancement en production
npm start

# Mode développement avec auto-reload
npm run dev
```

## 🧪 Tests

```bash
# Lancer les tests unitaires
npm test
```

---
*Ce bot est destiné à un usage personnel et éducatif. Assurez-vous de sécuriser votre `MASTER_ENCRYPTION_KEY` et vos sauvegardes de données.*
