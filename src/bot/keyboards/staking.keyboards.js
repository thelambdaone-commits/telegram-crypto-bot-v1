import { Markup } from 'telegraf';
import { CALLBACKS, dynamicCallback } from '../constants/callbacks.js';
import {
  getAaveChain,
  getAaveChains,
  getCurveLpPools,
  getEthStakingProviders,
} from '../../core/staking.config.js';

export function liquidStakingKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('🥇 JitoSOL', CALLBACKS.JITO_STAKING),
      Markup.button.callback('🥈 Marinade', CALLBACKS.MARINADE_STAKING),
    ],
    [Markup.button.callback('↩️ Retour', CALLBACKS.STAKING_MENU)],
  ]);
}

export function jitoWithdrawalKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('⚡ Rapide (Swap)', CALLBACKS.JITO_EXIT_FAST_SELECT),
      Markup.button.callback('⏳ Standard (Unstake)', CALLBACKS.JITO_EXIT_STANDARD_SELECT),
    ],
    [Markup.button.callback('↩️ Retour', CALLBACKS.JITO_STAKING)],
  ]);
}

export function stakingExitKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('25%', CALLBACKS.JITO_EXIT_QUICK_25),
      Markup.button.callback('50%', CALLBACKS.JITO_EXIT_QUICK_50),
      Markup.button.callback('100%', CALLBACKS.JITO_EXIT_QUICK_100),
    ],
    [Markup.button.callback('✏️ Saisir un montant', CALLBACKS.JITO_EXIT_MANUAL)],
    [Markup.button.callback('❌ Retour', CALLBACKS.JITO_STAKING)],
  ]);
}

export function jitoStandardExitKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('25%', CALLBACKS.JITO_EXIT_STD_25),
      Markup.button.callback('50%', CALLBACKS.JITO_EXIT_STD_50),
      Markup.button.callback('100%', CALLBACKS.JITO_EXIT_STD_100),
    ],
    [Markup.button.callback('✏️ Saisir un montant', CALLBACKS.JITO_EXIT_STD_MANUAL)],
    [Markup.button.callback('❌ Retour', CALLBACKS.JITO_WITHDRAW)],
  ]);
}

export function jitoUnstakeStatusKeyboard(requestId, canClaim = false, hasAddress = true) {
  const buttons = [];
  if (canClaim) {
    buttons.push([
      Markup.button.callback('✅ Réclamer mes SOL', dynamicCallback.jitoClaimUnstake(requestId)),
    ]);
  } else {
    buttons.push([
      Markup.button.callback('⏳ Désactivation en cours...', CALLBACKS.JITO_UNSTAKE_PENDING_INFO),
    ]);
  }

  if (!hasAddress) {
    buttons.push([
      Markup.button.callback('🔍 Recherche automatique', dynamicCallback.jitoUnstakeAutoRepair(requestId)),
    ]);
    buttons.push([
      Markup.button.callback(
        "✏️ Saisir l'adresse manuellement",
        dynamicCallback.jitoUnstakeManualSync(requestId)
      ),
    ]);
    buttons.push([
      Markup.button.callback('🗑 Supprimer cette demande', dynamicCallback.jitoUnstakeDelete(requestId)),
    ]);
  }

  buttons.push([Markup.button.callback('↩️ Retour au Menu Jito', CALLBACKS.JITO_STAKING)]);
  return Markup.inlineKeyboard(buttons);
}

export function aaveMainKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('📥 Déposer USDC/USDT', CALLBACKS.AAVE_DEPOSIT_MENU)],
    [Markup.button.callback('📤 Retirer', CALLBACKS.AAVE_WITHDRAW_MENU)],
    [Markup.button.callback('📊 Mes Positions', CALLBACKS.STAKING_YIELD)],
    [Markup.button.callback('↩️ Retour', CALLBACKS.STAKING_MENU)],
  ]);
}

export function aaveChainKeyboard(action = 'deposit') {
  const buttons = getAaveChains().map((chain) => [
    Markup.button.callback(
      `${chain.icon} ${chain.displayName} → Aave V3`,
      dynamicCallback.aaveChain(action, chain.id)
    ),
  ]);
  buttons.push([Markup.button.callback('↩️ Retour', CALLBACKS.AAVE_MENU)]);
  return Markup.inlineKeyboard(buttons);
}

export function aaveTokenKeyboard(action, chainId) {
  const chain = getAaveChain(chainId);
  const buttons = Object.keys(chain?.tokens || {}).map((symbol) => [
    Markup.button.callback(symbol, dynamicCallback.aaveToken(action, chainId, symbol)),
  ]);
  buttons.push([Markup.button.callback('↩️ Retour', action === 'deposit' ? CALLBACKS.AAVE_DEPOSIT_MENU : CALLBACKS.AAVE_WITHDRAW_MENU)]);
  return Markup.inlineKeyboard(buttons);
}

export function aaveWalletKeyboard(action, chainId, tokenSymbol, wallets) {
  const buttons = wallets.map((wallet) => [
    Markup.button.callback(
      wallet.label || `${wallet.chain.toUpperCase()} ${wallet.address.slice(0, 8)}...`,
      dynamicCallback.aaveWallet(action, chainId, tokenSymbol, wallet.id)
    ),
  ]);
  buttons.push([Markup.button.callback('↩️ Retour', dynamicCallback.aaveChain(action, chainId))]);
  return Markup.inlineKeyboard(buttons);
}

export function stakingHubKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('🏆 Staking Optimizer', CALLBACKS.STAKING_OPTIMIZER)],
    [Markup.button.callback('💵 USDC/USDT → Aave V3', CALLBACKS.AAVE_MENU)],
    [Markup.button.callback('⚡ ETH Staking', CALLBACKS.ETH_STAKING_MENU)],
    [Markup.button.callback('🔄 Curve LP', CALLBACKS.CURVE_LP_MENU)],
    [Markup.button.callback('↩️ Retour', CALLBACKS.BACK_TO_MENU)],
  ]);
}

export function ethStakingKeyboard() {
  const buttons = getEthStakingProviders().map((provider) => [
    Markup.button.callback(
      `${provider.icon} ${provider.displayName} (${provider.receiptToken})`,
      dynamicCallback.ethStakeAction('menu', provider.id)
    ),
  ]);
  buttons.push([Markup.button.callback('↩️ Retour', CALLBACKS.STAKING_MENU)]);
  return Markup.inlineKeyboard(buttons);
}

export function ethStakingProtocolKeyboard(protocolId, canDeposit = true) {
  const buttons = [];
  const provider = getEthStakingProviders().find((item) => item.id === protocolId);
  const depositAllowed = canDeposit && provider?.directDepositEnabled !== false;
  if (depositAllowed) {
    buttons.push([Markup.button.callback('📥 Staker ETH', dynamicCallback.ethStakeAction('deposit', protocolId))]);
  }
  if (provider?.directWithdrawEnabled !== false) {
    buttons.push([Markup.button.callback('📤 Retirer / unwrap', dynamicCallback.ethStakeAction('withdraw', protocolId))]);
  }
  buttons.push([Markup.button.callback('↩️ Retour', CALLBACKS.ETH_STAKING_MENU)]);
  return Markup.inlineKeyboard(buttons);
}

export function ethStakingWalletKeyboard(action, protocolId, wallets) {
  const buttons = wallets.map((wallet) => [
    Markup.button.callback(
      wallet.label || `${wallet.address.slice(0, 8)}...`,
      dynamicCallback.ethStakeWallet(action, protocolId, wallet.id)
    ),
  ]);
  buttons.push([Markup.button.callback('↩️ Retour', dynamicCallback.ethStakeAction('menu', protocolId))]);
  return Markup.inlineKeyboard(buttons);
}

export function curveLpKeyboard() {
  const buttons = getCurveLpPools().map((pool) => [
    Markup.button.callback(`${pool.icon} ${pool.name}`, dynamicCallback.curvePool(pool.id)),
  ]);
  buttons.push([Markup.button.callback('↩️ Retour', CALLBACKS.STAKING_MENU)]);
  return Markup.inlineKeyboard(buttons);
}
