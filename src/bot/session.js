/**
 * Session manager for handling user state and temporary data
 * Sessions expire after a configurable timeout
 */
export class SessionManager {
  constructor(timeoutMinutes = 30) {
    this.sessions = new Map();
    this.timeoutMinutes = timeoutMinutes;
    this.MAX_SESSIONS = 500;
  }

  _getSession(chatId) {
    if (!this.sessions.has(chatId)) {
      this.sessions.set(chatId, {
        state: null,
        data: {},
        lastActivity: Date.now(),
      });
    }
    return this.sessions.get(chatId);
  }

  getState(chatId) {
    return this._getSession(chatId).state;
  }

  setState(chatId, state) {
    const session = this._getSession(chatId);
    session.state = state;
    session.lastActivity = Date.now();
  }

  getData(chatId) {
    return this._getSession(chatId).data;
  }

  setData(chatId, data) {
    const session = this._getSession(chatId);
    session.data = data;
    session.lastActivity = Date.now();
  }

  clearData(chatId) {
    const session = this._getSession(chatId);
    session.data = {};
    session.lastActivity = Date.now();
  }

  clearState(chatId) {
    const session = this._getSession(chatId);
    session.state = null;
    session.data = {};
    session.lastActivity = Date.now();
  }

  cleanup() {
    const now = Date.now();
    const expiry = this.timeoutMinutes * 60 * 1000;

    for (const [chatId, session] of this.sessions) {
      if (now - session.lastActivity > expiry) {
        this.sessions.delete(chatId);
      }
    }

    if (this.sessions.size > this.MAX_SESSIONS) {
      const sorted = [...this.sessions.entries()].sort(
        (a, b) => a[1].lastActivity - b[1].lastActivity
      );
      const toRemove = sorted.slice(0, this.sessions.size - this.MAX_SESSIONS);
      for (const [chatId] of toRemove) {
        this.sessions.delete(chatId);
      }
    }
  }
}
