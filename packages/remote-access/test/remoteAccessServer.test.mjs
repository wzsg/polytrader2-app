import assert from 'node:assert/strict';
import test from 'node:test';
import { WebSocket } from 'ws';
import { RemoteAccessServer } from '../dist/index.js';

function connect(port) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`ws://127.0.0.1:${port}/remote-access`);
    socket.once('open', () => resolve(socket));
    socket.once('error', reject);
  });
}

function request(socket, payload) {
  return new Promise((resolve, reject) => {
    const handleMessage = (data) => {
      cleanup();
      resolve(JSON.parse(data.toString('utf8')));
    };
    const handleError = (error) => {
      cleanup();
      reject(error);
    };
    const cleanup = () => {
      socket.off('message', handleMessage);
      socket.off('error', handleError);
    };
    socket.once('message', handleMessage);
    socket.once('error', handleError);
    socket.send(JSON.stringify(payload));
  });
}

function close(socket) {
  return new Promise((resolve) => {
    if (socket.readyState === WebSocket.CLOSED) {
      resolve();
      return;
    }
    socket.once('close', resolve);
    socket.close();
  });
}

function createHandlers(counters) {
  return {
    async listWallets() {
      return [
        {
          id: 'wallet-1',
          name: 'Wallet 1',
          walletAddress: '0x1',
          depositWalletAddress: '0x2',
          isDefault: true,
          credentialsConfigured: true,
          initializationStatus: 'ready',
        },
      ];
    },
    async getWalletBalance(params) {
      return {
        walletId: params.walletId,
        walletAddress: '0x1',
        balance: '10',
        balanceUsd: '10',
        allowances: [],
        updatedAt: new Date(0).toISOString(),
      };
    },
    async listOrders() {
      return [];
    },
    async placeOrder(_params, context) {
      counters.place += 1;
      return { orderId: context.requestId, status: 'submitting' };
    },
    async cancelOrder() {
      counters.cancel += 1;
      return { canceled: true };
    },
  };
}

const authRequest = {
  id: 'auth-1',
  method: 'auth',
  params: { protocolVersion: 1, deviceId: 'phone-1', token: 'secret' },
};

const placeRequest = {
  id: 'place-1',
  method: 'order.place',
  params: {
    walletId: 'wallet-1',
    order: {
      assetId: 'asset-1',
      side: 'BUY',
      orderType: 'limit',
      price: 0.5,
      shares: 10,
    },
  },
};

test('authenticates, routes requests, and deduplicates retried writes', async () => {
  const counters = { place: 0, cancel: 0 };
  const server = new RemoteAccessServer({
    port: 0,
    authenticator: { authenticate: ({ token }) => token === 'secret' },
    handlers: createHandlers(counters),
    heartbeatIntervalMs: 60_000,
  });
  await server.start();
  const port = server.address?.port;
  assert.ok(port);

  const unauthorizedSocket = await connect(port);
  const unauthorized = await request(unauthorizedSocket, {
    id: 'wallets-0',
    method: 'wallet.list',
    params: {},
  });
  assert.deepEqual(unauthorized, {
    id: 'wallets-0',
    ok: false,
    error: { code: 'AUTH_REQUIRED', message: 'Authentication is required' },
  });
  await close(unauthorizedSocket);

  const first = await connect(port);
  assert.equal((await request(first, authRequest)).ok, true);
  const wallets = await request(first, { id: 'wallets-1', method: 'wallet.list', params: {} });
  assert.equal(wallets.ok, true);
  assert.equal(wallets.data[0].id, 'wallet-1');

  const placed = await request(first, placeRequest);
  assert.deepEqual(placed, {
    id: 'place-1',
    ok: true,
    data: { orderId: 'place-1', status: 'submitting' },
  });
  await close(first);

  const reconnected = await connect(port);
  assert.equal((await request(reconnected, { ...authRequest, id: 'auth-2' })).ok, true);
  assert.deepEqual(await request(reconnected, placeRequest), placed);
  assert.equal(counters.place, 1);

  const conflict = await request(reconnected, {
    id: placeRequest.id,
    method: 'order.cancel',
    params: { walletId: 'wallet-1', orderId: 'exchange-1' },
  });
  assert.equal(conflict.ok, false);
  assert.equal(conflict.error.code, 'REQUEST_ID_CONFLICT');

  await close(reconnected);
  await server.stop();
});

test('supports optional confirmation for write requests', async () => {
  const counters = { place: 0, cancel: 0 };
  const server = new RemoteAccessServer({
    port: 0,
    authenticator: { authenticate: () => true },
    handlers: createHandlers(counters),
    confirmationProvider: { confirm: () => false },
    requireConfirmationForWrites: true,
    heartbeatIntervalMs: 60_000,
  });
  await server.start();
  const port = server.address?.port;
  assert.ok(port);

  const socket = await connect(port);
  assert.equal((await request(socket, authRequest)).ok, true);
  const response = await request(socket, placeRequest);
  assert.equal(response.ok, false);
  assert.equal(response.error.code, 'CONFIRMATION_REJECTED');
  assert.equal(counters.place, 0);

  await close(socket);
  await server.stop();
});
