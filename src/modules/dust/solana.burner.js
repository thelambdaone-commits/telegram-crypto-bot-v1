export class SolanaBurner {
  // List of tokens that should NEVER be suggested for burning, regardless of amount
  static WHITELIST = [
    "J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn", // JitoSOL
    "mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So", // mSOL
    "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", // USDC
    "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB", // USDT
    "So11111111111111111111111111111111111111112", // Wrapped SOL
  ];

  static KNOWN_TOKENS = {
    "J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn": { symbol: "JitoSOL", name: "Jito Staked SOL" },
    "mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So": { symbol: "mSOL", name: "Marinade Staked SOL" },
    "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v": { symbol: "USDC", name: "USD Coin" },
  };

  /**
   * Analyze an array of tokens and detect those with zero or negligible value
   * that can be considered "burnable" dust.
   * @param {Array} tokens - List of tokens owned by the wallet
   * @returns {Array} - List of burnable tokens
   */
  static detectBurnableTokens(tokens) {
    if (!tokens || !Array.isArray(tokens)) return [];

    const burnable = [];

    for (const token of tokens) {
      // Never suggest burning whitelisted tokens
      if (this.WHITELIST.includes(token.mint)) continue;

      if (token.amount === 0) {
        burnable.push({
          ...token,
          reason: "Solde à zéro",
        });
      } else if (token.amount < 0.0001) {
        burnable.push({
          ...token,
          reason: "Dust négligeable (< 0.0001)",
        });
      }
    }

    return burnable;
  }
}
