export class DustService {
  static DUST_THRESHOLD_USD = 5;

  static classifyEth(balanceEth, gasCostEth, priceEth) {
    const valueUsd = balanceEth * priceEth;
    const transferCostUsd = gasCostEth * priceEth;
    
    return {
      isDust: valueUsd < transferCostUsd,
      valueUsd,
      transferCostUsd,
      ratio: transferCostUsd > 0 ? valueUsd / transferCostUsd : 0,
      balanceEth,
      gasCostEth,
      priceEth,
    };
  }

  static classifyBtcUtxo(utxoValueSats, feeRateSatVb, txVbytes = 140) {
    const spendCostSats = feeRateSatVb * txVbytes;
    const utxoValueBtc = utxoValueSats / 100_000_000;
    
    return {
      isDust: utxoValueSats <= spendCostSats,
      utxoValueSats,
      spendCostSats,
      utxoValueBtc,
      ratio: spendCostSats > 0 ? utxoValueSats / spendCostSats : 0,
    };
  }

  static async analyzeWalletEth(address, btcChain, gasPriceGwei = 30) {
    const gasUnits = 21000;
    const gasCostEth = (gasPriceGwei * gasUnits) / 1_000_000_000;
    
    return {
      address,
      gasCostEth,
      gasUnits,
      gasPriceGwei,
    };
  }

  static summarizeWallet(wallet, chain, dustItems, totalValueUsd) {
    return {
      label: wallet.label,
      chain,
      address: wallet.address,
      dustCount: dustItems.length,
      totalDustValueUsd: dustItems.reduce((s, i) => s + (i.valueUsd || i.valueBtcUsd || 0), 0),
      totalValueUsd,
      recommendation: this.getRecommendation(dustItems),
      dustItems,
    };
  }

  static getRecommendation(dustItems) {
    if (!dustItems || dustItems.length === 0) {
      return { action: 'ok', text: '✅ Aucun dust détecté' };
    }
    
    const totalValue = dustItems.reduce((s, i) => s + (i.valueUsd || i.valueBtcUsd || 0), 0);
    
    if (totalValue < 1) {
      return { action: 'wait', text: '💤 Valeur trop faible - Patiente' };
    }
    if (totalValue < 5) {
      return { action: 'monitor', text: '👀 Surveiller - proche du seuil' };
    }
    return { action: 'consolidate', text: '💡 Consolidation possible' };
  }

  static async getDustSummary(wallets, chainAdapters, prices) {
    const results = { eth: [], btc: [], sol: [] };
    
    for (const wallet of wallets) {
      if (wallet.chain === 'eth') {
        const analysis = await this.analyzeWalletEth(wallet.address, null, 30);
        results.eth.push({
          wallet,
          analysis,
          priceEth: prices.eth,
        });
      }
      
      if (wallet.chain === 'btc') {
        try {
          const utxos = await chainAdapters.btc.getUtxos(wallet.address);
          const feeEstimates = await chainAdapters.btc.estimateFees(wallet.address, wallet.address, 0);
          const avgFeeRate = feeEstimates.average.satPerVbyte;
          
          const classifiedUtxos = utxos.map(utxo => {
            const classified = this.classifyBtcUtxo(utxo.value, avgFeeRate);
            const valueBtcUsd = classified.utxoValueBtc * prices.btc;
            return { ...utxo, ...classified, valueBtcUsd };
          });
          
          const dustUtxos = classifiedUtxos.filter(u => u.isDust);
          
          results.btc.push({
            wallet,
            utxos: classifiedUtxos,
            dustUtxos,
            totalDustSats: dustUtxos.reduce((s, u) => s + u.utxoValueSats, 0),
            totalDustBtc: dustUtxos.reduce((s, u) => s + u.utxoValueBtc, 0),
            totalDustUsd: dustUtxos.reduce((s, u) => s + u.valueBtcUsd, 0),
            feeRateUsed: avgFeeRate,
            recommendation: this.getRecommendation(dustUtxos),
          });
        } catch (error) {
          results.btc.push({
            wallet,
            error: error.message,
            utxos: [],
            dustUtxos: [],
          });
        }
      }
    }
    
    return results;
  }
}
