import { config } from '../core/config.js';
import { getMyTrades } from './markets.js';

const activeFeeds = new Map();
const feedStartTime = new Map();
const MAX_FEEDS = 50;
const FEED_TTL = 2 * 60 * 60 * 1000; // 2 hours

function cleanupFeeds() {
  const now = Date.now();
  for (const [chatId, startTime] of feedStartTime.entries()) {
    if (now - startTime > FEED_TTL) {
      stopFeed(chatId);
    }
  }

  if (activeFeeds.size > MAX_FEEDS) {
    const sorted = [...feedStartTime.entries()].sort((a, b) => a[1] - b[1]);
    const toRemove = sorted.slice(0, activeFeeds.size - MAX_FEEDS);
    for (const [chatId] of toRemove) {
      stopFeed(chatId);
    }
  }
}

// Every 15 minutes
setInterval(cleanupFeeds, 15 * 60 * 1000).unref?.();

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
  feedStartTime.set(chatId, Date.now());
  return true;
}

function stopFeed(chatId) {
  if (activeFeeds.has(chatId)) {
    clearInterval(activeFeeds.get(chatId));
    activeFeeds.delete(chatId);
    feedStartTime.delete(chatId);
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
