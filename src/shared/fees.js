/**
 * Network fee data service. Lives in the shared layer (alongside price.js /
 * chart.js) so the Telegram handler stays presentation-only and doesn't talk to
 * RPCs/APIs directly. Each function returns raw fee data + a severity level; the
 * caller formats it for display.
 */
import { ethers } from 'ethers';
import { config } from '../core/config.js';

export const SOL_TYPICAL_CU = 200000; // compute-unit budget of a common tx
export const SOL_BASE_LAMPORTS = 5000; // base fee per signature

export async function getEthFees() {
  const ethProvider = new ethers.JsonRpcProvider(config.rpc?.eth || 'https://eth.llamarpc.com');
  const [feeData, block] = await Promise.all([
    ethProvider.getFeeData(),
    ethProvider.getBlock('latest').catch(() => null),
  ]);
  const gasPriceWei = feeData.gasPrice ?? 0n;
  const toGwei = (wei) => (wei ? Number(wei) / 1e9 : 0);
  const gasPrice = toGwei(gasPriceWei);
  const level = gasPrice > 80 ? '🔴 Élevé' : gasPrice > 30 ? '🟡 Moyen' : '🟢 Bas';
  // ETH cost of `units` of gas at the current gas price, in ether.
  const cost = (units) => Number(gasPriceWei * BigInt(units)) / 1e18;
  return {
    level,
    gasPrice,
    baseFee: toGwei(block?.baseFeePerGas),
    priorityFee: toGwei(feeData.maxPriorityFeePerGas),
    maxFee: toGwei(feeData.maxFeePerGas),
    cost,
  };
}

export async function getBtcFees() {
  const base = config.rpc?.btcApi || 'https://mempool.space/api';
  const btcResponse = await fetch(`${base}/v1/fees/recommended`);
  const fees = await btcResponse.json();
  const level = fees.fastestFee > 100 ? '🔴 Élevé' : fees.fastestFee > 50 ? '🟡 Moyen' : '🟢 Bas';
  return { ...fees, level };
}

export async function getSolFees() {
  const rpc = config.rpc?.sol || 'https://solana-rpc.publicnode.com';
  const solResponse = await fetch(rpc, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'getRecentPrioritizationFees',
      params: [],
    }),
  });
  const solData = await solResponse.json();
  let priorityFee = 5000;
  if (solData.result?.length > 0) {
    const fees = solData.result.map((f) => f.prioritizationFee).filter((f) => f > 0);
    priorityFee = fees.length > 0 ? Math.round(fees.reduce((a, b) => a + b, 0) / fees.length) : 5000;
  }
  const level = priorityFee > 50000 ? '🔴 Élevé' : priorityFee > 10000 ? '🟡 Moyen' : '🟢 Bas';
  // Total lamports for a typical tx = base fee + priority over the CU budget.
  const totalLamports = SOL_BASE_LAMPORTS + (priorityFee * SOL_TYPICAL_CU) / 1e6;
  return { priorityFee, level, totalLamports, totalSol: totalLamports / 1e9 };
}
