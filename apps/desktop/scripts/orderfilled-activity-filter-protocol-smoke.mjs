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
        events: [
          {
            type: 'orderfilled',
            schema_version: 2,
            source: 'catchup',
            data: {
              chain_id: 137,
              block_number: 3,
              block_hash: '0xcatchup-block',
              timestamp: 3,
              transaction_hash: '0xcatchup-tx',
              log_index: 0,
              exchange_address: '0xexchange',
              order_hash: '0xcatchup-order',
              maker: '0xmaker',
              taker: '0xtaker',
              side: 0,
              token_id: '123',
              maker_amount_filled: '6000000',
              taker_amount_filled: '10000000',
              fee: '0',
              builder: '0xbuilder',
              metadata: '0xmetadata',
            },
          },
        ],
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
      schema_version: 2,
      source: 'history',
      data: {
        chain_id: 137,
        block_number: 1,
        block_hash: '0xblock',
        timestamp: 1,
        transaction_hash: '0xtx',
        log_index: 0,
        exchange_address: '0xexchange',
        order_hash: '0xorder',
        maker: '0xmaker',
        taker: '0xtaker',
        side: 0,
        token_id: '123',
        maker_amount_filled: '6000000',
        taker_amount_filled: '10000000',
        fee: '0',
        builder: '0xbuilder',
        metadata: '0xmetadata',
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
    assert.equal(initialTrade.side, 0);
    assert.equal(initialTrade.tokenId, '123');
    assert.equal(initialTrade.exchangeAddress, '0xexchange');
    assert.equal(initialTrade.orderHash, '0xorder');
    assert.equal(initialTrade.amount, '6');
    assert.equal(initialTrade.volume, '10');
    assert.equal(initialTrade.price, '0.6');

    sockets[0].emitMessage({
      type: 'orderfilled',
      schema_version: 2,
      source: 'live',
      data: {
        chain_id: 137,
        block_number: 2,
        block_hash: '0xlive-block',
        timestamp: 2,
        transaction_hash: '0xlive-tx',
        log_index: 0,
        exchange_address: '0xexchange',
        order_hash: '0xlive-order',
        maker: '0xmaker',
        taker: '0xtaker',
        side: 1,
        token_id: '456',
        maker_amount_filled: '10000000',
        taker_amount_filled: '6000000',
        fee: '0',
        builder: '0xbuilder',
        metadata: '0xmetadata',
      },
    });
    sockets[0].emitMessage({
      type: 'orderfilled',
      schema_version: 1,
      source: 'live',
      data: {
        chain_id: 137,
        block_number: 99,
        block_hash: '0xlegacy-block',
        timestamp: 99,
        transaction_hash: '0xlegacy-tx',
        log_index: 0,
      },
    });
    await waitFor(() => service.getSnapshot().trades.length === 2);

    const liveTrade = service.getSnapshot().trades.find((trade) => trade.source === 'live');
    assert.equal(liveTrade?.direction, 'BUY');
    assert.equal(liveTrade?.side, 1);
    assert.equal(liveTrade?.tokenId, '456');
    assert.equal(liveTrade?.amount, '6');
    assert.equal(liveTrade?.volume, '10');
    assert.equal(liveTrade?.price, '0.6');

    sockets[0].emitClose();
    await waitFor(() => sockets.length === 2 && sockets[1].messages.length === 1);
    sockets[1].emitMessage({
      type: 'history_complete',
      complete: true,
      resume_cursor: 'reconnected-cursor',
      reorg_cursor: 3,
    });
    await waitFor(() => fetchUrls.length === 1);
    await waitFor(() => service.getSnapshot().trades.some((trade) => trade.source === 'catchup'));

    const catchupTrade = service.getSnapshot().trades.find((trade) => trade.source === 'catchup');
    assert.equal(catchupTrade?.side, 0);
    assert.equal(catchupTrade?.direction, 'SELL');
    assert.equal(catchupTrade?.tokenId, '123');

    sockets[1].emitMessage({
      type: 'reorg',
      schema_version: 1,
      data: { common_ancestor_number: 1 },
    });
    assert.equal(service.getSnapshot().trades.length, 3);
    sockets[1].emitMessage({
      type: 'reorg',
      schema_version: 2,
      data: { common_ancestor_number: 2 },
    });
    await waitFor(() => service.getSnapshot().trades.length === 2);

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
