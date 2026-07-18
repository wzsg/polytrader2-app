import assert from 'node:assert/strict';

const originalWebSocket = globalThis.WebSocket;
const originalFetch = globalThis.fetch;
const sockets = [];
const fetchUrls = [];

class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  constructor(url) {
    this.url = url;
    this.readyState = MockWebSocket.OPEN;
    this.onopen = null;
    this.onmessage = null;
    this.onerror = null;
    this.onclose = null;
    this.messages = [];
    sockets.push(this);
    queueMicrotask(() => this.onopen?.());
  }

  send(message) {
    this.messages.push(JSON.parse(message));
  }

  close() {
    this.readyState = MockWebSocket.CLOSED;
  }

  emitMessage(message) {
    this.onmessage?.({ data: JSON.stringify(message) });
  }

  emitClose() {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.({ code: 1006 });
  }
}

async function waitFor(callback) {
  const timeoutAt = Date.now() + 1_000;
  while (!callback()) {
    if (Date.now() >= timeoutAt) throw new Error('Timed out waiting for activity protocol state');
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

async function main() {
  globalThis.WebSocket = MockWebSocket;
  globalThis.fetch = async (input) => {
    fetchUrls.push(String(input));
    return {
      ok: true,
      json: async () => ({
        events: [],
        next_cursor: null,
        has_more_catchup: false,
        reorgs: [],
        reorg_cursor: 3,
      }),
    };
  };

  const { OrderFilledActivityServiceImpl } = await import('@polytrader/orderfilled-activity');
  const service = new OrderFilledActivityServiceImpl({
    reconnectBaseDelayMs: 0,
    reconnectMaxDelayMs: 0,
  });

  try {
    await assert.rejects(
      service.start({ minTradePrice: '0.90', maxTradePrice: '0.80' }),
      /minimum price cannot exceed maximum price/i,
    );
    await service.start({
      minTradeAmount: '1000',
      takerDirection: 'BUY',
      minTradePrice: '0.60',
      maxTradePrice: '0.80',
      locale: 'zh-CN',
    });
    await waitFor(() => sockets.length === 1 && sockets[0].messages.length === 1);

    assert.equal(sockets[0].url, 'wss://orderfilled.polytrader2.com/ws/filter');
    assert.deepEqual(sockets[0].messages[0], {
      type: 'set_filter',
      locale: 'zh-CN',
      min_trade_amount: '1000',
      taker_direction: 'BUY',
      min_trade_price: '0.60',
      max_trade_price: '0.80',
    });

    sockets[0].emitMessage({
      type: 'orderfilled',
      source: 'history',
      data: {
        chain_id: 137,
        block_number: 1,
        block_hash: '0xblock',
        timestamp: 1,
        transaction_hash: '0xtx',
        log_index: 0,
        maker: '0xmaker',
        taker: '0xtaker',
        maker_asset_id: '0',
        taker_asset_id: '123',
        maker_amount_filled: '6000000',
        taker_amount_filled: '10000000',
      },
    });
    sockets[0].emitMessage({
      type: 'history_complete',
      complete: true,
      resume_cursor: 'initial-cursor',
      reorg_cursor: 2,
    });
    await waitFor(() => service.getSnapshot().status === 'live');

    const initialTrade = service.getSnapshot().trades[0];
    assert.equal(initialTrade.traderAddress, '0xtaker');
    assert.equal(initialTrade.counterpartyAddress, '0xmaker');
    assert.equal(initialTrade.direction, 'SELL');

    sockets[0].emitClose();
    await waitFor(() => sockets.length === 2 && sockets[1].messages.length === 1);
    sockets[1].emitMessage({
      type: 'history_complete',
      complete: true,
      resume_cursor: 'reconnected-cursor',
      reorg_cursor: 3,
    });
    await waitFor(() => fetchUrls.length === 1);

    const recoveryUrl = new URL(fetchUrls[0]);
    assert.equal(recoveryUrl.pathname, '/v1/orderfilled/filter/sync');
    assert.equal(recoveryUrl.searchParams.get('cursor'), 'initial-cursor');
    assert.equal(recoveryUrl.searchParams.get('reorg_cursor'), '2');
    assert.equal(recoveryUrl.searchParams.get('locale'), 'zh-CN');
    assert.equal(recoveryUrl.searchParams.get('min_trade_amount'), '1000');
    assert.equal(recoveryUrl.searchParams.get('taker_direction'), 'BUY');
    assert.equal(recoveryUrl.searchParams.get('min_trade_price'), '0.60');
    assert.equal(recoveryUrl.searchParams.get('max_trade_price'), '0.80');
    assert.equal(recoveryUrl.searchParams.has('min_trade_volume'), false);
  } finally {
    service.dispose();
    globalThis.WebSocket = originalWebSocket;
    globalThis.fetch = originalFetch;
  }

  console.log('Order filled activity filter protocol smoke passed.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
