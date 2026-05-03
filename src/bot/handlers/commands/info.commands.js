import { mainReplyKeyboard } from '../../keyboards/index.js';
import { getFullHelpText } from '../../ui/index.js';

export function setupInfoCommands(bot) {
  // 🆘 /help - Menu d'aide complet
  bot.command('help', async (ctx) => {
    await ctx.reply(getFullHelpText(), { 
      parse_mode: 'Markdown',
      ...mainReplyKeyboard()
    });
  });

  // 📚 /learn - Leçon éducative
  bot.command('learn', async (ctx) => {
    await ctx.reply(
      '📌 *Coin vs Token*\n\n' +
      '1️⃣ *Coins* 🪙 : Blockchains natives (BTC, ETH, SOL).\n' +
      '2️⃣ *Tokens* 🎫 : Hébérgés (USDC, USDT).\n\n' +
      '🚀 *Layer 2* (Polygon, Base, Optimism) : Moins cher, même adresse ETH.',
      { parse_mode: 'Markdown' }
    );
  });

  // 🔗 /chains - Liste des blockchains supportées
  bot.command('chains', async (ctx) => {
    await ctx.reply(
      '🔗 *Blockchains supportées*\n\n' +
      '• L1 : BTC, ETH, SOL, LTC, BCH\n' +
      '• L2 : Arbitrum, Polygon, Optimism, Base',
      { parse_mode: 'Markdown' }
    );
  });
}
