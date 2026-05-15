import { Markup } from 'telegraf';
import { adminGuard } from '../../middlewares/auth.middleware.js';
import { adminCancelKeyboard } from '../../keyboards/index.js';
import { safeAnswerCbQuery, safeEditMessage } from '../../../shared/utils/telegram.js';
import { logger } from '../../../shared/logger.js';

export function setupAdminSecrets(bot, storage, sessions) {
  // View Secrets List
  bot.action('admin_secrets', async (ctx) => {
    await safeAnswerCbQuery(ctx);
    if (!isAdmin(ctx)) return;

    const secrets = storage.secrets.list();
    let text = '🔐 *Gestion des Secrets Chiffrés*\n\n';
    
    if (secrets.length === 0) {
      text += '_Aucun secret configuré dans le vault._';
    } else {
      secrets.forEach(({ key, value }) => {
        text += `🔹 *${key}* : \`${value}\`\n`;
      });
    }

    const buttons = [
      [Markup.button.callback('➕ Ajouter/Modifier', 'admin_secret_set')],
    ];

    if (secrets.length > 0) {
      buttons.push([Markup.button.callback('🗑 Supprimer un secret', 'admin_secret_delete')]);
    }

    buttons.push([Markup.button.callback('⬅️ Retour', 'admin_panel')]);

    await safeEditMessage(ctx, text, {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard(buttons),
    });
  });

  // Start Set Secret Flow
  bot.action('admin_secret_set', async (ctx) => {
    await safeAnswerCbQuery(ctx);
    if (!adminGuard(ctx)) return;

    sessions.setState(ctx.chat.id, 'AWAITING_SECRET_KEY');
    await safeEditMessage(ctx, 'Entrez le *NOM* du secret à définir (ex: `stakingRpc`) :', {
      parse_mode: 'Markdown',
      ...adminCancelKeyboard(),
    });
  });

  // Start Delete Secret Flow
  bot.action('admin_secret_delete', async (ctx) => {
    await safeAnswerCbQuery(ctx);
    if (!adminGuard(ctx)) return;

    const secrets = storage.secrets.list();
    const buttons = secrets.map(({ key }) => [
      Markup.button.callback(`🗑 ${key}`, `admin_secret_del_${key}`)
    ]);
    buttons.push([Markup.button.callback('⬅️ Retour', 'admin_secrets')]);

    await safeEditMessage(ctx, 'Choisissez le secret à *SUPPRIMER* :', {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard(buttons),
    });
  });

  // Handle Delete Confirmation
  bot.action(/^admin_secret_del_(.+)$/, async (ctx) => {
    await safeAnswerCbQuery(ctx);
    if (!adminGuard(ctx)) return;

    const key = ctx.match[1];
    const deleted = await storage.secrets.delete(key);

    if (deleted) {
      await ctx.reply(`✅ Secret *${key}* supprimé.`, { parse_mode: 'Markdown' });
    } else {
      await ctx.reply(`❌ Erreur lors de la suppression de *${key}*.`);
    }

    // Return to secrets list
    const secrets = storage.secrets.list();
    let text = '🔐 *Gestion des Secrets Chiffrés*\n\n';
    if (secrets.length === 0) text += '_Aucun secret configuré dans le vault._';
    else secrets.forEach(({ key, value }) => { text += `🔹 *${key}* : \`${value}\`\n`; });

    const buttons = [[Markup.button.callback('➕ Ajouter/Modifier', 'admin_secret_set')]];
    if (secrets.length > 0) buttons.push([Markup.button.callback('🗑 Supprimer un secret', 'admin_secret_delete')]);
    buttons.push([Markup.button.callback('⬅️ Retour', 'admin_panel')]);

    await ctx.reply(text, {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard(buttons),
    });
  });

  // Text Handler for Secret Input
  bot.on('text', async (ctx, next) => {
    const chatId = ctx.chat.id;
    if (!adminGuard(ctx)) return;

    const state = sessions.getState(chatId);
    if (!state) return next();

    const text = ctx.message.text.trim();

    if (state === 'AWAITING_SECRET_KEY') {
      sessions.setData(chatId, { secretKey: text });
      sessions.setState(chatId, 'AWAITING_SECRET_VALUE');
      return ctx.reply(`Valeur pour *${text}* ? (Saisissez la valeur en clair, elle sera chiffrée immédiatement)`, {
        parse_mode: 'Markdown',
        ...adminCancelKeyboard(),
      });
    }

    if (state === 'AWAITING_SECRET_VALUE') {
      const data = sessions.getData(chatId);
      const key = data.secretKey;
      
      try {
        await storage.secrets.set(key, text);
        sessions.clearState(chatId);
        
        await ctx.reply(`✅ Secret *${key}* enregistré et chiffré.`, {
          parse_mode: 'Markdown',
        });
        
        // Trigger a reload or info about restart if needed
        if (key === 'stakingRpc') {
          await ctx.reply('⚠️ Note: Le bot devra peut-être être redémarré pour appliquer certains changements de RPC.');
        }
      } catch (error) {
        logger.error('Failed to save secret via bot:', error.message);
        await ctx.reply(`❌ Erreur: ${error.message}`);
      }
      return;
    }

    return next();
  });
}
