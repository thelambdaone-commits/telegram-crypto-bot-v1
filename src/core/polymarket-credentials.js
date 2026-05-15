import { decrypt, encrypt } from '../shared/encryption.js';
import { logger } from '../shared/logger.js';

/**
 * Polymarket Credentials Service
 * Encapsulates all logic related to Polymarket API keys and credentials
 */
export class PolymarketCredentialsService {
  constructor(storage) {
    this.storage = storage;
  }

  _normalizeCredentials(data) {
    data.pmCredentialsList = data.pmCredentialsList || [];

    if (data.pmCredentials && data.pmCredentialsList.length === 0) {
      const legacyId = `pm-${data.pmCredentials.address || 'legacy'}-${data.pmCredentials.connectedAt || Date.now()}`;
      data.pmCredentialsList.push({
        id: legacyId,
        encryptedPrivateKey: data.pmCredentials.encryptedPrivateKey,
        address: data.pmCredentials.address,
        apiKey: data.pmCredentials.apiKey,
        apiSecret: data.pmCredentials.apiSecret,
        apiPassphrase: data.pmCredentials.apiPassphrase,
        signatureTimestamp: data.pmCredentials.signatureTimestamp,
        connectedAt: data.pmCredentials.connectedAt,
        alertsEnabled: data.pmCredentials.alertsEnabled || false,
      });
      data.activePmCredentialId = data.activePmCredentialId || legacyId;
      delete data.pmCredentials;
    }

    return data.pmCredentialsList;
  }

  _formatCredentials(creds) {
    return {
      id: creds.id,
      walletId: creds.walletId || null,
      walletLabel: creds.walletLabel || null,
      chain: creds.chain || null,
      privateKey: decrypt(creds.encryptedPrivateKey, this.storage.masterKey),
      address: creds.address,
      apiKey: decrypt(creds.apiKey, this.storage.masterKey),
      apiSecret: decrypt(creds.apiSecret, this.storage.masterKey),
      apiPassphrase: decrypt(creds.apiPassphrase, this.storage.masterKey),
      signatureTimestamp: creds.signatureTimestamp,
      connectedAt: creds.connectedAt,
      alertsEnabled: creds.alertsEnabled || false,
    };
  }

  async save(
    chatId,
    privateKey,
    address,
    apiKey,
    apiSecret,
    apiPassphrase,
    signatureTimestamp,
    metadata = {}
  ) {
    const data = await this.storage.loadUserData(chatId, true);
    try {
      const credentialsList = this._normalizeCredentials(data);
      const normalizedAddress = address.toLowerCase();
      const existingIndex = credentialsList.findIndex(
        (creds) => creds.address?.toLowerCase() === normalizedAddress
      );
      const existing = existingIndex >= 0 ? credentialsList[existingIndex] : null;
      const credentialId =
        existing?.id || `pm-${metadata.walletId || normalizedAddress}-${Date.now()}`;
      
      const credentialData = {
        id: credentialId,
        walletId: metadata.walletId || existing?.walletId || null,
        walletLabel: metadata.walletLabel || existing?.walletLabel || null,
        chain: metadata.chain || existing?.chain || null,
        encryptedPrivateKey: encrypt(privateKey, this.storage.masterKey),
        address,
        apiKey: encrypt(apiKey, this.storage.masterKey),
        apiSecret: encrypt(apiSecret, this.storage.masterKey),
        apiPassphrase: encrypt(apiPassphrase, this.storage.masterKey),
        signatureTimestamp,
        connectedAt: new Date().toISOString(),
        alertsEnabled: false,
      };

      if (existingIndex >= 0) {
        credentialsList[existingIndex] = credentialData;
      } else {
        credentialsList.push(credentialData);
      }

      data.activePmCredentialId = credentialId;
      await this.storage.saveUserData(chatId, data, true);
    } catch (error) {
      this.storage._releaseLock(chatId);
      throw error;
    }
  }

  async getActive(chatId) {
    const data = await this.storage.loadUserData(chatId);
    const credentialsList = this._normalizeCredentials(data);
    if (credentialsList.length === 0 || !data.activePmCredentialId) return null;
    const active = credentialsList.find((creds) => creds.id === data.activePmCredentialId);
    if (!active) return null;
    try {
      return this._formatCredentials(active);
    } catch (error) {
      logger.error('Polymarket credentials corrupted', { chatId, error: error.message });
      return null;
    }
  }

  async list(chatId) {
    const data = await this.storage.loadUserData(chatId);
    const credentialsList = this._normalizeCredentials(data);

    return credentialsList.map((creds) => ({
      id: creds.id,
      walletId: creds.walletId || null,
      walletLabel: creds.walletLabel || null,
      chain: creds.chain || null,
      address: creds.address,
      connectedAt: creds.connectedAt,
      active: creds.id === data.activePmCredentialId,
      alertsEnabled: creds.alertsEnabled || false,
    }));
  }

  async getById(chatId, credentialId) {
    const data = await this.storage.loadUserData(chatId);
    const credentialsList = this._normalizeCredentials(data);
    const creds = credentialsList.find((item) => item.id === credentialId);
    if (!creds) return null;

    try {
      return this._formatCredentials(creds);
    } catch (error) {
      logger.error('Polymarket credentials corrupted', { chatId, credentialId, error: error.message });
      return null;
    }
  }

  async setActive(chatId, credentialId) {
    const data = await this.storage.loadUserData(chatId, true);
    try {
      const credentialsList = this._normalizeCredentials(data);
      const exists = credentialsList.some((creds) => creds.id === credentialId);
      if (!exists) {
        throw new Error('Credentials Polymarket introuvables');
      }

      data.activePmCredentialId = credentialId;
      await this.storage.saveUserData(chatId, data, true);
    } catch (error) {
      this.storage._releaseLock(chatId);
      throw error;
    }
  }

  async delete(chatId) {
    const data = await this.storage.loadUserData(chatId, true);
    try {
      this._normalizeCredentials(data);
      data.activePmCredentialId = null;
      await this.storage.saveUserData(chatId, data, true);
    } catch (error) {
      this.storage._releaseLock(chatId);
      throw error;
    }
  }

  async exists(chatId) {
    const creds = await this.getActive(chatId);
    return !!creds;
  }
}
