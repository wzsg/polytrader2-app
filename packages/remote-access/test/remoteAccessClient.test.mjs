import assert from 'node:assert/strict';
import test from 'node:test';
import { WebSocketServer } from 'ws';
import { RemoteAccessClient } from '../dist/index.js';

function waitForConnection(server) {
  return new Promise((resolve) => server.once('connection', resolve));
}

function receive(socket) {
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
  });
}

async function authenticate(socket) {
  const request = await receive(socket);
  assert.equal(request.method, 'auth');
  assert.deepEqual(request.params, {
    protocolVersion: 1,
    deviceId: 'desktop-1',
    token: 'secret',
  });
  socket.send(
    JSON.stringify({
      id: request.id,
      ok: true,
      data: { protocolVersion: 1, deviceId: 'desktop-1' },
    }),
  );
}

function request(socket, payload) {
  const response = receive(socket);
  socket.send(JSON.stringify(payload));
  return response;
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

function createRelay() {
  return new Promise((resolve, reject) => {
    const server = new WebSocketServer({ host: '127.0.0.1', port: 0 });
    server.once('listening', () => resolve(server));
    server.once('error', reject);
  });
}

function relayUrl(server) {
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  return `ws://127.0.0.1:${address.port}`;
}

function closeRelay(server) {
  for (const socket of server.clients) socket.terminate();
  return new Promise((resolve) => server.close(resolve));
}

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

test('connects outward, authenticates, and deduplicates writes after reconnect', async () => {
  const counters = { place: 0, cancel: 0 };
  const relay = await createRelay();
  const firstConnection = waitForConnection(relay);
  const client = new RemoteAccessClient({
    url: relayUrl(relay),
    deviceId: 'desktop-1',
    token: 'secret',
    handlers: createHandlers(counters),
    heartbeatIntervalMs: 60_000,
    reconnectInitialDelayMs: 5,
    reconnectMaxDelayMs: 5,
    reconnectJitterRatio: 0,
  });
  client.start();

  const first = await firstConnection;
  await authenticate(first);
  const wallets = await request(first, { id: 'wallets-1', method: 'wallet.list', params: {} });
  assert.equal(wallets.ok, true);
  assert.equal(wallets.data[0].id, 'wallet-1');

  const placed = await request(first, placeRequest);
  assert.deepEqual(placed, {
    id: 'place-1',
    ok: true,
    data: { orderId: 'place-1', status: 'submitting' },
  });

  const secondConnection = waitForConnection(relay);
  first.terminate();
  const reconnected = await secondConnection;
  await authenticate(reconnected);
  assert.deepEqual(await request(reconnected, placeRequest), placed);
  assert.equal(counters.place, 1);

  const conflict = await request(reconnected, {
    id: placeRequest.id,
    method: 'order.cancel',
    params: { walletId: 'wallet-1', orderId: 'exchange-1' },
  });
  assert.equal(conflict.ok, false);
  assert.equal(conflict.error.code, 'REQUEST_ID_CONFLICT');

  client.stop();
  await closeRelay(relay);
});

test('supports optional desktop confirmation for write requests', async () => {
  const counters = { place: 0, cancel: 0 };
  const relay = await createRelay();
  const connection = waitForConnection(relay);
  const client = new RemoteAccessClient({
    url: relayUrl(relay),
    deviceId: 'desktop-1',
    token: 'secret',
    handlers: createHandlers(counters),
    confirmationProvider: { confirm: () => false },
    requireConfirmationForWrites: true,
    heartbeatIntervalMs: 60_000,
  });
  client.start();

  const socket = await connection;
  await authenticate(socket);
  const response = await request(socket, placeRequest);
  assert.equal(response.ok, false);
  assert.equal(response.error.code, 'CONFIRMATION_REJECTED');
  assert.equal(counters.place, 0);

  client.stop();
  await closeRelay(relay);
});
