import { Markup } from 'telegraf';

export function adminKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('📊 Statistiques', 'admin_stats')],
    [Markup.button.callback('🔒 securite', 'admin_security')],
    [Markup.button.callback('⚙️ Panel Admin', 'admin_panel')],
    [Markup.button.callback('❌ Fermer', 'close_menu')],
  ]);
}

export function adminExtendedKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('📊 Statistiques', 'admin_stats'),
      Markup.button.callback('🔒 Securite', 'admin_security'),
    ],
    [
      Markup.button.callback('👥 Liste Users', 'admin_list_users'),
      Markup.button.callback('🔍 Voir User', 'admin_view_user'),
    ],
    [
      Markup.button.callback('🧹 Dust Global', 'admin_dust'),
      Markup.button.callback('📜 Logs Audit', 'admin_logs'),
    ],
    [
      Markup.button.callback('🚫 Ban User', 'admin_ban'),
      Markup.button.callback('✅ Unban User', 'admin_unban'),
    ],
    [
      Markup.button.callback('📢 Broadcast', 'admin_broadcast'),
    ],
  ]);
}

export function adminUserKeyboard(targetUserId) {
  return Markup.inlineKeyboard([
    [Markup.button.callback('🔑 Voir Cles', `admin_user_keys_${targetUserId}`)],
    [Markup.button.callback('↩️ Retour Panel Admin', 'admin_panel')],
  ]);
}

export function adminCancelKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('❌ Annuler', 'admin_panel')],
  ]);
}
