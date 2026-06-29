import { adminSecurityKeyboard } from '../../keyboards/index.js';
import { CALLBACKS } from '../../constants/callbacks.js';
import { safeAnswerCbQuery } from '../../../shared/utils/telegram.js';
import { adminGuard } from '../../middlewares/auth.middleware.js';
import { getRateLimitStats, DAILY_VOLUME_LIMITS } from '../../middlewares/security.middleware.js';
import { auditLogger } from '../../../shared/security/audit-logger.js';
import { config, torProxyUrl } from '../../../core/config.js';
import { logger } from '../../../shared/logger.js';

// Passive security audit (`/audit`, alias `/stress`, and the 🧪 button in the
// 🔒 Sécurité panel). Read-only: it inspects in-memory limiter/log state, scans
// stored wallet labels for injection patterns and pings RPC endpoints. It never
// mutates anything — there is no destructive stress component.

// Labels/usernames are user-controlled. Flag anything that looks like an HTML,
// JS or template-injection attempt so we can confirm escapeHtml is applied
// everywhere these strings are rendered.
const SUSPICIOUS_LABEL = /[<>]|&#\d|javascript:|on(?:error|load|click|mouse)\s*=|\$\{|\{\{/i;

// EVM endpoints answer a JSON-RPC `eth_blockNumber`; Solana a `getHealth`;
// everything else is treated as a plain HTTP reachability probe.
function buildRpcTargets() {
  const r = config.rpc;
  return [
    { label: 'ETH', url: r.eth, type: 'evm' },
    { label: 'ARB', url: r.arb, type: 'evm' },
    { label: 'MATIC', url: r.matic, type: 'evm' },
    { label: 'OP', url: r.op, type: 'evm' },
    { label: 'BASE', url: r.base, type: 'evm' },
    { label: 'BSC', url: r.bsc, type: 'evm' },
    { label: 'AVAX', url: r.avax, type: 'evm' },
    { label: 'SOL', url: r.sol, type: 'sol' },
    { label: 'BTC', url: r.btcApi, type: 'http' },
    { label: 'LTC', url: r.ltcApi, type: 'http' },
    { label: 'BCH', url: r.bchApi, type: 'http' },
    { label: 'ZEC', url: r.zecApi ? `${r.zecApi.replace(/\/+$/, '')}/stats` : '', type: 'http' },
    { label: 'TRX', url: r.trx, type: 'http' },
    { label: 'TON', url: r.ton, type: 'http' },
  ].filter((t) => t.url);
}

async function pingRpc(target, timeoutMs = 4000) {
  const start = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let res;
    if (target.type === 'evm' || target.type === 'sol') {
      const method = target.type === 'sol' ? 'getHealth' : 'eth_blockNumber';
      res = await fetch(target.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params: [] }),
        signal: controller.signal,
      });
    } else {
      res = await fetch(target.url, { method: 'GET', signal: controller.signal });
    }

    const ms = Date.now() - start;
    // 429/403 means the host is up but throttling us — a distinct signal from
    // "down", and the cue to provision a dedicated API key / private endpoint.
    if (res.status === 429 || res.status === 403) {
      return { ...target, ok: false, rateLimited: true, status: res.status, ms };
    }

    let ok;
    if (target.type === 'evm' || target.type === 'sol') {
      const json = await res.json().catch(() => ({}));
      ok = json.result != null;
    } else {
      // Reachability only: any non-5xx response means the host answered.
      ok = res.status < 500;
    }
    return { ...target, ok, status: res.status, ms };
  } catch (error) {
    const reason = error.name === 'AbortError' ? 'timeout' : error.message || 'erreur';
    return { ...target, ok: false, ms: Date.now() - start, error: reason };
  } finally {
    clearTimeout(timer);
  }
}

// Walk every user's wallets once, flagging injection-shaped labels and
// addresses the owning chain's provider rejects.
async function scanStoredData(storage, walletService) {
  const result = { wallets: 0, users: 0, failedUsers: 0, suspiciousLabels: 0, invalidAddresses: 0 };
  try {
    const users = await storage.getAllUsers();
    result.users = users.length;
    for (const user of users) {
      let wallets = [];
      try {
        wallets = await storage.getWallets(user.chatId);
      } catch (e) {
        // A decryption error or storage-API timeout shouldn't read as "0 wallets,
        // all clean" — count it so the report flags incomplete coverage.
        result.failedUsers += 1;
        logger.warn('Audit: failed to read wallets', { chatId: user.chatId, error: e.message });
        continue;
      }
      for (const w of wallets) {
        result.wallets += 1;
        if (typeof w.label === 'string' && SUSPICIOUS_LABEL.test(w.label)) {
          result.suspiciousLabels += 1;
        }
        const provider = walletService?.chains?.[w.chain];
        if (provider?.validateAddress && w.address) {
          try {
            if (!provider.validateAddress(w.address)) result.invalidAddresses += 1;
          } catch {
            // A provider that throws on validation shouldn't abort the whole scan.
          }
        }
      }
    }
  } catch (e) {
    logger.error('Audit: stored-data scan failed', { error: e.message });
  }
  return result;
}

function analyzeLogs(limit = 100) {
  const logs = auditLogger.getRecent(limit);
  const creationByUser = new Map();
  let sends = 0;
  let creations = 0;
  let adminAccess = 0;
  let nonAdminAdminAttempts = 0;

  for (const log of logs) {
    const action = String(log.action || '');
    if (action === 'SEND_TX') sends += 1;
    if (action === 'CREATE_WALLET') {
      creations += 1;
      creationByUser.set(log.chatId, (creationByUser.get(log.chatId) || 0) + 1);
    }
    if (action.startsWith('ADMIN_')) {
      if (log.isAdmin) adminAccess += 1;
      else nonAdminAdminAttempts += 1;
    }
  }

  // A single user spinning up many wallets inside one log buffer is the
  // automated-abuse signature worth surfacing.
  const rapidCreators = [...creationByUser.entries()].filter(([, n]) => n >= 5).length;

  return {
    analyzed: logs.length,
    sends,
    creations,
    adminAccess,
    nonAdminAdminAttempts,
    rapidCreators,
  };
}

function yesNo(value) {
  return value ? '✅' : '❌';
}

export async function buildAuditReport(storage, walletService) {
  const stats = getRateLimitStats();
  const targets = buildRpcTargets();
  const [scan, ...rpcResults] = await Promise.all([
    scanStoredData(storage, walletService),
    ...targets.map((t) => pingRpc(t)),
  ]);
  const logs = analyzeLogs(100);

  const lightningOn = Boolean(config.lightning.url && config.lightning.password);

  let text = "🧪 <b>Rapport d'Audit Sécurité</b>\n";
  text += '━━━━━━━━━━━━━━━━━\n\n';

  // 1. Configuration
  text += '🔧 <b>Configuration</b>\n';
  text += `• Rate limit : ${config.rateLimit} req/min\n`;
  text += '• Anti-burst : 10 / 10s\n';
  text += `• Max message : ${config.maxMessageLength} car.\n`;
  text += `• Session timeout : ${config.sessionTimeout} min\n`;
  text += `• Limites/jour : ETH ${DAILY_VOLUME_LIMITS.eth} | SOL ${DAILY_VOLUME_LIMITS.sol} | USD ${DAILY_VOLUME_LIMITS.usd}\n`;
  text += `• Lightning : ${lightningOn ? 'activé ✅' : 'désactivé'}\n`;
  text += `• Tor proxy : ${torProxyUrl ? 'activé ✅' : 'désactivé'}\n`;
  text += `• BOT_TOKEN ${yesNo(config.botToken)} · MASTER_KEY ${yesNo(config.masterKey)}\n\n`;

  // 2. Rate limiters
  text += '🚦 <b>Rate Limiters</b>\n';
  text += `• Global : ${stats.global.activeUsers} actifs, ${stats.global.blacklistedUsers} bloqués\n`;
  text += `• Burst : ${stats.burst.activeUsers} actifs\n`;
  text += `• Sensible : ${stats.sensitive.activeUsers} actifs\n`;
  text += `• Transaction : ${stats.transaction.activeUsers} actifs\n\n`;

  // 3. Blacklist
  text += '🚫 <b>Blacklist</b>\n';
  if (stats.global.blacklist.length === 0) {
    text += '• Aucun utilisateur blacklisté ✅\n\n';
  } else {
    text += `• ${stats.global.blacklist.length} bloqué(s) : `;
    text += stats.global.blacklist.map((id) => `<code>${id}</code>`).join(' ');
    text += '\n\n';
  }

  // 4. Log analysis
  text += `📋 <b>Analyse des logs (${logs.analyzed})</b>\n`;
  text += `• ${logs.sends} envoi(s) · ${logs.creations} création(s)\n`;
  text += `• ${logs.adminAccess} accès admin\n`;
  text += `• ${logs.nonAdminAdminAttempts} tentative(s) admin non autorisée(s)${logs.nonAdminAdminAttempts > 0 ? ' ⚠️' : ''}\n`;
  text += `• ${logs.rapidCreators} créateur(s) rapide(s) suspect(s)${logs.rapidCreators > 0 ? ' ⚠️' : ''}\n\n`;

  // 5. Injection / integrity scan
  text += '💉 <b>Test d\'injection</b>\n';
  text += `• ${scan.wallets} wallet(s) / ${scan.users} user(s) scannés\n`;
  if (scan.failedUsers > 0) {
    text += `• ${scan.failedUsers} user(s) non récupéré(s) ⚠️ (timeout/corruption)\n`;
  }
  text += `• ${scan.suspiciousLabels} label(s) suspect(s) ${scan.suspiciousLabels === 0 ? '✅' : '⚠️'}\n`;
  text += `• ${scan.invalidAddresses} adresse(s) invalide(s) ${scan.invalidAddresses === 0 ? '✅' : '⚠️'}\n\n`;

  // 6. RPC health
  text += '🔗 <b>RPC Health</b>\n';
  for (const r of rpcResults) {
    if (r.ok) {
      text += `• ${r.label} ✅ (${r.ms}ms)\n`;
    } else if (r.rateLimited) {
      text += `• ${r.label} ⏳ rate-limité (HTTP ${r.status})\n`;
    } else {
      text += `• ${r.label} ❌ ${r.error || 'erreur'}\n`;
    }
  }
  text += '\n';

  // 7. Recommendations
  const recos = [];
  const downRpc = rpcResults.filter((r) => !r.ok && !r.rateLimited).map((r) => r.label);
  const limitedRpc = rpcResults.filter((r) => r.rateLimited).map((r) => r.label);
  if (downRpc.length > 0) {
    recos.push(`⚠️ RPC injoignable : ${downRpc.join(', ')} — vérifie les endpoints (env/vault).`);
  }
  if (limitedRpc.length > 0) {
    recos.push(
      `⏳ RPC rate-limité : ${limitedRpc.join(', ')} — provisionne une clé API dédiée ou un endpoint privé.`
    );
  }
  if (scan.failedUsers > 0) {
    recos.push(
      `⚠️ ${scan.failedUsers} user(s) non scanné(s) (timeout/corruption) — couverture incomplète, relance l'audit.`
    );
  }
  if (stats.global.blacklistedUsers > 0) {
    recos.push(`⚠️ ${stats.global.blacklistedUsers} utilisateur(s) blacklisté(s) — vérifie via /admin.`);
  }
  if (logs.nonAdminAdminAttempts > 0) {
    recos.push(`🚨 ${logs.nonAdminAdminAttempts} tentative(s) d'accès admin par un non-admin.`);
  }
  if (logs.rapidCreators > 0) {
    recos.push(`⚠️ ${logs.rapidCreators} user(s) créant des wallets en rafale — possible abus.`);
  }
  if (scan.suspiciousLabels > 0) {
    recos.push(`⚠️ ${scan.suspiciousLabels} label(s) à motif d'injection — confirme l'échappement HTML.`);
  }
  if (scan.invalidAddresses > 0) {
    recos.push(`⚠️ ${scan.invalidAddresses} adresse(s) stockée(s) invalide(s).`);
  }

  text += '🧪 <b>Recommandations</b>\n';
  text += recos.length === 0 ? '• Aucune anomalie détectée ✅' : recos.map((r) => `${r}`).join('\n');

  return text;
}

export function setupAdminAudit(bot, storage, sessions, walletService) {
  async function runAudit(ctx, { edit }) {
    if (!adminGuard(ctx)) return;
    const running = '🧪 <b>Audit en cours…</b>\n\n<i>Ping des RPC + scan des données…</i>';

    let placeholderId;
    if (edit) {
      await ctx.editMessageText(running, { parse_mode: 'HTML' });
    } else {
      const sent = await ctx.reply(running, { parse_mode: 'HTML' });
      placeholderId = sent.message_id;
    }

    let report;
    try {
      report = await buildAuditReport(storage, walletService);
    } catch (e) {
      logger.error('Audit report failed', { error: e.message });
      report = `❌ <b>Audit échoué</b>\n\n<code>${e.message}</code>`;
    }

    const options = { parse_mode: 'HTML', ...adminSecurityKeyboard() };
    if (edit) {
      await ctx.editMessageText(report, options);
    } else {
      await ctx.telegram.editMessageText(ctx.chat.id, placeholderId, undefined, report, options);
    }
  }

  bot.action(CALLBACKS.ADMIN_AUDIT, async (ctx) => {
    await safeAnswerCbQuery(ctx);
    await runAudit(ctx, { edit: true });
  });

  bot.command('audit', async (ctx) => {
    if (!adminGuard(ctx)) return;
    await runAudit(ctx, { edit: false });
  });

  // Alias kept for the originally-proposed command name.
  bot.command('stress', async (ctx) => {
    if (!adminGuard(ctx)) return;
    await runAudit(ctx, { edit: false });
  });
}
