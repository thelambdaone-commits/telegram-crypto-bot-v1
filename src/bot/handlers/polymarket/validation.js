import { getOrBuildClobClient } from '../../../clob/client.js';

export async function initClient(chatId, storage) {
  try {
    const { client, creds } = await getOrBuildClobClient(chatId, storage);
    if (!client || !creds?.privateKey) {
      return { error: 'wallet' };
    }
    return { client, address: creds.address, connected: true };
  } catch (err) {
    return { error: err.message };
  }
}
