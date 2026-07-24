import Decimal from 'decimal.js';

const StrategyDecimal = Decimal.clone({
  precision: 256,
  rounding: Decimal.ROUND_HALF_EVEN,
  toExpNeg: -1_000,
  toExpPos: 1_000,
});

export { StrategyDecimal };
