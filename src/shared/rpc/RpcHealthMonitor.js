import { logger } from '../logger.js';

const DEFAULT_OPTIONS = {
  checkIntervalMs: 60000,
  maxSamples: 50,
  errorWeight: 3,
  latencyWeight: 1,
  healthyThreshold: 0.7,
  // consecutive failures before an endpoint is flagged unhealthy (and the WARN
  // fires once, on the transition)
  unhealthyThreshold: 5,
  // consecutive failures before an endpoint is put in temporary quarantine and
  // dropped from rotation, so a dead endpoint stops being hammered forever
  quarantineThreshold: 20,
  // how long a quarantined endpoint stays out of rotation before a probe re-arm
  quarantineCooldownMs: 300000,
  // injectable clock for deterministic tests
  now: () => Date.now(),
};

export class RpcHealthMonitor {
  constructor(options = {}) {
    this.opts = { ...DEFAULT_OPTIONS, ...options };
    this.endpoints = new Map();
    this._interval = null;
  }

  _now() {
    return this.opts.now();
  }

  register(url, metadata = {}) {
    if (this.endpoints.has(url)) return;
    this.endpoints.set(url, {
      url,
      ...metadata,
      samples: [],
      consecutiveFailures: 0,
      totalRequests: 0,
      totalErrors: 0,
      lastChecked: null,
      isHealthy: true,
      disabled: false,
      disabledUntil: null,
    });
  }

  recordSuccess(url, latencyMs) {
    const ep = this.endpoints.get(url);
    if (!ep) return;
    ep.samples.push({ success: true, latencyMs, time: this._now() });
    if (ep.samples.length > this.opts.maxSamples) ep.samples.shift();
    ep.consecutiveFailures = 0;
    ep.totalRequests++;
    ep.lastChecked = this._now();
    ep.isHealthy = true;
    ep.disabled = false;
    ep.disabledUntil = null;
  }

  recordError(url) {
    const ep = this.endpoints.get(url);
    if (!ep) return;
    ep.samples.push({ success: false, latencyMs: 0, time: this._now() });
    if (ep.samples.length > this.opts.maxSamples) ep.samples.shift();
    ep.consecutiveFailures++;
    ep.totalRequests++;
    ep.totalErrors++;
    ep.lastChecked = this._now();

    // Edge-triggered: log the WARN only on the healthy -> unhealthy transition,
    // not on every subsequent failure (a dead endpoint would otherwise spam the
    // log on every retry, e.g. consecutiveFailures climbing to 255+).
    if (ep.isHealthy && ep.consecutiveFailures >= this.opts.unhealthyThreshold) {
      ep.isHealthy = false;
      logger.warn('RPC endpoint marked unhealthy', { url, consecutiveFailures: ep.consecutiveFailures });
    }

    // Past a harder threshold, quarantine the endpoint: drop it from rotation
    // for a cooldown window so it stops being retried in a tight loop. It is
    // re-armed automatically once the cooldown expires (see getSortedEndpoints).
    if (!ep.disabled && ep.consecutiveFailures >= this.opts.quarantineThreshold) {
      ep.disabled = true;
      ep.disabledUntil = this._now() + this.opts.quarantineCooldownMs;
      logger.warn('RPC endpoint quarantined', {
        url,
        consecutiveFailures: ep.consecutiveFailures,
        cooldownMs: this.opts.quarantineCooldownMs,
      });
    }
  }

  // Re-arm any endpoint whose quarantine cooldown has elapsed, so it gets one
  // probe attempt back in rotation. Called lazily from getSortedEndpoints.
  _rearmExpired() {
    const now = this._now();
    for (const ep of this.endpoints.values()) {
      if (ep.disabled && ep.disabledUntil != null && now >= ep.disabledUntil) {
        ep.disabled = false;
        ep.disabledUntil = null;
        ep.consecutiveFailures = 0;
        ep.isHealthy = true;
      }
    }
  }

  getScore(url) {
    const ep = this.endpoints.get(url);
    if (!ep) return 0;
    if (ep.samples.length === 0) return 0.5;

    const recent = ep.samples.slice(-20);
    const successRate = recent.filter((s) => s.success).length / recent.length;
    const avgLatency = recent.filter((s) => s.success).reduce((sum, s) => sum + s.latencyMs, 0) /
      Math.max(1, recent.filter((s) => s.success).length);

    const latencyScore = Math.max(0, 1 - avgLatency / 5000);
    const errorScore = successRate;
    return errorScore * this.opts.errorWeight + latencyScore * this.opts.latencyWeight;
  }

  getSortedEndpoints() {
    this._rearmExpired();
    const all = Array.from(this.endpoints.values()).sort(
      (a, b) => this.getScore(b.url) - this.getScore(a.url)
    );
    const active = all.filter((ep) => !ep.disabled);
    // Safety net: never return an empty list. If every endpoint is quarantined,
    // fall back to the full set (best score first) so a request can still be
    // attempted rather than failing outright.
    return (active.length > 0 ? active : all).map((ep) => ep.url);
  }

  getStats() {
    return Array.from(this.endpoints.values()).map((ep) => ({
      url: ep.url,
      isHealthy: ep.isHealthy,
      disabled: ep.disabled,
      score: this.getScore(ep.url),
      totalRequests: ep.totalRequests,
      totalErrors: ep.totalErrors,
      consecutiveFailures: ep.consecutiveFailures,
      samples: ep.samples.length,
    }));
  }

  enable(url) {
    const ep = this.endpoints.get(url);
    if (ep) {
      ep.disabled = false;
      ep.disabledUntil = null;
      ep.isHealthy = true;
    }
  }

  disable(url) {
    const ep = this.endpoints.get(url);
    if (ep) ep.disabled = true;
  }

  reset(url) {
    const ep = this.endpoints.get(url);
    if (ep) {
      ep.samples = [];
      ep.consecutiveFailures = 0;
      ep.isHealthy = true;
      ep.disabled = false;
      ep.disabledUntil = null;
    }
  }

  startAutoCheck(pingFn) {
    this.stop();
    this._interval = setInterval(async () => {
      for (const [url, ep] of this.endpoints) {
        if (ep.disabled) continue;
        try {
          const start = Date.now();
          await pingFn(url);
          this.recordSuccess(url, Date.now() - start);
        } catch {
          this.recordError(url);
        }
      }
    }, this.opts.checkIntervalMs);
    this._interval.unref();
  }

  stop() {
    if (this._interval) {
      clearInterval(this._interval);
      this._interval = null;
    }
  }
}
