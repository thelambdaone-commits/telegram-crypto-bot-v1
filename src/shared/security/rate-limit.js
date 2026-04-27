/**
 * Rate limiter and anti-spam protection
 */
export class RateLimiter {
  constructor(limit = 30, windowMs = 60000) {
    this.limit = limit
    this.windowMs = windowMs
    this.requests = new Map()
    this.blacklist = new Set()
    this.warnings = new Map()
  }

  /**
   * Check if chatId is allowed to make request
   */
  isAllowed(chatId) {
    if (this.blacklist.has(chatId)) {
      return { allowed: false, reason: "blacklist" }
    }

    const now = Date.now()
    const userRequests = this.requests.get(chatId) || []

    // Clean old requests
    const validRequests = userRequests.filter((time) => now - time < this.windowMs)

    if (validRequests.length >= this.limit) {
      // Increment warning counter
      const warnings = (this.warnings.get(chatId) || 0) + 1
      this.warnings.set(chatId, warnings)

      // Auto-blacklist after 5 warnings
      if (warnings >= 5) {
        this.blacklist.add(chatId)
        return { allowed: false, reason: "blacklist_auto" }
      }

      return { allowed: false, reason: "rate_limit", remaining: this.windowMs - (now - validRequests[0]) }
    }

    // Add current request
    validRequests.push(now)
    this.requests.set(chatId, validRequests)

    return { allowed: true }
  }

  /**
   * Manually blacklist a chatId
   */
  addToBlacklist(chatId) {
    this.blacklist.add(chatId)
  }

  /**
   * Remove from blacklist
   */
  removeFromBlacklist(chatId) {
    this.blacklist.delete(chatId)
    this.warnings.delete(chatId)
  }

  /**
   * Get stats for admin
   */
  getStats() {
    return {
      activeUsers: this.requests.size,
      blacklistedUsers: this.blacklist.size,
      blacklist: Array.from(this.blacklist),
    }
  }

  /**
   * Cleanup old data periodically
   */
  cleanup() {
    const now = Date.now()
    for (const [chatId, requests] of this.requests) {
      const valid = requests.filter((time) => now - time < this.windowMs)
      if (valid.length === 0) {
        this.requests.delete(chatId)
      } else {
        this.requests.set(chatId, valid)
      }
    }
  }
}
