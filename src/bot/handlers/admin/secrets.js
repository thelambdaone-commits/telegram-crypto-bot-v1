import { Markup } from 'telegraf';
import { adminGuard } from '../../middlewares/auth.middleware.js';
import { adminCancelKeyboard } from '../../keyboards/index.js';
import { safeAnswerCbQuery, safeEditMessage, escapeHtml } from '../../../shared/utils/telegram.js';
import { logger } from '../../../shared/logger.js';

export function setupAdminSecrets(bot, storage, sessions) {
  // View Secrets List
  bot.action('admin_secrets', async (ctx) => {
    await safeAnswerCbQuery(ctx);
    if (!adminGuard(ctx)) return;

    const secrets = storage.secrets.list();
    let text = '🔐 <b>Gestion des Secrets Chiffrés</b>\n\n';

    if (secrets.length === 0) {
      text += '<i>Aucun secret configuré dans le vault.</i>';
    } else {
      secrets.forEach(({ key, value }) => {
        text += `🔹 <b>${escapeHtml(key)}</b> : <code>${escapeHtml(value)}</code>\n`;
      });
    }

    const buttons = [
      [Markup.button.callback('➕ Ajouter/Modifier', 'admin_secret_set')],
    ];

    if (secrets.length > 0) {
      buttons.push([Markup.button.callback('🗑 Supprimer un secret', 'admin_secret_delete')]);
    }

    buttons.push([Markup.button.callback('↩️ Retour', 'admin_panel')]);

    await safeEditMessage(ctx, text, {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard(buttons),
    });
  });

  // Start Set Secret Flow
  bot.action('admin_secret_set', async (ctx) => {
    await safeAnswerCbQuery(ctx);
    if (!adminGuard(ctx)) return;

    sessions.setState(ctx.chat.id, 'AWAITING_SECRET_KEY');
    await safeEditMessage(
      ctx,
      'Entrez le <b>NOM</b> du secret à définir (ex: <code>avaxRpc</code>, <code>solRpc</code>) :',
      {
        parse_mode: 'HTML',
        ...adminCancelKeyboard(),
      }
    );
  });

  // Start Delete Secret Flow
  bot.action('admin_secret_delete', async (ctx) => {
    await safeAnswerCbQuery(ctx);
    if (!adminGuard(ctx)) return;

    const secrets = storage.secrets.list();
    const buttons = secrets.map(({ key }) => [
      Markup.button.callback(`🗑 ${key}`, `admin_secret_del_${key}`)
    ]);
    buttons.push([Markup.button.callback('↩️ Retour', 'admin_secrets')]);

    await safeEditMessage(ctx, 'Choisissez le secret à <b>SUPPRIMER</b> :', {
      parse_mode: 'HTML',
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
      await ctx.reply(`✅ Secret <b>${escapeHtml(key)}</b> supprimé.`, { parse_mode: 'HTML' });
    } else {
      await ctx.reply(`❌ Erreur lors de la suppression de <b>${escapeHtml(key)}</b>.`, {
        parse_mode: 'HTML',
      });
    }

    // Return to secrets list
    const secrets = storage.secrets.list();
    let text = '🔐 <b>Gestion des Secrets Chiffrés</b>\n\n';
    if (secrets.length === 0) text += '<i>Aucun secret configuré dans le vault.</i>';
    else
      secrets.forEach(({ key, value }) => {
        text += `🔹 <b>${escapeHtml(key)}</b> : <code>${escapeHtml(value)}</code>\n`;
      });

    const buttons = [[Markup.button.callback('➕ Ajouter/Modifier', 'admin_secret_set')]];
    if (secrets.length > 0)
      buttons.push([Markup.button.callback('🗑 Supprimer un secret', 'admin_secret_delete')]);
    buttons.push([Markup.button.callback('↩️ Retour', 'admin_panel')]);

    await ctx.reply(text, {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard(buttons),
    });
  });

  // Text Handler for Secret Input
  bot.on('text', async (ctx, next) => {
    const chatId = ctx.chat.id;
    const state = sessions.getState(chatId);
    if (!state?.startsWith('AWAITING_SECRET_')) return next();
    if (!adminGuard(ctx)) return;

    const text = ctx.message.text.trim();

    if (state === 'AWAITING_SECRET_KEY') {
      sessions.setData(chatId, { secretKey: text });
      sessions.setState(chatId, 'AWAITING_SECRET_VALUE');
      return ctx.reply(
        `Valeur pour <b>${escapeHtml(text)}</b> ? (Saisissez la valeur en clair, elle sera chiffrée immédiatement)`,
        {
          parse_mode: 'HTML',
          ...adminCancelKeyboard(),
        }
      );
    }

    if (state === 'AWAITING_SECRET_VALUE') {
      const data = sessions.getData(chatId);
      const key = data.secretKey;
      
      try {
        await storage.secrets.set(key, text);
        sessions.clearState(chatId);
        
        await ctx.reply(`✅ Secret <b>${escapeHtml(key)}</b> enregistré et chiffré.`, {
          parse_mode: 'HTML',
        });
        
        // Trigger a reload or info about restart if needed
        if (key.toLowerCase().includes('rpc')) {
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
