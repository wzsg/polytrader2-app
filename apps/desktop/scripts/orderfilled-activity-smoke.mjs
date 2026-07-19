import assert from 'node:assert/strict';
import { OrderFilledActivityServiceImpl } from '@polytrader/orderfilled-activity';

const ACTIVITY_MIN_AMOUNT = '100';
const ACTIVITY_TAKER_DIRECTION = 'SELL';
const ACTIVITY_MIN_PRICE = '0.90';
const ACTIVITY_MAX_PRICE = '0.99';
const TIMEOUT_MS = 20_000;

function waitForLiveSnapshot(service) {
  return new Promise((resolve, reject) => {
    const listener = (snapshot) => {
      if (snapshot.status !== 'live') return;
      clearTimeout(timeout);
      service.off('updated', listener);
      resolve(snapshot);
    };
    const timeout = setTimeout(() => {
      service.off('updated', listener);
      reject(new Error('Timed out waiting for the order filled activity stream to become live'));
    }, TIMEOUT_MS);
    service.on('updated', listener);
  });
}

async function main() {
  const service = new OrderFilledActivityServiceImpl({ maxTrades: 100 });
  try {
    await service.start({
      minTradeAmount: ACTIVITY_MIN_AMOUNT,
      takerDirection: ACTIVITY_TAKER_DIRECTION,
      minTradePrice: ACTIVITY_MIN_PRICE,
      maxTradePrice: ACTIVITY_MAX_PRICE,
      locale: 'en-US',
    });
    const snapshot = await waitForLiveSnapshot(service);
    assert.equal(snapshot.status, 'live');
    assert.ok(snapshot.trades.length > 0, 'Expected the stream to return historical trades');
    assert.equal(snapshot.subscription.minTradeAmount, ACTIVITY_MIN_AMOUNT);
    assert.equal(snapshot.subscription.takerDirection, ACTIVITY_TAKER_DIRECTION);
    assert.equal(snapshot.subscription.minTradePrice, ACTIVITY_MIN_PRICE);
    assert.equal(snapshot.subscription.maxTradePrice, ACTIVITY_MAX_PRICE);
    for (const trade of snapshot.trades) {
      assert.ok(trade.amount, 'Expected a normalized trade amount');
      assert.ok(trade.volume, 'Expected a normalized trade volume');
      assert.ok(trade.price, 'Expected a normalized trade price');
      assert.equal(trade.side, 0, 'Expected taker SELL to map to V2 side 0');
      assert.ok(trade.tokenId, 'Expected the V2 outcome token ID');
      assert.ok(trade.exchangeAddress, 'Expected the V2 exchange address');
      assert.ok(trade.orderHash, 'Expected the V2 order hash');
      assert.notEqual(trade.fee, null, 'Expected the V2 fee field');
      assert.ok(trade.builder, 'Expected the V2 builder field');
      assert.ok(trade.metadata, 'Expected the V2 metadata field');
      assert.equal(trade.direction, ACTIVITY_TAKER_DIRECTION);
      assert.ok(Number(trade.amount) >= Number(ACTIVITY_MIN_AMOUNT));
      assert.ok(Number(trade.price) >= Number(ACTIVITY_MIN_PRICE));
      assert.ok(Number(trade.price) <= Number(ACTIVITY_MAX_PRICE));
    }
    console.log(`Order filled activity smoke passed with ${snapshot.trades.length} trades.`);
  } finally {
    service.dispose();
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
