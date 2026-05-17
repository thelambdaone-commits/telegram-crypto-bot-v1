export class StakingProvider {
  constructor(id, config = {}) {
    this.id = id;
    this.config = config;
  }

  async quote() {
    throw new Error('quote() must be implemented');
  }

  async deposit() {
    throw new Error('deposit() must be implemented');
  }

  async withdraw() {
    throw new Error('withdraw() must be implemented');
  }

  async getPositions() {
    throw new Error('getPositions() must be implemented');
  }
}

export default StakingProvider;
