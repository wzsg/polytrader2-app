import assert from 'node:assert/strict';
import {
  isPriceAlignedToTick,
  normalizePriceTickSize,
  priceCentsDigitsForTick,
  priceCentsStepForTick,
} from '@polytrader/shared';

const cases = [
  { tickSize: '0.005', centsStep: 0.5, centsDigits: 1, validPrice: 0.455 },
  { tickSize: '0.0025', centsStep: 0.25, centsDigits: 2, validPrice: 0.4525 },
];

for (const testCase of cases) {
  assert.equal(normalizePriceTickSize(testCase.tickSize), testCase.tickSize);
  assert.equal(priceCentsStepForTick(testCase.tickSize), testCase.centsStep);
  assert.equal(priceCentsDigitsForTick(testCase.tickSize), testCase.centsDigits);
  assert.equal(isPriceAlignedToTick(testCase.validPrice, testCase.tickSize), true);
  assert.equal(isPriceAlignedToTick(testCase.validPrice + 0.0001, testCase.tickSize), false);
}

console.log('Tick size support smoke test passed');
