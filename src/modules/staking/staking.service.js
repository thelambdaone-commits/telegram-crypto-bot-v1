const KAMINO_API = "https://api.kamino.finance";
const KAMINO_MAIN_MARKET = "7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF";

const AAVE_TOKENS = {
  arbitrum: {
    USDC: {
      symbol: "USDC",
      address: "0xaf88d065e77c8cc2239327c5edb3a432268e5831",
      aToken: "0x724dc807b04555b71ed48a6896b6f41593b8c637",
      decimals: 6,
      protocol: "aave-v3",
    },
    USDT: {
      symbol: "USDT",
      address: "0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9",
      aToken: "0xfb00ac187a8eb5bfa0bd74c942cdb1f3844b4b40",
      decimals: 6,
      protocol: "aave-v3",
    },
  },
};

const JUPITER_TOKENS = {
  USDC: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  USDT: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
};

const ARB_RPC = "https://arb1.arbitrum.io/rpc";
const SOL_RPC = "https://mainnet.helius-rpc.com/?api-key=1d8740dc-e5f4-421c-b823-e1bad1889eff";

const PROTOCOL_INFO = {
  "aave-v3": {
    name: "Aave V3",
    chain: "Arbitrum",
    networkFeeDeposit: 0.02,
    networkFeeWithdraw: 0.02,
    slippage: 0,
    protocolFee: 0,
    url: "https://app.aave.com",
  },
  "kamino": {
    name: "Kamino",
    chain: "Solana",
    networkFeeDeposit: 0.01,
    networkFeeWithdraw: 0.01,
    slippage: 0,
    protocolFee: 0,
    url: "https://app.kamino.finance/lend",
  },
  "jupiter": {
    name: "Jupiter Lend",
    chain: "Solana",
    networkFeeDeposit: 0.01,
    networkFeeWithdraw: 0.01,
    slippage: 0.001,
    protocolFee: 0,
    url: "https://jup.ag/lend",
  },
};

let apyCache = {
  aave: null,
  kamino: null,
  jupiter: null,
  lastUpdate: 0,
};
const CACHE_DURATION = 5 * 60 * 1000;

export class StakingService {
  static async getAaveApy() {
    if (apyCache.aave && Date.now() - apyCache.lastUpdate < CACHE_DURATION) {
      return apyCache.aave;
    }

    try {
      const response = await fetch("https://api.llama.fi/pools/aave-v3", {
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) throw new Error("API error");

      const data = await response.json();

      const arbPools = data.filter(
        (p) =>
          p.chain === "Arbitrum" &&
          (p.symbol === "USDC" || p.symbol === "USDT")
      );

      const result = {};
      for (const pool of arbPools) {
        result[pool.symbol] = {
          apy: pool.apy ? (pool.apy * 100).toFixed(2) : "1.65",
          apyBase: pool.apyBase ? (pool.apyBase * 100).toFixed(2) : "1.65",
          tvlUsd: pool.tvlUsd || 0,
          symbol: pool.symbol,
        };
      }

      if (!result.USDC) result.USDC = { apy: "1.65", symbol: "USDC" };
      if (!result.USDT) result.USDT = { apy: "2.13", symbol: "USDT" };

      apyCache.aave = result;
      apyCache.lastUpdate = Date.now();
      return result;
    } catch (error) {
      return {
        USDC: { apy: "1.65", symbol: "USDC" },
        USDT: { apy: "2.13", symbol: "USDT" },
      };
    }
  }

  static async getKaminoApy() {
    if (apyCache.kamino && Date.now() - apyCache.lastUpdate < CACHE_DURATION) {
      return apyCache.kamino;
    }

    try {
      const response = await fetch(
        `${KAMINO_API}/kamino-market/${KAMINO_MAIN_MARKET}/reserves/metrics`,
        { signal: AbortSignal.timeout(5000) }
      );

      if (!response.ok) throw new Error("API error");

      const data = await response.json();

      const usdcReserve = data.find(
        (r) => r.mint === JUPITER_TOKENS.USDC
      );

      if (usdcReserve && usdcReserve.supplyApy) {
        const result = {
          USDC: {
            apy: (parseFloat(usdcReserve.supplyApy) * 100).toFixed(2),
            tvlUsd: parseFloat(usdcReserve.totalSupply) / 1e6,
            symbol: "USDC",
          },
        };
        apyCache.kamino = result;
        apyCache.lastUpdate = Date.now();
        return result;
      }
    } catch (error) {}

    const result = { USDC: { apy: "3.80", symbol: "USDC" } };
    apyCache.kamino = result;
    apyCache.lastUpdate = Date.now();
    return result;
  }

  static async getJupiterApy() {
    if (apyCache.jupiter && Date.now() - apyCache.lastUpdate < CACHE_DURATION) {
      return apyCache.jupiter;
    }

    const result = {
      USDC: { apy: "5.20", symbol: "USDC" },
      USDT: { apy: "4.80", symbol: "USDT" },
    };
    apyCache.jupiter = result;
    apyCache.lastUpdate = Date.now();
    return result;
  }

  static async getAllApy() {
    const [aave, kamino, jupiter] = await Promise.all([
      this.getAaveApy(),
      this.getKaminoApy(),
      this.getJupiterApy(),
    ]);

    return {
      aave: { ...PROTOCOL_INFO["aave-v3"], tokens: aave },
      kamino: { ...PROTOCOL_INFO.kamino, tokens: kamino },
      jupiter: { ...PROTOCOL_INFO.jupiter, tokens: jupiter },
    };
  }

  static calculateYield(amount, apy, months) {
    const numAmount = parseFloat(amount);
    const numApy = parseFloat(apy);
    if (isNaN(numAmount) || isNaN(numApy)) return 0;
    return ((numAmount * numApy) / 100 / 12) * months;
  }

  static calculateProfit({ amount, apy, months, protocol }) {
    const numAmount = parseFloat(amount);
    const numApy = parseFloat(apy);

    if (isNaN(numAmount) || isNaN(numApy)) {
      return {
        grossYield: 0,
        totalFees: 0,
        netProfit: 0,
        breakdown: {
          depositFee: 0,
          withdrawFee: 0,
          slippageCost: 0,
          slippagePercent: 0,
        },
        roi: 0,
      };
    }

    const protocolInfo = PROTOCOL_INFO[protocol] || PROTOCOL_INFO["aave-v3"];

    const grossYield = ((numAmount * numApy) / 100 / 12) * months;

    const depositFee = protocolInfo.networkFeeDeposit;
    const withdrawFee = protocolInfo.networkFeeWithdraw;
    const slippagePercent = protocolInfo.slippage;
    const slippageCost = numAmount * slippagePercent;
    const totalFees = depositFee + withdrawFee + slippageCost;

    const netProfit = grossYield - totalFees;
    const roi = months > 0 ? (netProfit / numAmount) * 100 : 0;

    return {
      grossYield,
      totalFees,
      netProfit,
      breakdown: {
        depositFee,
        withdrawFee,
        slippageCost,
        slippagePercent: slippagePercent * 100,
      },
      roi: roi.toFixed(2),
    };
  }

  static formatCurrency(value, currency = "$") {
    return `${currency}${value.toLocaleString("fr-FR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }

  static async getUserAavePosition(address, chain = "arbitrum") {
    try {
      const ethers = await import("ethers");
      const provider = new ethers.JsonRpcProvider(ARB_RPC);

      const tokens = AAVE_TOKENS[chain] || {};
      const positions = {};

      for (const [symbol, token] of Object.entries(tokens)) {
        try {
          const aTokenContract = new ethers.Contract(
            token.aToken,
            ["function balanceOf(address) view returns (uint256)"],
            provider
          );

          const balance = await aTokenContract.balanceOf(address);
          const balanceNormalized = Number(balance) / Math.pow(10, token.decimals);

          if (balanceNormalized > 0.001) {
            positions[symbol] = {
              amount: balanceNormalized.toFixed(2),
              aTokenBalance: balance.toString(),
              symbol,
              decimals: token.decimals,
              protocol: "aave-v3",
            };
          }
        } catch (e) {}
      }

      return positions;
    } catch (error) {
      return {};
    }
  }

  static async getUserKaminoPosition(address) {
    try {
      const { Connection, PublicKey } = await import("@solana/web3.js");
      const connection = new Connection(SOL_RPC, { commitment: "confirmed" });

      const userPubkey = new PublicKey(address);

      const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
        userPubkey,
        { programId: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA") }
      );

      const kTokens = [];
      for (const account of tokenAccounts.value) {
        const info = account.account.data.parsed.info;
        if (info.tokenAmount.uiAmount > 0.001) {
          let symbol = info.mint === JUPITER_TOKENS.USDC ? "KUSDC" : info.mint.slice(0, 6);
          kTokens.push({
            mint: info.mint,
            amount: info.tokenAmount.uiAmount,
            symbol,
            source: "kamino",
            protocol: "kamino",
          });
        }
      }

      return { tokens: kTokens };
    } catch (error) {
      return { tokens: [] };
    }
  }

  static async getUserJupiterPosition(address) {
    try {
      const { Connection, PublicKey } = await import("@solana/web3.js");
      const connection = new Connection(SOL_RPC, { commitment: "confirmed" });
      const userPubkey = new PublicKey(address);

      const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
        userPubkey,
        { programId: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA") }
      );

      const jTokens = [];
      for (const account of tokenAccounts.value) {
        const info = account.account.data.parsed.info;
        if (info.tokenAmount.uiAmount > 0.001) {
          let symbol = info.mint;
          if (info.mint === JUPITER_TOKENS.USDC) symbol = "jlUSDC";
          else if (info.mint === JUPITER_TOKENS.USDT) symbol = "jlUSDT";

          jTokens.push({
            mint: info.mint,
            amount: info.tokenAmount.uiAmount,
            symbol,
            source: "jupiter",
            protocol: "jupiter",
          });
        }
      }

      return { tokens: jTokens };
    } catch (error) {
      return { tokens: [] };
    }
  }

  static formatApy(apy) {
    const num = parseFloat(apy);
    if (isNaN(num)) return "N/A";
    return num.toFixed(2) + "%";
  }

  static calculateMonthlyYield(amount, apy) {
    return this.calculateYield(amount, apy, 1);
  }

  static getDepositUrl(protocol, symbol) {
    return PROTOCOL_INFO[protocol]?.url || "https://app.aave.com";
  }

  static getProtocols() {
    return PROTOCOL_INFO;
  }
}

export default StakingService;
