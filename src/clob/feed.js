import { config } from '../core/config.js';
import { getMyTrades } from './markets.js';

const activeFeeds = new Map();

function startFeed(chatId, bot, _storage, delay = config.polymarket.feedInterval) {
  if (activeFeeds.has(chatId)) return false;
  const interval = setInterval(async () => {
    try {
      const trades = await getMyTrades(chatId);
      if (trades.length > 0 && config.polymarket.alertChatId) {
        const last = trades[0];
        const msg = `New trade detected\nSide: ${last.side}\nPrice: ${last.price}\nSize: ${last.size}`;
        bot.telegram.sendMessage(config.polymarket.alertChatId, msg).catch(() => {});
      }
    } catch {
      // Silently ignore feed errors
    }
  }, delay);
  activeFeeds.set(chatId, interval);
  return true;
}

function stopFeed(chatId) {
  if (activeFeeds.has(chatId)) {
    clearInterval(activeFeeds.get(chatId));
    activeFeeds.delete(chatId);
    return true;
  }
  return false;
}

export function isFeedActive(chatId) {
  return activeFeeds.has(chatId);
}

export function cleanupAllFeeds() {
  for (const [, interval] of activeFeeds) {
    clearInterval(interval);
  }
  activeFeeds.clear();
}

export { startFeed, stopFeed };