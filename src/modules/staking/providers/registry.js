import { aaveProvider } from './aave.provider.js';
import { ethLstProvider } from './eth-lst.provider.js';

const providers = new Map([
  [aaveProvider.id, aaveProvider],
  [ethLstProvider.id, ethLstProvider],
]);

export function getStakingProvider(id) {
  return providers.get(id) || null;
}

export function getStakingProviders() {
  return [...providers.values()];
}

export { aaveProvider, ethLstProvider };
