import { getClobClient } from './client.js';

export async function getMarkets(chatId, filter = 'open') {
  const client = getClobClient(chatId);
  if (!client) throw new Error('Client non initialise');
  try {
    return await client.getMarkets(filter);
  } catch (err) {
    throw new Error(`Marches inaccessible: ${err.message}`);
  }
}

export async function getMarket(chatId, conditionId) {
  const client = getClobClient(chatId);
  if (!client) throw new Error('Client non initialise');
  try { return await client.getMarket(conditionId); } catch { return null; }
}

export async function getOrderBook(chatId, conditionId) {
  const client = getClobClient(chatId);
  if (!client) throw new Error('Client non initialise');
  try { return await client.getOrderBook(conditionId); } catch { return null; }
}

export async function getPositions(chatId) {
  const client = getClobClient(chatId);
  if (!client) throw new Error('Client non initialise');
  try { return await client.getPositions(); } catch { return []; }
}

export async function getOrders(chatId) {
  const client = getClobClient(chatId);
  if (!client) throw new Error('Client non initialise');
  try { return await client.getOpenOrders(); } catch { return []; }
}

export async function placeOrder(chatId, params) {
  const client = getClobClient(chatId);
  if (!client) throw new Error('Client non initialise');
  try {
    return await client.createMarketOrder(params.conditionId, params.size, params.side, params.price);
  } catch (err) {
    throw new Error(`Ordre rate: ${err.message}`);
  }
}

export async function cancelOrder(chatId, orderId) {
  const client = getClobClient(chatId);
  if (!client) throw new Error('Client non initialise');
  try { return await client.cancelOrder(orderId); } catch { return null; }
}

export async function cancelAllOrders(chatId) {
  const client = getClobClient(chatId);
  if (!client) throw new Error('Client non initialise');
  try { return await client.cancelAllOrders(); } catch { return null; }
}

export async function getMyTrades(chatId, address = null) {
  const client = getClobClient(chatId);
  if (!client) throw new Error('Client non initialise');
  try {
    const params = address ? { maker_address: address } : undefined;
    const result = await client.getTradesPaginated(params);
    return result.trades || [];
  } catch (err) {
    throw new Error(`Historique inaccessible: ${err.message}`);
  }
}

export async function getOrderHistory(chatId) {
  const client = getClobClient(chatId);
  if (!client) throw new Error('Client non initialise');
  try { return await client.getOrderHistory(); } catch { return []; }
}

export async function getMarketChartData(chatId, conditionId, bucket) {
  const client = getClobClient(chatId);
  if (!client) throw new Error('Client non initialise');
  try { return await client.getMarketChartData(conditionId, bucket); } catch { return null; }
}
