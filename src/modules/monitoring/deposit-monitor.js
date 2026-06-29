import { logger } from '../../shared/logger.js';
import { config } from '../../core/config.js';
import { formatEUR, convertToEUR } from '../../shared/price.js';
import { escapeHtml } from '../../shared/utils/telegram.js';

const DEFAULT_MONITOR_INTERVAL_MS = 5 * 60 * 1000;
const DEFAULT_MONITOR_CONCURRENCY = 4;
const DEFAULT_USER_DELAY_MS = 250;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Deposit Monitor - Checks for new deposits and notifies admin
 * Stores last known balances and compares with current balances
 */
export class DepositMonitor {
  constructor(storage, walletService, bot, options = {}) {
    this.storage = storage;
    this.walletService = walletService;
    this.bot = bot;
    this.lastBalances = new Map(); // chatId -> { walletId -> balance }
    this.concurrency = options.concurrency || DEFAULT_MONITOR_CONCURRENCY;
    this.userDelayMs = options.userDelayMs ?? DEFAULT_USER_DELAY_MS;
    this.intervalMs = options.intervalMs || DEFAULT_MONITOR_INTERVAL_MS;
    this.interval = null;
  }

  async processUsers(users, worker) {
    let cursor = 0;
    const workerCount = Math.min(this.concurrency, users.length);

    await Promise.allSettled(
      Array.from({ length: workerCount }, async () => {
        while (cursor < users.length) {
          const user = users[cursor];
          cursor += 1;

          await worker(user);
          if (this.userDelayMs > 0) {
            await delay(this.userDelayMs);
          }
        }
      })
    );
  }

  async getUserBalances(chatId) {
    const balances = await this.walletService.getAllBalances(chatId);
    const userBalances = {};

    for (const wallet of balances) {
      if (wallet.balance && wallet.balance !== 'Erreur') {
        userBalances[wallet.id] = Number.parseFloat(wallet.balance) || 0;
      }
    }

    return { balances, userBalances };
  }

  /**
   * Initialize monitor with current balances
   */
  async initialize() {
    try {
      const users = await this.storage.getAllUsers();

      await this.processUsers(users, async (user) => {
        try {
          const { userBalances } = await this.getUserBalances(user.chatId);
          this.lastBalances.set(user.chatId, userBalances);
        } catch (e) {
          logger.warn('Deposit monitor user initialization failed', {
            chatId: user.chatId,
            error: e.message,
          });
        }
      });

      logger.info('Deposit monitor initialized', { usersCount: this.lastBalances.size });
    } catch (e) {
      logger.logError(e, { context: 'DepositMonitor.initialize' });
    }
  }

  /**
   * Check for deposits (balance increases)
   */
  async checkDeposits() {
    try {
      const users = await this.storage.getAllUsers();

      await this.processUsers(users, async (user) => {
        try {
          const { balances, userBalances: newBalances } = await this.getUserBalances(user.chatId);
          const oldBalances = this.lastBalances.get(user.chatId) || {};

          for (const wallet of balances) {
            if (wallet.balance && wallet.balance !== 'Erreur') {
              const currentBalance = Number.parseFloat(wallet.balance) || 0;
              const oldBalance = oldBalances[wallet.id] || 0;

              if (currentBalance > oldBalance) {
                const depositAmount = currentBalance - oldBalance;
                await this.notifyDeposit(user.chatId, wallet, depositAmount);
              }
            }
          }

          this.lastBalances.set(user.chatId, newBalances);
        } catch (e) {
          logger.warn('Deposit monitor user check failed', {
            chatId: user.chatId,
            error: e.message,
          });
        }
      });
    } catch (e) {
      logger.logError(e, { context: 'DepositMonitor.checkDeposits' });
    }
  }

  /**
   * Notify admin about deposit
   */
  async notifyDeposit(chatId, wallet, amount) {
    if (!config.adminChatId || config.adminChatId.length === 0) return;

    try {
      const userData = await this.storage.loadUserData(chatId);
      const displayName = escapeHtml(
        userData.username ? `@${userData.username}` : userData.firstName
      );
      const conversion = await convertToEUR(wallet.chain, amount);

      const now = new Date();
      const dateStr = `${now.getDate().toString().padStart(2, '0')}/${(now.getMonth() + 1).toString().padStart(2, '0')}/${now.getFullYear()} ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

      const message =
        '💰 <b>Depot Detecte</b>\n\n' +
        `👤 Utilisateur: ${displayName}\n` +
        `🆔 Chat ID: <code>${chatId}</code>\n` +
        `💼 Wallet: ${escapeHtml(wallet.label)}\n` +
        `⛓ Blockchain: ${wallet.chain.toUpperCase()}\n` +
        `📬 Adresse: <code>${wallet.address}</code>\n` +
        `💵 Montant: ${amount.toFixed(8)} ${wallet.chain.toUpperCase()}\n` +
        `💶 Valeur: ${formatEUR(conversion.valueEUR)}\n` +
        `📊 Nouveau solde: ${wallet.balance} ${wallet.chain.toUpperCase()}\n` +
        `📅 Date: ${dateStr}`;

      for (const adminId of config.adminChatId) {
        await this.bot.telegram
          .sendMessage(adminId, message, { parse_mode: 'HTML' })
          .catch((e) =>
            logger.warn('Deposit monitor admin notification failed', {
              adminId,
              chatId,
              error: e.message,
            })
          );
      }

      logger.info('Deposit monitor notified admins', {
        adminsCount: config.adminChatId.length,
        chatId,
        amount,
        chain: wallet.chain,
      });
    } catch (e) {
      logger.logError(e, { context: 'DepositMonitor.notifyDeposit', chatId });
    }
  }

  /**
   * Start monitoring (check every 5 minutes)
   */
  async start() {
    await this.initialize();

    this.interval = setInterval(() => {
      this.checkDeposits();
    }, this.intervalMs);
    this.interval.unref?.();

    logger.info('Deposit monitor started', {
      intervalMs: this.intervalMs,
      concurrency: this.concurrency,
      userDelayMs: this.userDelayMs,
    });
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }
}
