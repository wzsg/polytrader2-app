# Strategy AST

`@polytrader/strategy-ast` defines and evaluates declarative trading strategies without executing arbitrary TypeScript.

The package is deliberately platform-independent. It has no Electron, database, network, wallet, or Polymarket client dependency. Wallet access, signing, order execution, persistence, and UI integration remain outside this package.

## Phase-one scope

This package currently provides:

- A versioned JSON AST contract
- Strict structural and semantic compilation
- Stable canonical SHA-256 definition hashes
- Inferred runtime data requirements
- A deterministic, side-effect-free evaluator
- Ordered execution steps for a future runtime executor
- Golden fixtures for entry, stop-loss, spread-making, and timer-driven strategies

It does not yet replace the existing TypeScript strategy runtime. There is no database migration, editor, desktop integration, or step executor in this phase.

## Processing model

```text
Untrusted JSON
    |
StrategyAstCompiler
    |  schema + type + complexity validation
Immutable CompiledStrategyPlan
    |
StrategyAstEvaluator + event snapshot
    |
Ordered StrategyEvaluationStep[]
    |
Future desktop executor
    |  risk checks + wallet/order calls + state commit
External effects
```

Compilation must succeed before evaluation. The returned plan is deeply frozen so its validated document cannot be changed while retaining an old hash. A compiled plan is a process-local trusted object, not a persistence or IPC format. Persist or transmit the raw AST and compile it again inside the execution process.

## Core semantics

- Rules are checked in document order.
- At most one rule matches each event. Rules after the first match receive `skipped-first-match` trace entries.
- A pending rule is skipped. A configured cooldown is evaluated from the event timestamp and `lastTriggeredAt`.
- Nullable references return `null` when data is unavailable.
- A comparison involving `null` is `false`.
- Arithmetic involving `null` propagates `null`.
- `exists` is the explicit way to guard nullable data.
- Logical operands count as true only when they evaluate to the boolean `true`; negating a missing value is also false.
- Decimal values use canonical strings and `decimal.js`; JavaScript floating-point arithmetic is not used.
- Duration values are non-negative integer milliseconds.
- State actions update the local `statePreview`, so later actions in the same matched rule see earlier state changes.
- `statePreview` is not persisted by the evaluator.

All action and state changes share one ordered `steps` array. A runtime must execute and commit them in order. For example, `[order.place, state.set]` means the state change must not be committed if the preceding order fails.

Every evaluation has a stable `evaluationId` derived from the strategy instance, definition hash, and event sequence. Every step has a stable `idempotencyKey` that extends that identity with the rule and action IDs. Event sequences must increase monotonically within a strategy instance. Before acknowledging an event or advancing its sequence, the future executor must persist the complete evaluation result and its input snapshot, including evaluations that produce zero steps. A retry must replay that stored result instead of evaluating the event again against newer state. The executor must persist each successful step before advancing, skip already completed keys, and reject a reused key with a different payload. External trading calls should use the same key when their API supports idempotency; otherwise the executor needs reconciliation for an uncertain result. Successfully placed orders cannot be rolled back.

The future executor must serialize evaluation per strategy instance. It must atomically claim a new event sequence and mark the matched rule pending before performing effects, reject duplicate or older sequences before calling the evaluator, and atomically clear pending and update `lastTriggeredAt` only after every step succeeds. This prevents concurrent events from evaluating against the same runtime baseline.

Runtime snapshots are explicit:

- `initialize` uses every declared state variable's `initialValue`; the runtime must persist that complete initial snapshot before accepting subsequent events.
- `resume` requires complete persisted state and rule runtime records. Missing data fails closed instead of silently resetting state or cooldowns.

## Safety boundaries

An order can target only the strategy's selected outcome. The AST cannot supply arbitrary asset IDs, wallet keys, Polymarket credentials, tick-size flags, or generic signing payloads.

Each strategy instance must be permanently bound by the desktop adapter to one account, one market, and one selected outcome. Changing any binding requires a new strategy instance ID. The adapter must guarantee that an event and all reference snapshots supplied for one evaluation come from those same bindings.

Order cancellation is intentionally absent from version one. It will be added only with a strategy-owned order-handle model, so an AST can never cancel a manual order or an order owned by another strategy.

The evaluator checks concrete order values such as positive size/amount and a limit price in `(0, 1]`. Global `riskPolicy` values are preserved in the compiled plan and contribute to inferred data requirements, but authoritative risk enforcement belongs in the future desktop executor immediately before an external action. A strategy policy may only tighten the desktop's global risk policy; the executor must apply the stricter limit.

## Units and defaults

- Limit `shares` are selected-outcome token shares.
- Market BUY `amount` is the funding amount; market SELL `amount` is selected-outcome shares.
- `maximumPositionShares` is measured in selected-outcome shares.
- `maximumOrderValue` is measured in the market's funding/collateral currency.
- Integer limit expiration is a Unix timestamp in seconds. Timestamp expressions are converted to Unix seconds.
- Duration literals, timer intervals, cooldowns, and minimum-order intervals are milliseconds.
- Timestamps are RFC 3339 values with exactly millisecond precision.
- `postOnly` defaults to `false`.
- `marketOrderType` defaults to `FOK`.
- Decimal arithmetic uses at most 256 significant digits and half-even rounding for division.

## Public API

```ts
import {
  StrategyAstCompiler,
  StrategyAstEvaluator,
  type StrategyAstDocument,
} from '@polytrader/strategy-ast';

const compiler = new StrategyAstCompiler();
const compiled = await compiler.compile(untrustedDocument);

if (compiled.status === 'failed') {
  console.error(compiled.diagnostics);
  return;
}

const evaluator = new StrategyAstEvaluator();
const result = evaluator.evaluate(compiled.plan, {
  strategyInstanceId: 'strategy-instance-42',
  event: {
    kind: 'orderBook.changed',
    sequence: 42,
    occurredAt: '2026-07-23T00:00:00.000Z',
  },
  parameters: {},
  references: {
    orderBook: {
      bestAsk: '0.42',
    },
  },
  runtime: {
    mode: 'initialize',
  },
});

console.log(result.steps);
```

The compiler accepts `unknown`; callers should not cast untrusted JSON to `StrategyAstDocument` before compilation.

AST authoring types are also available from the explicit `@polytrader/strategy-ast/ast` subpath. Schemas, canonicalization helpers, compiler internals, and reference catalogs are intentionally not public APIs.

## Version-one surface

Triggers:

- `strategy.started`
- `strategy.stopping`
- `orderBook.changed`
- `trade.received`
- `account.changed`
- `timer.interval`

Expression inputs:

- Literals, parameters, and strategy state
- Selected order-book, trade, and position values
- Account balance and open-order count
- Market status, volume, and liquidity
- Event sequence and timestamp
- Comparisons, boolean logic, existence checks, and arithmetic

Actions:

- Place a selected-outcome limit or market order
- Set or increment strategy state
- Write a log entry
- Stop the strategy; this must be the final action in its rule

Every rule, trigger, expression, and action ID is globally unique within a document. Complexity limits are checked before recursive schema parsing so hostile deep input returns diagnostics instead of overflowing the JavaScript stack.

## Tests

Run:

```sh
pnpm --filter @polytrader/strategy-ast test
```

The fixtures under `test/fixtures` are JSON examples derived from capabilities of the current TypeScript strategy context:

- Threshold entry from an order-book update
- Position stop-loss exit on an account update
- Exact-decimal spread maker with ordered actions
- Timer-driven market order with state progression
