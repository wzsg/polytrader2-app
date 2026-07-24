import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { URL } from 'node:url';
import {
  StrategyAstCompiler,
  StrategyAstEvaluator,
  StrategyEvaluationError,
} from '../dist/index.js';
import { STRATEGY_AST_SCHEMA_VERSION as AST_ENTRY_SCHEMA_VERSION } from '../dist/ast.js';

const fixtureUrls = {
  entry: new URL('./fixtures/threshold-entry.strategy.json', import.meta.url),
  stopLoss: new URL('./fixtures/stop-loss-exit.strategy.json', import.meta.url),
  spreadMaker: new URL('./fixtures/spread-maker.strategy.json', import.meta.url),
  timer: new URL('./fixtures/timer-rebalance.strategy.json', import.meta.url),
};

async function loadFixture(name) {
  return JSON.parse(await readFile(fixtureUrls[name], 'utf8'));
}

async function compileSuccess(document) {
  const result = await new StrategyAstCompiler().compile(document);
  assert.equal(
    result.status,
    'success',
    result.status === 'failed' ? JSON.stringify(result.diagnostics) : undefined,
  );
  return result.plan;
}

function baseInput(event, references = {}) {
  return {
    strategyInstanceId: 'strategy-instance-1',
    event: {
      sequence: 7,
      occurredAt: '2026-07-23T00:00:01.000Z',
      ...event,
    },
    parameters: {},
    references,
    runtime: { mode: 'initialize' },
  };
}

test('compiles a threshold-entry strategy into a frozen, hashed plan', async () => {
  const document = await loadFixture('entry');
  const plan = await compileSuccess(document);

  assert.match(plan.definitionHash, /^[a-f0-9]{64}$/);
  assert.equal(plan.schemaVersion, 1);
  assert.equal(AST_ENTRY_SCHEMA_VERSION, 1);
  assert.equal(plan.requirements.orderBook, true);
  assert.equal(plan.requirements.account, true);
  assert.equal(plan.requirements.positions, false);
  assert.equal(plan.requirements.market, false);
  assert.equal(plan.requirements.trades, false);
  assert.ok(plan.nodeCount > 0);
  assert.equal(Object.isFrozen(plan), true);
  assert.equal(Object.isFrozen(plan.document.rules), true);
  assert.equal(Object.isFrozen(plan.requirements.timerIntervalsMs), true);
  assert.throws(() => plan.document.rules.push({}), TypeError);
});

test('canonicalization and hashing are independent of object key insertion order', async () => {
  const document = await loadFixture('entry');
  const reordered = {
    riskPolicy: document.riskPolicy,
    rules: document.rules,
    state: document.state,
    parameters: document.parameters,
    schemaVersion: document.schemaVersion,
  };
  const originalPlan = await compileSuccess(document);
  const reorderedPlan = await compileSuccess(reordered);

  assert.equal(originalPlan.definitionHash, reorderedPlan.definitionHash);
  assert.equal(
    originalPlan.definitionHash,
    'd4c470a7a5a649716900b9ad6601eb30392f857f8c06e777174a984599aaa0e9',
  );
});

test('evaluates threshold entry with order and state steps in document order', async () => {
  const plan = await compileSuccess(await loadFixture('entry'));
  const result = new StrategyAstEvaluator().evaluate(
    plan,
    baseInput({ kind: 'orderBook.changed' }, { orderBook: { bestAsk: '0.42' } }),
  );

  assert.deepEqual(result.matchedRuleIds, ['rule.entry']);
  assert.equal(
    result.evaluationId,
    `strategy-evaluation-v1:strategy-instance-1:${plan.definitionHash}:7`,
  );
  assert.deepEqual(result.trace, [{ ruleId: 'rule.entry', status: 'matched' }]);
  assert.deepEqual(result.steps, [
    {
      kind: 'order.place',
      idempotencyKey: `${result.evaluationId}:rule.entry:action.entry.place`,
      ruleId: 'rule.entry',
      actionId: 'action.entry.place',
      asset: 'selected',
      side: 'BUY',
      order: {
        orderType: 'limit',
        price: '0.42',
        shares: '5',
        postOnly: false,
      },
    },
    {
      kind: 'state.set',
      idempotencyKey: `${result.evaluationId}:rule.entry:action.entry.sequence`,
      ruleId: 'rule.entry',
      actionId: 'action.entry.sequence',
      name: 'lastOrderSequence',
      previousValue: -1,
      value: 7,
    },
  ]);
  assert.deepEqual(result.statePreview, { lastOrderSequence: 7 });
});

test('treats missing nullable market data as a false condition', async () => {
  const plan = await compileSuccess(await loadFixture('entry'));
  const result = new StrategyAstEvaluator().evaluate(
    plan,
    baseInput({ kind: 'orderBook.changed' }, { orderBook: { bestAsk: null } }),
  );

  assert.deepEqual(result.matchedRuleIds, []);
  assert.deepEqual(result.steps, []);
  assert.deepEqual(result.statePreview, { lastOrderSequence: -1 });
  assert.deepEqual(result.trace, [{ ruleId: 'rule.entry', status: 'condition-false' }]);
});

test('uses document-order first-match semantics', async () => {
  const document = await loadFixture('entry');
  document.rules.push({
    id: 'rule.entryFallback',
    trigger: {
      id: 'trigger.entryFallback.book',
      kind: 'orderBook.changed',
      outcome: 'selected',
    },
    actions: [
      {
        id: 'action.entryFallback.log',
        kind: 'log.write',
        level: 'info',
        message: 'Fallback rule matched',
      },
    ],
  });
  const plan = await compileSuccess(document);
  const result = new StrategyAstEvaluator().evaluate(
    plan,
    baseInput({ kind: 'orderBook.changed' }, { orderBook: { bestAsk: '0.42' } }),
  );

  assert.deepEqual(result.matchedRuleIds, ['rule.entry']);
  assert.deepEqual(result.trace, [
    { ruleId: 'rule.entry', status: 'matched' },
    { ruleId: 'rule.entryFallback', status: 'skipped-first-match' },
  ]);
  assert.equal(result.steps.length, 2);
});

test('evaluates a stop-loss market exit and safely ignores missing positions', async () => {
  const plan = await compileSuccess(await loadFixture('stopLoss'));
  const evaluator = new StrategyAstEvaluator();
  const triggered = evaluator.evaluate(
    plan,
    baseInput({ kind: 'account.changed' }, { position: { size: '12', cashPnl: '-10.01' } }),
  );

  assert.deepEqual(triggered.steps, [
    {
      kind: 'order.place',
      idempotencyKey: `${triggered.evaluationId}:rule.stopLoss:action.stopLoss.sell`,
      ruleId: 'rule.stopLoss',
      actionId: 'action.stopLoss.sell',
      asset: 'selected',
      side: 'SELL',
      order: {
        orderType: 'market',
        amount: '12',
        marketOrderType: 'FOK',
      },
    },
    {
      kind: 'log.write',
      idempotencyKey: `${triggered.evaluationId}:rule.stopLoss:action.stopLoss.log`,
      ruleId: 'rule.stopLoss',
      actionId: 'action.stopLoss.log',
      level: 'warn',
      message: 'Stop-loss exit requested',
    },
  ]);

  const missing = evaluator.evaluate(
    plan,
    baseInput({ kind: 'account.changed' }, { position: {} }),
  );
  assert.deepEqual(missing.steps, []);
  assert.deepEqual(missing.trace, [{ ruleId: 'rule.stopLoss', status: 'condition-false' }]);
});

test('uses exact decimal arithmetic for spread matching and preserves action order', async () => {
  const plan = await compileSuccess(await loadFixture('spreadMaker'));
  const evaluator = new StrategyAstEvaluator();
  const input = baseInput(
    { kind: 'orderBook.changed' },
    {
      orderBook: {
        bestBid: '0.1',
        bestAsk: '0.3',
        midpoint: '0.2',
      },
    },
  );
  const result = evaluator.evaluate(plan, input);

  assert.deepEqual(
    result.steps.map((step) => step.kind),
    ['order.place', 'order.place', 'state.set'],
  );
  assert.equal(result.steps[0].order.price, '0.1');
  assert.equal(result.steps[1].order.price, '0.3');
  assert.equal(result.statePreview.lastMidpoint, '0.2');

  const pending = evaluator.evaluate(plan, {
    ...input,
    runtime: {
      mode: 'resume',
      state: { lastMidpoint: null },
      rules: {
        'rule.spreadMaker': { pending: true, lastTriggeredAt: null },
      },
    },
  });
  assert.deepEqual(pending.steps, []);
  assert.deepEqual(pending.trace, [{ ruleId: 'rule.spreadMaker', status: 'skipped-pending' }]);

  const coolingDown = evaluator.evaluate(plan, {
    ...input,
    event: { ...input.event, occurredAt: '2026-07-23T00:00:00.500Z' },
    runtime: {
      mode: 'resume',
      state: { lastMidpoint: null },
      rules: {
        'rule.spreadMaker': {
          pending: false,
          lastTriggeredAt: '2026-07-23T00:00:00.000Z',
        },
      },
    },
  });
  assert.deepEqual(coolingDown.steps, []);
  assert.deepEqual(coolingDown.trace, [{ ruleId: 'rule.spreadMaker', status: 'skipped-cooldown' }]);
});

test('evaluates timer market orders, increments state, and infers timer requirements', async () => {
  const plan = await compileSuccess(await loadFixture('timer'));
  assert.deepEqual(plan.requirements.timerIntervalsMs, [5000]);
  const evaluator = new StrategyAstEvaluator();
  const input = baseInput({ kind: 'timer.interval', intervalMs: 5000 });
  const result = evaluator.evaluate(plan, input);

  assert.deepEqual(
    result.steps.map((step) => step.kind),
    ['order.place', 'state.increment'],
  );
  assert.deepEqual(result.steps[0].order, {
    orderType: 'market',
    amount: '10',
    marketOrderType: 'FAK',
  });
  assert.deepEqual(result.steps[1], {
    kind: 'state.increment',
    idempotencyKey: `${result.evaluationId}:rule.timerRebalance:action.timerRebalance.increment`,
    ruleId: 'rule.timerRebalance',
    actionId: 'action.timerRebalance.increment',
    name: 'tickCount',
    previousValue: 0,
    amount: '1',
    value: 1,
  });
  assert.deepEqual(result.statePreview, { tickCount: 1 });

  const wrongInterval = evaluator.evaluate(plan, {
    ...input,
    event: { ...input.event, intervalMs: 10_000 },
  });
  assert.deepEqual(wrongInterval.steps, []);
  assert.deepEqual(wrongInterval.trace, [
    { ruleId: 'rule.timerRebalance', status: 'not-triggered' },
  ]);
});

test('requires complete resumed state and rejects cloned compiled plans', async () => {
  const plan = await compileSuccess(await loadFixture('entry'));
  const evaluator = new StrategyAstEvaluator();
  const input = baseInput({ kind: 'orderBook.changed' }, { orderBook: { bestAsk: '0.42' } });

  assert.throws(
    () =>
      evaluator.evaluate(plan, {
        ...input,
        runtime: {
          mode: 'resume',
          state: {},
          rules: {
            'rule.entry': { pending: false, lastTriggeredAt: null },
          },
        },
      }),
    (error) => error instanceof StrategyEvaluationError && error.code === 'MISSING_STATE',
  );

  const clonedPlan = JSON.parse(JSON.stringify(plan));
  clonedPlan.document.rules[0].actions[0].side = 'SELL';
  assert.throws(
    () => evaluator.evaluate(clonedPlan, input),
    (error) => error instanceof StrategyEvaluationError && error.code === 'UNTRUSTED_COMPILED_PLAN',
  );
});

test('normalizes limit expiration and preserves arithmetic beyond 40 digits', async () => {
  const expirationDocument = await loadFixture('entry');
  expirationDocument.rules[0].actions[0].order.expiration = {
    id: 'literal.entry.expiration',
    kind: 'literal.timestamp',
    value: '2026-07-24T00:00:00.000Z',
  };
  const expirationPlan = await compileSuccess(expirationDocument);
  const expirationResult = new StrategyAstEvaluator().evaluate(
    expirationPlan,
    baseInput({ kind: 'orderBook.changed' }, { orderBook: { bestAsk: '0.42' } }),
  );
  assert.equal(
    expirationResult.steps[0].order.expiration,
    Date.parse('2026-07-24T00:00:00.000Z') / 1000,
  );

  const precisionDocument = await loadFixture('entry');
  precisionDocument.rules[0].actions[0].order.price = {
    id: 'arithmetic.entry.preciseAddition',
    kind: 'arithmetic',
    operator: 'add',
    left: {
      id: 'literal.entry.preciseLeft',
      kind: 'literal.decimal',
      value: '0.12345678901234567890123456789012345678901',
    },
    right: {
      id: 'literal.entry.preciseRight',
      kind: 'literal.decimal',
      value: '0.00000000000000000000000000000000000000001',
    },
  };
  const precisionPlan = await compileSuccess(precisionDocument);
  const precisionResult = new StrategyAstEvaluator().evaluate(
    precisionPlan,
    baseInput({ kind: 'orderBook.changed' }, { orderBook: { bestAsk: '0.42' } }),
  );
  assert.equal(precisionResult.steps[0].order.price, '0.12345678901234567890123456789012345678902');
});

test('infers trade requirements and evaluates lifecycle stop actions', async () => {
  const tradeDocument = {
    schemaVersion: 1,
    parameters: {},
    state: {},
    rules: [
      {
        id: 'rule.tradeLog',
        trigger: {
          id: 'trigger.tradeLog',
          kind: 'trade.received',
          outcome: 'selected',
        },
        condition: {
          id: 'compare.tradeLog.marketActive',
          kind: 'compare',
          operator: 'eq',
          left: {
            id: 'reference.tradeLog.marketActive',
            kind: 'reference',
            source: 'market',
            field: 'active',
          },
          right: {
            id: 'literal.tradeLog.marketActive',
            kind: 'literal.boolean',
            value: true,
          },
        },
        actions: [
          {
            id: 'action.tradeLog',
            kind: 'log.write',
            level: 'info',
            message: 'Trade received',
          },
        ],
      },
    ],
    riskPolicy: {},
  };
  const tradePlan = await compileSuccess(tradeDocument);
  assert.equal(tradePlan.requirements.trades, true);
  assert.equal(tradePlan.requirements.market, true);

  const stopDocument = JSON.parse(JSON.stringify(tradeDocument));
  stopDocument.rules[0] = {
    id: 'rule.lifecycleStop',
    trigger: {
      id: 'trigger.lifecycleStop',
      kind: 'strategy.stopping',
    },
    actions: [
      {
        id: 'action.lifecycleStop',
        kind: 'strategy.stop',
      },
    ],
  };
  const stopPlan = await compileSuccess(stopDocument);
  const result = new StrategyAstEvaluator().evaluate(
    stopPlan,
    baseInput({ kind: 'strategy.stopping' }),
  );
  assert.equal(result.steps[0].kind, 'strategy.stop');
  assert.equal(result.steps[0].reason, 'Strategy requested a stop');
});

test('validates parameter overrides and compiler hard limits', async () => {
  const plan = await compileSuccess(await loadFixture('entry'));
  const evaluator = new StrategyAstEvaluator();
  const input = baseInput({ kind: 'orderBook.changed' }, { orderBook: { bestAsk: '0.42' } });
  const belowThreshold = evaluator.evaluate(plan, {
    ...input,
    parameters: { maxEntryPrice: '0.4', orderShares: '3' },
  });
  assert.deepEqual(belowThreshold.steps, []);

  assert.throws(
    () =>
      evaluator.evaluate(plan, {
        ...input,
        parameters: { maxEntryPrice: '1', orderShares: '3' },
      }),
    (error) => error instanceof StrategyEvaluationError && error.code === 'PARAMETER_ABOVE_MAXIMUM',
  );
  assert.throws(() => new StrategyAstCompiler({ maxRules: 257 }), TypeError);
  assert.throws(() => new StrategyAstCompiler({ maxActionsPerRule: 65 }), TypeError);
});

test('returns diagnostics for hostile depth, duplicate IDs, invalid bounds, and division by zero', async () => {
  const compiler = new StrategyAstCompiler();
  const deepDocument = await loadFixture('entry');
  let condition = { id: 'deep.literal', kind: 'literal.boolean', value: true };
  for (let index = 0; index < 2_000; index += 1) {
    condition = {
      id: `deep.not.${index}`,
      kind: 'not',
      operand: condition,
    };
  }
  deepDocument.rules[0].condition = condition;
  const deepResult = await compiler.compile(deepDocument);
  assert.equal(deepResult.status, 'failed');
  assert.equal(deepResult.diagnostics[0].code, 'AST_TOO_DEEP');

  const duplicateDocument = await loadFixture('entry');
  duplicateDocument.rules[0].trigger.id = duplicateDocument.rules[0].id;
  const duplicateResult = await compiler.compile(duplicateDocument);
  assert.equal(duplicateResult.status, 'failed');
  assert.ok(
    duplicateResult.diagnostics.some((diagnostic) => diagnostic.code === 'DUPLICATE_NODE_ID'),
  );

  const boundDocument = await loadFixture('entry');
  boundDocument.parameters.maxEntryPrice.defaultValue = '0.9';
  boundDocument.parameters.maxEntryPrice.maximum = '0.5';
  const boundResult = await compiler.compile(boundDocument);
  assert.equal(boundResult.status, 'failed');
  assert.ok(
    boundResult.diagnostics.some((diagnostic) => diagnostic.code === 'DEFAULT_OUT_OF_BOUNDS'),
  );

  const divisionDocument = await loadFixture('entry');
  divisionDocument.rules[0].actions[0].order.price = {
    id: 'arithmetic.entry.zeroDivision',
    kind: 'arithmetic',
    operator: 'divide',
    left: {
      id: 'literal.entry.dividend',
      kind: 'literal.decimal',
      value: '0.5',
    },
    right: {
      id: 'literal.entry.divisor',
      kind: 'literal.decimal',
      value: '0',
    },
  };
  const divisionResult = await compiler.compile(divisionDocument);
  assert.equal(divisionResult.status, 'failed');
  assert.ok(
    divisionResult.diagnostics.some((diagnostic) => diagnostic.code === 'DIVISION_BY_ZERO'),
  );

  const timestampDocument = await loadFixture('entry');
  timestampDocument.rules[0].actions[0].order.expiration = {
    id: 'literal.entry.subMillisecondExpiration',
    kind: 'literal.timestamp',
    value: '2026-07-24T00:00:00.0001Z',
  };
  const timestampResult = await compiler.compile(timestampDocument);
  assert.equal(timestampResult.status, 'failed');
  assert.ok(timestampResult.diagnostics.some((diagnostic) => diagnostic.code === 'SCHEMA_INVALID'));

  const invalidOffsetDocument = await loadFixture('entry');
  invalidOffsetDocument.rules[0].actions[0].order.expiration = {
    id: 'literal.entry.invalidOffsetExpiration',
    kind: 'literal.timestamp',
    value: '2026-07-24T00:00:00.000+24:00',
  };
  const invalidOffsetResult = await compiler.compile(invalidOffsetDocument);
  assert.equal(invalidOffsetResult.status, 'failed');
  assert.ok(
    invalidOffsetResult.diagnostics.some((diagnostic) => diagnostic.code === 'SCHEMA_INVALID'),
  );
});

test('rejects stop actions followed by another action', async () => {
  const document = await loadFixture('timer');
  document.rules[0].actions.unshift({
    id: 'action.timerRebalance.stopEarly',
    kind: 'strategy.stop',
  });

  const result = await new StrategyAstCompiler().compile(document);
  assert.equal(result.status, 'failed');
  assert.ok(result.diagnostics.some((diagnostic) => diagnostic.code === 'STOP_ACTION_NOT_LAST'));
});

test('rejects zero order values, limit prices above one, and zero risk limits', async () => {
  const evaluator = new StrategyAstEvaluator();

  const zeroMarketAmountDocument = await loadFixture('timer');
  zeroMarketAmountDocument.rules[0].actions[0].order.amount = {
    id: 'literal.timerRebalance.zeroAmount',
    kind: 'literal.decimal',
    value: '0',
  };
  const zeroMarketAmountPlan = await compileSuccess(zeroMarketAmountDocument);
  assert.throws(
    () =>
      evaluator.evaluate(
        zeroMarketAmountPlan,
        baseInput({ kind: 'timer.interval', intervalMs: 5000 }),
      ),
    (error) =>
      error instanceof StrategyEvaluationError && error.code === 'EXPECTED_POSITIVE_DECIMAL',
  );

  const zeroSharesDocument = await loadFixture('entry');
  zeroSharesDocument.rules[0].actions[0].order.shares = {
    id: 'literal.entry.zeroShares',
    kind: 'literal.decimal',
    value: '0',
  };
  const zeroSharesPlan = await compileSuccess(zeroSharesDocument);
  assert.throws(
    () =>
      evaluator.evaluate(
        zeroSharesPlan,
        baseInput({ kind: 'orderBook.changed' }, { orderBook: { bestAsk: '0.42' } }),
      ),
    (error) =>
      error instanceof StrategyEvaluationError && error.code === 'EXPECTED_POSITIVE_DECIMAL',
  );

  const highPriceDocument = await loadFixture('entry');
  highPriceDocument.rules[0].actions[0].order.price = {
    id: 'literal.entry.highPrice',
    kind: 'literal.decimal',
    value: '1.01',
  };
  const highPricePlan = await compileSuccess(highPriceDocument);
  assert.throws(
    () =>
      evaluator.evaluate(
        highPricePlan,
        baseInput({ kind: 'orderBook.changed' }, { orderBook: { bestAsk: '0.42' } }),
      ),
    (error) => error instanceof StrategyEvaluationError && error.code === 'INVALID_LIMIT_PRICE',
  );

  const zeroRiskDocument = await loadFixture('entry');
  zeroRiskDocument.riskPolicy.maximumOrderValue = '0';
  const zeroRiskResult = await new StrategyAstCompiler().compile(zeroRiskDocument);
  assert.equal(zeroRiskResult.status, 'failed');
  assert.ok(
    zeroRiskResult.diagnostics.some((diagnostic) => diagnostic.code === 'INVALID_RISK_LIMIT'),
  );
});

test('rejects non-canonical decimals and inherited definition names', async () => {
  const compiler = new StrategyAstCompiler();
  const nonCanonical = await loadFixture('entry');
  nonCanonical.parameters.maxEntryPrice.defaultValue = '0.50';
  const nonCanonicalResult = await compiler.compile(nonCanonical);
  assert.equal(nonCanonicalResult.status, 'failed');
  assert.ok(
    nonCanonicalResult.diagnostics.some(
      (diagnostic) => diagnostic.code === 'INVALID_DEFAULT_VALUE',
    ),
  );

  const inheritedName = await loadFixture('entry');
  inheritedName.rules[0].actions[0].order.price = {
    id: 'parameter.entry.inherited',
    kind: 'parameter',
    name: 'constructor',
  };
  const inheritedNameResult = await compiler.compile(inheritedName);
  assert.equal(inheritedNameResult.status, 'failed');
  assert.ok(
    inheritedNameResult.diagnostics.some((diagnostic) => diagnostic.code === 'UNKNOWN_PARAMETER'),
  );
});

test('throws a typed evaluation error for a dynamic zero divisor', async () => {
  const document = await loadFixture('entry');
  document.parameters.divisor = {
    type: 'decimal',
    defaultValue: '0',
  };
  document.rules[0].actions[0].order.price = {
    id: 'arithmetic.entry.dynamicDivision',
    kind: 'arithmetic',
    operator: 'divide',
    left: {
      id: 'literal.entry.dynamicDividend',
      kind: 'literal.decimal',
      value: '0.5',
    },
    right: {
      id: 'parameter.entry.dynamicDivisor',
      kind: 'parameter',
      name: 'divisor',
    },
  };
  const plan = await compileSuccess(document);

  assert.throws(
    () =>
      new StrategyAstEvaluator().evaluate(
        plan,
        baseInput({ kind: 'orderBook.changed' }, { orderBook: { bestAsk: '0.42' } }),
      ),
    (error) =>
      error instanceof StrategyEvaluationError &&
      error.code === 'DIVISION_BY_ZERO' &&
      error.nodeId === 'arithmetic.entry.dynamicDivision',
  );
});

test('rejects malformed runtime reference and timestamp inputs', async () => {
  const plan = await compileSuccess(await loadFixture('entry'));
  const evaluator = new StrategyAstEvaluator();
  assert.throws(
    () =>
      evaluator.evaluate(
        plan,
        baseInput({ kind: 'orderBook.changed' }, { orderBook: { bestAskk: '0.42' } }),
      ),
    (error) => error instanceof StrategyEvaluationError && error.code === 'UNKNOWN_REFERENCE_FIELD',
  );
  assert.throws(
    () =>
      evaluator.evaluate(
        plan,
        baseInput(
          {
            kind: 'orderBook.changed',
            occurredAt: '2026-07-23T00:00:00.0001Z',
          },
          { orderBook: { bestAsk: '0.42' } },
        ),
      ),
    (error) => error instanceof StrategyEvaluationError && error.code === 'INVALID_EVENT_TIMESTAMP',
  );
  assert.throws(
    () =>
      evaluator.evaluate(
        plan,
        baseInput(
          {
            kind: 'orderBook.changed',
            occurredAt: '2026-07-23T00:00:00.000+24:00',
          },
          { orderBook: { bestAsk: '0.42' } },
        ),
      ),
    (error) => error instanceof StrategyEvaluationError && error.code === 'INVALID_EVENT_TIMESTAMP',
  );
  assert.throws(
    () =>
      evaluator.evaluate(plan, {
        ...baseInput({ kind: 'orderBook.changed' }, { orderBook: { bestAsk: '0.42' } }),
        runtime: {
          mode: 'resume',
          state: { lastOrderSequence: -1 },
          rules: {
            'rule.entry': {
              pending: false,
              lastTriggeredAt: '2026-07-23T00:00:00.000+24:00',
            },
          },
        },
      }),
    (error) => error instanceof StrategyEvaluationError && error.code === 'INVALID_RULE_RUNTIME',
  );
});
