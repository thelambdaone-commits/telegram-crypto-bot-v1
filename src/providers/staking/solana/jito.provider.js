import { JitoService } from '../../../modules/staking/jito.js';

export async function getJitoOpportunity() {
  const apy = await JitoService.getApy().catch(() => ({ success: false }));
  return {
    id: 'jito',
    name: 'Jito',
    token: 'JitoSOL',
    icon: '🥇',
    apy: apy.success ? Number(apy.apy) : 7,
    tvl: null,
    lockPeriod: 'Aucun lock pour sortie rapide',
    source: apy.success ? apy.source || 'jito' : 'fallback',
    actionCallback: 'jito_staking',
  };
}
