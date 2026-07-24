const STRATEGY_AST_SCHEMA_VERSION = 1 as const;

type StrategyValueType =
  'boolean' | 'decimal' | 'integer' | 'string' | 'orderSide' | 'timestamp' | 'duration';

type StrategyRuntimeValue = boolean | string | number | null;

interface StrategyParameterDefinition {
  type: StrategyValueType;
  nullable?: boolean;
  defaultValue?: StrategyRuntimeValue;
  minimum?: string | number;
  maximum?: string | number;
  description?: string;
}

interface StrategyStateDefinition {
  type: StrategyValueType;
  nullable?: boolean;
  initialValue: StrategyRuntimeValue;
}

interface StrategyNodeBase {
  id: string;
  kind: string;
}

interface StrategyBooleanLiteralNode extends StrategyNodeBase {
  kind: 'literal.boolean';
  value: boolean;
}

interface StrategyDecimalLiteralNode extends StrategyNodeBase {
  kind: 'literal.decimal';
  value: string;
}

interface StrategyIntegerLiteralNode extends StrategyNodeBase {
  kind: 'literal.integer';
  value: number;
}

interface StrategyStringLiteralNode extends StrategyNodeBase {
  kind: 'literal.string';
  value: string;
}

interface StrategyOrderSideLiteralNode extends StrategyNodeBase {
  kind: 'literal.orderSide';
  value: 'BUY' | 'SELL';
}

interface StrategyTimestampLiteralNode extends StrategyNodeBase {
  kind: 'literal.timestamp';
  value: string;
}

interface StrategyDurationLiteralNode extends StrategyNodeBase {
  kind: 'literal.duration';
  value: number;
}

type StrategyLiteralNode =
  | StrategyBooleanLiteralNode
  | StrategyDecimalLiteralNode
  | StrategyIntegerLiteralNode
  | StrategyStringLiteralNode
  | StrategyOrderSideLiteralNode
  | StrategyTimestampLiteralNode
  | StrategyDurationLiteralNode;

interface StrategyParameterNode extends StrategyNodeBase {
  kind: 'parameter';
  name: string;
}

interface StrategyStateNode extends StrategyNodeBase {
  kind: 'state';
  name: string;
}

type StrategyReferenceNode =
  | (StrategyNodeBase & {
      kind: 'reference';
      source: 'orderBook';
      field: 'bestBid' | 'bestAsk' | 'midpoint' | 'spread' | 'tickSize';
      outcome: 'selected';
    })
  | (StrategyNodeBase & {
      kind: 'reference';
      source: 'account';
      field: 'availableBalance' | 'openOrderCount';
    })
  | (StrategyNodeBase & {
      kind: 'reference';
      source: 'position';
      field: 'size' | 'averagePrice' | 'currentValue' | 'cashPnl';
      outcome: 'selected';
    })
  | (StrategyNodeBase & {
      kind: 'reference';
      source: 'market';
      field: 'active' | 'closed' | 'volume' | 'volume24hr' | 'liquidity';
    })
  | (StrategyNodeBase & {
      kind: 'reference';
      source: 'trade';
      field: 'price' | 'size' | 'side';
      outcome: 'selected';
    })
  | (StrategyNodeBase & {
      kind: 'reference';
      source: 'event';
      field: 'sequence' | 'occurredAt';
    });

type StrategyCompareOperator = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte';

interface StrategyCompareNode extends StrategyNodeBase {
  kind: 'compare';
  operator: StrategyCompareOperator;
  left: StrategyExpressionNode;
  right: StrategyExpressionNode;
}

interface StrategyLogicalNode extends StrategyNodeBase {
  kind: 'logical';
  operator: 'all' | 'any';
  items: StrategyExpressionNode[];
}

interface StrategyNotNode extends StrategyNodeBase {
  kind: 'not';
  operand: StrategyExpressionNode;
}

interface StrategyArithmeticNode extends StrategyNodeBase {
  kind: 'arithmetic';
  operator: 'add' | 'subtract' | 'multiply' | 'divide';
  left: StrategyExpressionNode;
  right: StrategyExpressionNode;
}

interface StrategyExistsNode extends StrategyNodeBase {
  kind: 'exists';
  operand: StrategyExpressionNode;
}

type StrategyExpressionNode =
  | StrategyLiteralNode
  | StrategyParameterNode
  | StrategyStateNode
  | StrategyReferenceNode
  | StrategyCompareNode
  | StrategyLogicalNode
  | StrategyNotNode
  | StrategyArithmeticNode
  | StrategyExistsNode;

type StrategyTriggerNode =
  | (StrategyNodeBase & { kind: 'strategy.started' })
  | (StrategyNodeBase & { kind: 'strategy.stopping' })
  | (StrategyNodeBase & { kind: 'orderBook.changed'; outcome: 'selected' })
  | (StrategyNodeBase & { kind: 'trade.received'; outcome: 'selected' })
  | (StrategyNodeBase & { kind: 'account.changed' })
  | (StrategyNodeBase & { kind: 'timer.interval'; intervalMs: number });

interface StrategyLimitOrderSpec {
  orderType: 'limit';
  price: StrategyExpressionNode;
  shares: StrategyExpressionNode;
  postOnly?: boolean;
  expiration?: StrategyExpressionNode;
}

interface StrategyMarketOrderSpec {
  orderType: 'market';
  amount: StrategyExpressionNode;
  marketOrderType?: 'FOK' | 'FAK';
}

interface StrategyPlaceOrderAction extends StrategyNodeBase {
  kind: 'order.place';
  asset: 'selected';
  side: 'BUY' | 'SELL';
  order: StrategyLimitOrderSpec | StrategyMarketOrderSpec;
}

interface StrategySetStateAction extends StrategyNodeBase {
  kind: 'state.set';
  name: string;
  value: StrategyExpressionNode;
}

interface StrategyIncrementStateAction extends StrategyNodeBase {
  kind: 'state.increment';
  name: string;
  amount: StrategyExpressionNode;
}

interface StrategyLogAction extends StrategyNodeBase {
  kind: 'log.write';
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
}

interface StrategyStopAction extends StrategyNodeBase {
  kind: 'strategy.stop';
  reason?: string;
}

type StrategyActionNode =
  | StrategyPlaceOrderAction
  | StrategySetStateAction
  | StrategyIncrementStateAction
  | StrategyLogAction
  | StrategyStopAction;

interface StrategyRulePolicy {
  cooldownMs?: number;
}

interface StrategyRule {
  id: string;
  trigger: StrategyTriggerNode;
  condition?: StrategyExpressionNode;
  actions: StrategyActionNode[];
  policy?: StrategyRulePolicy;
}

interface StrategyRiskPolicy {
  maximumOpenOrders?: number;
  maximumPositionShares?: string;
  maximumOrderValue?: string;
  minimumOrderIntervalMs?: number;
}

interface StrategyAstDocument {
  schemaVersion: typeof STRATEGY_AST_SCHEMA_VERSION;
  parameters: Record<string, StrategyParameterDefinition>;
  state: Record<string, StrategyStateDefinition>;
  rules: StrategyRule[];
  riskPolicy: StrategyRiskPolicy;
}

type StrategyDiagnosticSeverity = 'error' | 'warning';

interface StrategyDiagnostic {
  code: string;
  severity: StrategyDiagnosticSeverity;
  message: string;
  nodeId: string | null;
  path: string;
}

interface StrategyAstCompilerOptions {
  maxNodes?: number;
  maxDepth?: number;
  maxRules?: number;
  maxActionsPerRule?: number;
}

interface StrategyCompiledRequirements {
  orderBook: boolean;
  account: boolean;
  positions: boolean;
  market: boolean;
  trades: boolean;
  timerIntervalsMs: number[];
}

type StrategyDeepReadonly<T> = T extends readonly (infer Item)[]
  ? readonly StrategyDeepReadonly<Item>[]
  : T extends object
    ? { readonly [Key in keyof T]: StrategyDeepReadonly<T[Key]> }
    : T;

declare const compiledStrategyPlanBrand: unique symbol;

interface CompiledStrategyPlan {
  readonly [compiledStrategyPlanBrand]: true;
  readonly schemaVersion: typeof STRATEGY_AST_SCHEMA_VERSION;
  readonly definitionHash: string;
  readonly document: StrategyDeepReadonly<StrategyAstDocument>;
  readonly requirements: StrategyDeepReadonly<StrategyCompiledRequirements>;
  readonly nodeCount: number;
}

type StrategyAstCompileResult =
  | {
      readonly status: 'success';
      readonly plan: CompiledStrategyPlan;
      readonly diagnostics: StrategyDiagnostic[];
    }
  | {
      readonly status: 'failed';
      readonly plan: null;
      readonly diagnostics: StrategyDiagnostic[];
    };

interface StrategyEvaluationEventBase {
  sequence: number;
  occurredAt: string;
}

type StrategyEvaluationEvent =
  | (StrategyEvaluationEventBase & {
      kind: Exclude<StrategyTriggerNode['kind'], 'timer.interval'>;
      intervalMs?: never;
    })
  | (StrategyEvaluationEventBase & {
      kind: 'timer.interval';
      intervalMs: number;
    });

interface StrategyOrderBookReferenceValues {
  bestBid?: string | null;
  bestAsk?: string | null;
  midpoint?: string | null;
  spread?: string | null;
  tickSize?: string;
}

interface StrategyAccountReferenceValues {
  availableBalance?: string;
  openOrderCount?: number;
}

interface StrategyPositionReferenceValues {
  size?: string | null;
  averagePrice?: string | null;
  currentValue?: string | null;
  cashPnl?: string | null;
}

interface StrategyMarketReferenceValues {
  active?: boolean;
  closed?: boolean;
  volume?: string;
  volume24hr?: string;
  liquidity?: string;
}

interface StrategyTradeReferenceValues {
  price?: string | null;
  size?: string | null;
  side?: 'BUY' | 'SELL' | null;
}

interface StrategyReferenceValues {
  orderBook?: StrategyOrderBookReferenceValues;
  account?: StrategyAccountReferenceValues;
  position?: StrategyPositionReferenceValues;
  market?: StrategyMarketReferenceValues;
  trade?: StrategyTradeReferenceValues;
}

interface StrategyRuleRuntimeState {
  pending: boolean;
  lastTriggeredAt: string | null;
}

type StrategyEvaluationRuntimeSnapshot =
  | {
      mode: 'initialize';
    }
  | {
      mode: 'resume';
      state: Record<string, StrategyRuntimeValue>;
      rules: Record<string, StrategyRuleRuntimeState>;
    };

interface StrategyEvaluationInput {
  strategyInstanceId: string;
  event: StrategyEvaluationEvent;
  parameters: Record<string, StrategyRuntimeValue>;
  references: StrategyReferenceValues;
  runtime: StrategyEvaluationRuntimeSnapshot;
}

interface StrategyEvaluationStepBase {
  idempotencyKey: string;
  ruleId: string;
  actionId: string;
}

type StrategyStateChange = StrategyEvaluationStepBase &
  (
    | {
        kind: 'state.set';
        name: string;
        previousValue: StrategyRuntimeValue;
        value: StrategyRuntimeValue;
      }
    | {
        kind: 'state.increment';
        name: string;
        previousValue: StrategyRuntimeValue;
        amount: string;
        value: StrategyRuntimeValue;
      }
  );

type StrategyActionIntent = StrategyEvaluationStepBase &
  (
    | {
        kind: 'order.place';
        asset: 'selected';
        side: 'BUY' | 'SELL';
        order:
          | {
              orderType: 'limit';
              price: string;
              shares: string;
              postOnly: boolean;
              expiration?: number;
            }
          | {
              orderType: 'market';
              amount: string;
              marketOrderType: 'FOK' | 'FAK';
            };
      }
    | {
        kind: 'log.write';
        level: 'debug' | 'info' | 'warn' | 'error';
        message: string;
      }
    | {
        kind: 'strategy.stop';
        reason: string;
      }
  );

type StrategyEvaluationStep = StrategyStateChange | StrategyActionIntent;

/*
 * State steps intentionally stay in the same ordered sequence as trading actions.
 * The runtime must apply each step only after all preceding steps have succeeded.
 */
interface StrategyEvaluationTrace {
  ruleId: string;
  status:
    | 'not-triggered'
    | 'condition-false'
    | 'skipped-pending'
    | 'skipped-cooldown'
    | 'skipped-first-match'
    | 'matched';
}

interface StrategyEvaluationResult {
  evaluationId: string;
  matchedRuleIds: string[];
  statePreview: Record<string, StrategyRuntimeValue>;
  steps: StrategyEvaluationStep[];
  trace: StrategyEvaluationTrace[];
}

export { STRATEGY_AST_SCHEMA_VERSION };
export type {
  CompiledStrategyPlan,
  StrategyActionIntent,
  StrategyActionNode,
  StrategyArithmeticNode,
  StrategyAstCompileResult,
  StrategyAstCompilerOptions,
  StrategyAstDocument,
  StrategyBooleanLiteralNode,
  StrategyCompareNode,
  StrategyCompareOperator,
  StrategyCompiledRequirements,
  StrategyDecimalLiteralNode,
  StrategyDeepReadonly,
  StrategyDiagnostic,
  StrategyDiagnosticSeverity,
  StrategyDurationLiteralNode,
  StrategyEvaluationEvent,
  StrategyEvaluationInput,
  StrategyEvaluationRuntimeSnapshot,
  StrategyEvaluationResult,
  StrategyEvaluationStep,
  StrategyEvaluationTrace,
  StrategyExistsNode,
  StrategyExpressionNode,
  StrategyIncrementStateAction,
  StrategyIntegerLiteralNode,
  StrategyLimitOrderSpec,
  StrategyLiteralNode,
  StrategyLogAction,
  StrategyLogicalNode,
  StrategyMarketOrderSpec,
  StrategyNodeBase,
  StrategyNotNode,
  StrategyOrderSideLiteralNode,
  StrategyParameterDefinition,
  StrategyParameterNode,
  StrategyPlaceOrderAction,
  StrategyReferenceNode,
  StrategyReferenceValues,
  StrategyRiskPolicy,
  StrategyRule,
  StrategyRulePolicy,
  StrategyRuleRuntimeState,
  StrategyRuntimeValue,
  StrategySetStateAction,
  StrategyStateChange,
  StrategyStateDefinition,
  StrategyStateNode,
  StrategyStopAction,
  StrategyStringLiteralNode,
  StrategyTimestampLiteralNode,
  StrategyTriggerNode,
  StrategyValueType,
};
