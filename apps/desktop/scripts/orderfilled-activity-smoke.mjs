import assert from 'node:assert/strict';
import { OrderFilledActivityServiceImpl } from '@polytrader/orderfilled-activity';

const ACTIVITY_FILTER = '1000';
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
    await service.start({ minTradeAmount: ACTIVITY_FILTER, locale: 'en-US' });
    const snapshot = await waitForLiveSnapshot(service);
    assert.equal(snapshot.status, 'live');
    assert.ok(snapshot.trades.length > 0, 'Expected the stream to return historical trades');
    for (const trade of snapshot.trades) {
      assert.ok(trade.amount, 'Expected a normalized trade amount');
      assert.ok(trade.volume, 'Expected a normalized trade volume');
      assert.ok(trade.price, 'Expected a normalized trade price');
      assert.ok(Number(trade.amount) >= Number(ACTIVITY_FILTER));
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
