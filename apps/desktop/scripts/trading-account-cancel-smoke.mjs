import assert from 'node:assert/strict';
import { TradingAccountOrderServiceImpl } from '@polytrader/trading-account/order';

function createHarness(sessionOverrides = {}, repositoryOverrides = {}) {
  const calls = {
    activeUpdates: [],
    batchUpdates: [],
    events: [],
    scheduledWalletIds: [],
    singleUpdates: [],
  };
  const success = { canceled: [], notCanceled: {} };
  const session = {
    cancelAllOrders: async () => success,
    cancelOrder: async () => success,
    cancelOrders: async () => success,
    placeOrder: async () => ({}),
    ...sessionOverrides,
  };
  const repository = {
    updateAccountOrderByExchangeOrderId: async (input) => calls.singleUpdates.push(input),
    updateWalletOrdersByExchangeOrderIds: async (walletId, exchangeOrderIds, input) => {
      calls.batchUpdates.push({ walletId, exchangeOrderIds, input });
    },
    updateActiveWalletOrdersByAccount: async (walletId, input) => {
      calls.activeUpdates.push({ walletId, input });
    },
    ...repositoryOverrides,
  };
  const service = new TradingAccountOrderServiceImpl({
    accountDataRepository: repository,
    apiClient: {
      getPolymarketAccount: () => session,
    },
    credentialProvider: {
      getCredential: async () => ({
        apiKey: 'api-key',
        depositWalletAddress: '0xwallet',
        passphrase: 'passphrase',
        privateKey: 'private-key',
        secret: 'secret',
      }),
    },
    marketResolver: {
      getMarketByAssetId: async () => null,
    },
    strategyRunRepository: {
      insertOrder: async () => undefined,
    },
    syncScheduler: {
      scheduleAccountSync: (walletId) => calls.scheduledWalletIds.push(walletId),
    },
  });
  service.on('order-trading-event', (event) => calls.events.push(event));
  return { calls, service };
}

{
  const { calls, service } = createHarness({
    cancelOrder: async () => ({
      canceled: [],
      notCanceled: { 'order-a': 'order already matched' },
    }),
  });
  const result = await service.cancelOrder({
    exchangeOrderId: 'order-a',
    walletId: 'wallet-a',
  });
  assert.deepEqual(result.canceled, []);
  assert.equal(calls.singleUpdates.length, 0);
  assert.equal(calls.events.at(-1)?.reason, 'cancel-failed');
  assert.deepEqual(calls.scheduledWalletIds, ['wallet-a']);
}

{
  const { calls, service } = createHarness({
    cancelOrders: async () => ({
      canceled: ['order-a'],
      notCanceled: { 'order-b': 'order already matched' },
    }),
  });
  const result = await service.cancelOrders({
    exchangeOrderIds: ['order-a', 'order-b'],
    walletId: 'wallet-a',
  });
  assert.deepEqual(result.canceled, ['order-a']);
  assert.deepEqual(calls.batchUpdates[0].exchangeOrderIds, ['order-a']);
  assert.equal(calls.batchUpdates[0].input.status, 'canceled');
  assert.equal(calls.events.at(-1)?.reason, 'cancel-orders-partial');
}

{
  const { calls, service } = createHarness({
    cancelAllOrders: async () => ({
      canceled: ['order-a'],
      notCanceled: { 'order-b': 'order already matched' },
    }),
  });
  await service.cancelAllOrders({ walletId: 'wallet-a' });
  assert.deepEqual(calls.batchUpdates[0].exchangeOrderIds, ['order-a']);
  assert.equal(calls.activeUpdates.length, 0);
  assert.equal(calls.events.at(-1)?.reason, 'cancel-all-partial');
}

{
  const apiError = new Error('request timed out');
  const { calls, service } = createHarness({
    cancelOrder: async () => {
      throw apiError;
    },
  });
  await assert.rejects(
    service.cancelOrder({ exchangeOrderId: 'order-a', walletId: 'wallet-a' }),
    apiError,
  );
  assert.equal(calls.singleUpdates.length, 0);
  assert.deepEqual(calls.scheduledWalletIds, ['wallet-a']);
}

{
  const writeError = new Error('database write failed');
  const attemptedUpdates = [];
  const { calls, service } = createHarness(
    {
      cancelOrder: async () => ({ canceled: ['order-a'], notCanceled: {} }),
    },
    {
      updateAccountOrderByExchangeOrderId: async (input) => {
        attemptedUpdates.push(input);
        throw writeError;
      },
    },
  );
  await assert.rejects(
    service.cancelOrder({ exchangeOrderId: 'order-a', walletId: 'wallet-a' }),
    writeError,
  );
  assert.equal(attemptedUpdates.length, 1);
  assert.equal(attemptedUpdates[0].status, 'canceled');
  assert.equal(calls.singleUpdates.length, 0);
  assert.deepEqual(calls.scheduledWalletIds, ['wallet-a']);
}

{
  const { calls, service } = createHarness({
    cancelOrders: async () => ({
      canceled: ['unexpected-order'],
      notCanceled: { 'order-b': 'not canceled' },
    }),
  });
  await assert.rejects(
    service.cancelOrders({
      exchangeOrderIds: ['order-a', 'order-b'],
      walletId: 'wallet-a',
    }),
    /unexpected orders/,
  );
  assert.equal(calls.batchUpdates.length, 0);
}

console.log('Trading account cancellation smoke test passed');
