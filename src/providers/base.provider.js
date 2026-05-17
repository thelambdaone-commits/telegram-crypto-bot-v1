/**
 * Base Provider - Abstract class for all blockchain providers
 */
export class BaseProvider {
  constructor(name, symbol) {
    this.name = name;
    this.symbol = symbol;
  }

  /**
   * Create a new wallet
   * @returns {Promise<object>} { address, privateKey, mnemonic }
   */
  async createWallet() {
    throw new Error("method 'createWallet()' must be implemented");
  }

  /**
   * Import wallet from private key
   * @param {string} privateKey
   */
  async importFromKey(_privateKey) {
    throw new Error("method 'importFromKey()' must be implemented");
  }

  /**
   * Import wallet from seed phrase
   * @param {string} seedPhrase
   */
  async importFromSeed(_seedPhrase) {
    throw new Error("method 'importFromSeed()' must be implemented");
  }

  /**
   * Get balance for an address
   * @param {string} address
   * @param {string} tokenSymbol - Optional
   */
  async getBalance(_address, _tokenSymbol = null) {
    throw new Error("method 'getBalance()' must be implemented");
  }

  /**
   * Estimate fees for a transaction
   */
  async estimateFees(_fromAddress, _toAddress, _amount, _tokenSymbol = null) {
    throw new Error("method 'estimateFees()' must be implemented");
  }

  /**
   * Send a transaction
   */
  async sendTransaction(_privateKey, _toAddress, _amount, _feeLevel, _tokenSymbol = null) {
    throw new Error("method 'sendTransaction()' must be implemented");
  }

  /**
   * Get transaction history for an address
   */
  async getTransactionHistory(_address, _limit = 5) {
    throw new Error("method 'getTransactionHistory()' must be implemented");
  }

  /**
   * Validate an address for this chain
   */
  validateAddress(_address) {
    throw new Error("method 'validateAddress()' must be implemented");
  }
}

export default BaseProvider;
