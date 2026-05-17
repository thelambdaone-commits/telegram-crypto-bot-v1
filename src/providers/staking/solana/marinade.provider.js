import { MarinadeService } from '../../../modules/staking/marinade.js';

export async function getMarinadeOpportunity() {
  const apy = await MarinadeService.getApy().catch(() => ({ success: false }));
  return {
    id: 'marinade',
    name: 'Marinade',
    token: 'mSOL',
    icon: '🥈',
    apy: apy.success ? Number(apy.apy) : 7.2,
    tvl: null,
    lockPeriod: 'Aucun lock pour sortie rapide',
    source: apy.success ? apy.source || 'marinade' : 'fallback',
    actionCallback: 'marinade_staking',
  };
}
