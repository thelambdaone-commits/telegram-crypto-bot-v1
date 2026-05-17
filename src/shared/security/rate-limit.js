/**
 * Rate limiter and anti-spam protection
 * Blacklist is persisted via SecretVault to survive restarts.
 */
export class RateLimiter {
  constructor(limit = 30, windowMs = 60000, vault = null) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.requests = new Map();
    this.blacklist = new Set();
    this.warnings = new Map();
    this.vault = vault;
    this.vaultKey = '_rateLimiter';
    this._dirty = false;

    if (this.vault) {
      this._loadFromVault();
    }
  }

  _loadFromVault() {
    try {
      const saved = this.vault.get(this.vaultKey);
      if (saved) {
        const data = typeof saved === 'string' ? JSON.parse(saved) : saved;
        if (data.blacklist) {
          this.blacklist = new Set(data.blacklist);
        }
        if (data.warnings) {
          this.warnings = new Map(Object.entries(data.warnings));
        }
      }
    } catch (e) {
      // Ignore corrupted data
    }
  }

  async _saveToVault() {
    if (!this.vault) return;
    try {
      await this.vault.set(this.vaultKey, {
        blacklist: Array.from(this.blacklist),
        warnings: Object.fromEntries(this.warnings),
      });
      this._dirty = false;
    } catch (e) {
      // Ignore save failures
    }
  }

  _markDirty() {
    if (!this._dirty) {
      this._dirty = true;
      setTimeout(() => {
        this._saveToVault().catch(() => {});
      }, 100);
    }
  }

  /**
   * Check if chatId is allowed to make request
   */
  isAllowed(chatId) {
    if (this.blacklist.has(chatId)) {
      return { allowed: false, reason: 'blacklist' };
    }

    const now = Date.now();
    const userRequests = this.requests.get(chatId) || [];

    // Clean old requests
    const validRequests = userRequests.filter((time) => now - time < this.windowMs);

    if (validRequests.length >= this.limit) {
      // Increment warning counter
      const warnings = (this.warnings.get(chatId) || 0) + 1;
      this.warnings.set(chatId, warnings);

      // Auto-blacklist after 5 warnings
      if (warnings >= 5) {
        this.blacklist.add(chatId);
        this._markDirty();
        return { allowed: false, reason: 'blacklist_auto' };
      }

      this._markDirty();

      return {
        allowed: false,
        reason: 'rate_limit',
        remaining: this.windowMs - (now - validRequests[0]),
      };
    }

    // Add current request
    validRequests.push(now);
    this.requests.set(chatId, validRequests);

    return { allowed: true };
  }

  /**
   * Manually blacklist a chatId
   */
  addToBlacklist(chatId) {
    this.blacklist.add(chatId);
    this._markDirty();
  }

  /**
   * Remove from blacklist
   */
  removeFromBlacklist(chatId) {
    this.blacklist.delete(chatId);
    this.warnings.delete(chatId);
    this._markDirty();
  }

  /**
   * Get stats for admin
   */
  getStats() {
    return {
      activeUsers: this.requests.size,
      blacklistedUsers: this.blacklist.size,
      blacklist: Array.from(this.blacklist),
    };
  }

  /**
   * Cleanup old data periodically
   */
  cleanup() {
    const now = Date.now();
    for (const [chatId, requests] of this.requests) {
      const valid = requests.filter((time) => now - time < this.windowMs);
      if (valid.length === 0) {
        this.requests.delete(chatId);
        // Also cleanup warnings for users with no active requests
        this.warnings.delete(chatId);
      } else {
        this.requests.set(chatId, valid);
      }
    }

    // Secondary pass for orphan warnings
    for (const chatId of this.warnings.keys()) {
      if (!this.requests.has(chatId)) {
        this.warnings.delete(chatId);
      }
    }
  }

  /**
   * Force immediate persist to disk
   */
  async flush() {
    await this._saveToVault();
  }
}
