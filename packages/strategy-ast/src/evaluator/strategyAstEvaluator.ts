import type Decimal from 'decimal.js';
import { StrategyReferenceCatalog } from '../compiler/strategyReferenceCatalog.js';
import {
  StrategyTypeSystem,
  type StrategyValueDescriptor,
} from '../compiler/strategyTypeSystem.js';
import { compiledStrategyPlanRegistry } from '../compiler/compiledStrategyPlanRegistry.js';
import { StrategyDecimal } from '../math/strategyDecimal.js';
import { timestampStringSchema } from '../schema/strategyValueSchemas.js';
import { StrategyEvaluationError } from './strategyEvaluationError.js';
import type {
  CompiledStrategyPlan,
  StrategyActionNode,
  StrategyAstDocument,
  StrategyEvaluationInput,
  StrategyEvaluationResult,
  StrategyEvaluationStep,
  StrategyExpressionNode,
  StrategyReferenceNode,
  StrategyRule,
  StrategyRuleRuntimeState,
  StrategyRuntimeValue,
  StrategyStateDefinition,
} from '../types.js';

interface StrategyEvaluationContext {
  document: StrategyAstDocument;
  evaluationId: string;
  event: StrategyEvaluationInput['event'];
  parameters: Record<string, StrategyRuntimeValue>;
  state: Record<string, StrategyRuntimeValue>;
  references: StrategyEvaluationInput['references'];
  descriptors: Map<string, StrategyValueDescriptor>;
}

class StrategyAstEvaluator {
  private readonly _references = new StrategyReferenceCatalog();
  private readonly _types = new StrategyTypeSystem();
  private readonly _eventKinds = new Set<string>([
    'strategy.started',
    'strategy.stopping',
    'orderBook.changed',
    'trade.received',
    'account.changed',
    'timer.interval',
  ]);
  private readonly _referenceFieldNames = {
    orderBook: new Set<string>(['bestBid', 'bestAsk', 'midpoint', 'spread', 'tickSize']),
    account: new Set<string>(['availableBalance', 'openOrderCount']),
    position: new Set<string>(['size', 'averagePrice', 'currentValue', 'cashPnl']),
    market: new Set<string>(['active', 'closed', 'volume', 'volume24hr', 'liquidity']),
    trade: new Set<string>(['price', 'size', 'side']),
  };

  public evaluate(
    plan: CompiledStrategyPlan,
    input: StrategyEvaluationInput,
  ): StrategyEvaluationResult {
    if (!compiledStrategyPlanRegistry.contains(plan)) {
      throw new StrategyEvaluationError(
        'UNTRUSTED_COMPILED_PLAN',
        'Strategy plans must be compiled in this process before evaluation',
      );
    }
    this._validateInputContainers(input);
    this._validateStrategyInstanceId(input.strategyInstanceId);
    this._validateEvent(input);
    this._validateReferenceShape(input);
    const document = plan.document as unknown as StrategyAstDocument;
    this._validateRuntimeSnapshot(document, input);
    const evaluationId = this._evaluationId(plan, input);
    const context: StrategyEvaluationContext = {
      document,
      evaluationId,
      event: input.event,
      parameters: this._resolveParameters(document, input.parameters),
      state: this._resolveState(document, input),
      references: input.references,
      descriptors: new Map<string, StrategyValueDescriptor>(),
    };
    const matchedRuleIds: string[] = [];
    const steps: StrategyEvaluationStep[] = [];
    const trace: StrategyEvaluationResult['trace'] = [];
    let hasMatched = false;

    for (const rule of document.rules) {
      if (hasMatched) {
        trace.push({ ruleId: rule.id, status: 'skipped-first-match' });
        continue;
      }
      if (!this._matchesTrigger(rule, input)) {
        trace.push({ ruleId: rule.id, status: 'not-triggered' });
        continue;
      }
      const runtime = this._ruleRuntime(input, rule.id);
      if (runtime?.pending === true) {
        trace.push({ ruleId: rule.id, status: 'skipped-pending' });
        continue;
      }
      if (this._isInCooldown(rule, input)) {
        trace.push({ ruleId: rule.id, status: 'skipped-cooldown' });
        continue;
      }
      if (rule.condition && this._evaluateExpression(rule.condition, context) !== true) {
        trace.push({ ruleId: rule.id, status: 'condition-false' });
        continue;
      }

      this._evaluateActions(rule, context, steps);
      matchedRuleIds.push(rule.id);
      trace.push({ ruleId: rule.id, status: 'matched' });
      hasMatched = true;
    }

    return {
      evaluationId,
      matchedRuleIds,
      statePreview: { ...context.state },
      steps,
      trace,
    };
  }

  private _validateStrategyInstanceId(strategyInstanceId: string): void {
    if (
      typeof strategyInstanceId !== 'string' ||
      strategyInstanceId.length === 0 ||
      strategyInstanceId.length > 128 ||
      !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(strategyInstanceId)
    ) {
      throw new StrategyEvaluationError(
        'INVALID_STRATEGY_INSTANCE_ID',
        'Strategy instance ID must be a stable identifier of at most 128 characters',
      );
    }
  }

  private _validateInputContainers(input: StrategyEvaluationInput): void {
    if (!this._isRecord(input)) {
      throw new StrategyEvaluationError(
        'INVALID_EVALUATION_INPUT',
        'Strategy evaluation input must be an object',
      );
    }
    if (!this._isRecord(input.parameters)) {
      throw new StrategyEvaluationError(
        'INVALID_PARAMETERS',
        'Strategy parameters must be an object',
      );
    }
    if (!this._isRecord(input.references)) {
      throw new StrategyEvaluationError(
        'INVALID_REFERENCES',
        'Strategy references must be an object',
      );
    }
    if (!this._isRecord(input.runtime)) {
      throw new StrategyEvaluationError(
        'INVALID_RUNTIME_SNAPSHOT',
        'Strategy runtime snapshot must be an object',
      );
    }
    if (input.runtime.mode === 'initialize') {
      if (Object.keys(input.runtime).some((key) => key !== 'mode')) {
        throw new StrategyEvaluationError(
          'INVALID_RUNTIME_SNAPSHOT',
          'Initialize snapshots cannot contain persisted state',
        );
      }
      return;
    }
    if (
      input.runtime.mode !== 'resume' ||
      !this._isRecord(input.runtime.state) ||
      !this._isRecord(input.runtime.rules)
    ) {
      throw new StrategyEvaluationError(
        'INVALID_RUNTIME_SNAPSHOT',
        'Resume snapshots require state and rule runtime objects',
      );
    }
  }

  private _isRecord(value: unknown): value is Record<string, unknown> {
    return value != null && typeof value === 'object' && !Array.isArray(value);
  }

  private _evaluationId(plan: CompiledStrategyPlan, input: StrategyEvaluationInput): string {
    return [
      'strategy-evaluation-v1',
      encodeURIComponent(input.strategyInstanceId),
      plan.definitionHash,
      input.event.sequence,
    ].join(':');
  }

  private _validateEvent(input: StrategyEvaluationInput): void {
    if (!this._isRecord(input.event)) {
      throw new StrategyEvaluationError('INVALID_EVENT', 'Strategy event must be an object');
    }
    if (!this._eventKinds.has(input.event.kind)) {
      throw new StrategyEvaluationError(
        'INVALID_EVENT_KIND',
        `Unsupported strategy event kind: ${String(input.event.kind)}`,
      );
    }
    if (!Number.isSafeInteger(input.event.sequence) || input.event.sequence < 0) {
      throw new StrategyEvaluationError(
        'INVALID_EVENT_SEQUENCE',
        'Event sequence must be a non-negative safe integer',
      );
    }
    if (typeof input.event.occurredAt !== 'string' || !this._isTimestamp(input.event.occurredAt)) {
      throw new StrategyEvaluationError(
        'INVALID_EVENT_TIMESTAMP',
        'Event occurredAt must be a valid timestamp',
      );
    }
    if (
      input.event.kind === 'timer.interval' &&
      (!Number.isSafeInteger(input.event.intervalMs) || (input.event.intervalMs ?? 0) <= 0)
    ) {
      throw new StrategyEvaluationError(
        'INVALID_TIMER_INTERVAL',
        'Timer events must include a positive safe integer intervalMs',
      );
    }
    if (input.event.kind !== 'timer.interval' && input.event.intervalMs !== undefined) {
      throw new StrategyEvaluationError(
        'UNEXPECTED_TIMER_INTERVAL',
        'Only timer events may include intervalMs',
      );
    }
  }

  private _resolveParameters(
    document: StrategyAstDocument,
    supplied: Record<string, StrategyRuntimeValue>,
  ): Record<string, StrategyRuntimeValue> {
    this._rejectUnknownNames('parameter', document.parameters, supplied);
    const resolved: Record<string, StrategyRuntimeValue> = {};
    for (const [name, definition] of Object.entries(document.parameters)) {
      let value: StrategyRuntimeValue;
      if (Object.hasOwn(supplied, name)) {
        value = supplied[name] ?? null;
      } else if (definition.defaultValue !== undefined) {
        value = definition.defaultValue;
      } else if (definition.nullable === true) {
        value = null;
      } else {
        throw new StrategyEvaluationError(
          'MISSING_PARAMETER',
          `Missing required strategy parameter: ${name}`,
        );
      }
      const descriptor = this._types.descriptor(definition.type, definition.nullable === true);
      if (!this._types.validateValue(value, descriptor)) {
        throw new StrategyEvaluationError(
          'INVALID_PARAMETER',
          `Invalid value for strategy parameter ${name}; expected ${definition.type}`,
        );
      }
      this._validateParameterBounds(name, value, definition);
      resolved[name] = value;
    }
    return resolved;
  }

  private _resolveState(
    document: StrategyAstDocument,
    input: StrategyEvaluationInput,
  ): Record<string, StrategyRuntimeValue> {
    if (input.runtime.mode === 'initialize') {
      return Object.fromEntries(
        Object.entries(document.state).map(([name, definition]) => [name, definition.initialValue]),
      );
    }
    const supplied = input.runtime.state;
    this._rejectUnknownNames('state', document.state, supplied);
    const resolved: Record<string, StrategyRuntimeValue> = {};
    for (const [name, definition] of Object.entries(document.state)) {
      if (!Object.hasOwn(supplied, name)) {
        throw new StrategyEvaluationError(
          'MISSING_STATE',
          `Missing persisted strategy state: ${name}`,
        );
      }
      const value = supplied[name] ?? null;
      const descriptor = this._types.descriptor(definition.type, definition.nullable === true);
      if (!this._types.validateValue(value, descriptor)) {
        throw new StrategyEvaluationError(
          'INVALID_STATE',
          `Invalid value for strategy state ${name}; expected ${definition.type}`,
        );
      }
      resolved[name] = value;
    }
    return resolved;
  }

  private _validateRuntimeSnapshot(
    document: StrategyAstDocument,
    input: StrategyEvaluationInput,
  ): void {
    if (input.runtime.mode === 'initialize') return;
    const ruleIds = new Set(document.rules.map((rule) => rule.id));
    for (const ruleId of Object.keys(input.runtime.rules)) {
      if (ruleIds.has(ruleId)) continue;
      throw new StrategyEvaluationError(
        'UNKNOWN_RULE_RUNTIME',
        `Unknown persisted rule runtime: ${ruleId}`,
      );
    }
    for (const rule of document.rules) {
      if (!Object.hasOwn(input.runtime.rules, rule.id)) {
        throw new StrategyEvaluationError(
          'MISSING_RULE_RUNTIME',
          `Missing persisted runtime for rule: ${rule.id}`,
          rule.id,
        );
      }
      const runtime = input.runtime.rules[rule.id];
      if (
        !this._isRecord(runtime) ||
        typeof runtime.pending !== 'boolean' ||
        (runtime.lastTriggeredAt != null &&
          (typeof runtime.lastTriggeredAt !== 'string' ||
            !this._isTimestamp(runtime.lastTriggeredAt)))
      ) {
        throw new StrategyEvaluationError(
          'INVALID_RULE_RUNTIME',
          `Invalid persisted runtime for rule: ${rule.id}`,
          rule.id,
        );
      }
    }
  }

  private _ruleRuntime(
    input: StrategyEvaluationInput,
    ruleId: string,
  ): StrategyRuleRuntimeState | undefined {
    if (input.runtime.mode === 'initialize') return undefined;
    return input.runtime.rules[ruleId];
  }

  private _validateReferenceShape(input: StrategyEvaluationInput): void {
    const references = input.references as unknown as Record<string, unknown>;
    for (const source of Object.keys(references)) {
      if (!Object.hasOwn(this._referenceFieldNames, source)) {
        throw new StrategyEvaluationError(
          'UNKNOWN_REFERENCE_SOURCE',
          `Unknown strategy reference source: ${source}`,
        );
      }
      const group = references[source];
      if (group == null || typeof group !== 'object' || Array.isArray(group)) {
        throw new StrategyEvaluationError(
          'INVALID_REFERENCE_GROUP',
          `Strategy reference source ${source} must be an object`,
        );
      }
      const allowed = this._referenceFieldNames[source as keyof typeof this._referenceFieldNames];
      for (const field of Object.keys(group)) {
        if (allowed.has(field)) continue;
        throw new StrategyEvaluationError(
          'UNKNOWN_REFERENCE_FIELD',
          `Unknown strategy reference field: ${source}.${field}`,
        );
      }
    }
  }

  private _rejectUnknownNames(
    kind: 'parameter' | 'state',
    definitions: Record<string, unknown>,
    supplied: Record<string, StrategyRuntimeValue>,
  ): void {
    for (const name of Object.keys(supplied)) {
      if (Object.hasOwn(definitions, name)) continue;
      throw new StrategyEvaluationError(
        `UNKNOWN_${kind.toUpperCase()}`,
        `Unknown strategy ${kind}: ${name}`,
      );
    }
  }

  private _validateParameterBounds(
    name: string,
    value: StrategyRuntimeValue,
    definition: StrategyAstDocument['parameters'][string],
  ): void {
    if (value == null || (definition.minimum == null && definition.maximum == null)) return;
    const decimal = new StrategyDecimal(value as string | number);
    if (definition.minimum != null && decimal.lessThan(definition.minimum)) {
      throw new StrategyEvaluationError(
        'PARAMETER_BELOW_MINIMUM',
        `Strategy parameter ${name} is below its minimum`,
      );
    }
    if (definition.maximum != null && decimal.greaterThan(definition.maximum)) {
      throw new StrategyEvaluationError(
        'PARAMETER_ABOVE_MAXIMUM',
        `Strategy parameter ${name} is above its maximum`,
      );
    }
  }

  private _matchesTrigger(rule: StrategyRule, input: StrategyEvaluationInput): boolean {
    if (rule.trigger.kind !== input.event.kind) return false;
    if (rule.trigger.kind !== 'timer.interval') return true;
    return rule.trigger.intervalMs === input.event.intervalMs;
  }

  private _isInCooldown(rule: StrategyRule, input: StrategyEvaluationInput): boolean {
    const cooldownMs = rule.policy?.cooldownMs ?? 0;
    const lastTriggeredAt = this._ruleRuntime(input, rule.id)?.lastTriggeredAt;
    if (cooldownMs === 0 || lastTriggeredAt == null) return false;
    if (!this._isTimestamp(lastTriggeredAt)) {
      throw new StrategyEvaluationError(
        'INVALID_RULE_RUNTIME_TIMESTAMP',
        `Rule ${rule.id} has an invalid lastTriggeredAt timestamp`,
        rule.id,
      );
    }
    return Date.parse(input.event.occurredAt) - Date.parse(lastTriggeredAt) < cooldownMs;
  }

  private _evaluateActions(
    rule: StrategyRule,
    context: StrategyEvaluationContext,
    steps: StrategyEvaluationStep[],
  ): void {
    for (const action of rule.actions) {
      this._evaluateAction(rule.id, action, context, steps);
      if (action.kind === 'strategy.stop') break;
    }
  }

  private _evaluateAction(
    ruleId: string,
    action: StrategyActionNode,
    context: StrategyEvaluationContext,
    steps: StrategyEvaluationStep[],
  ): void {
    if (action.kind === 'order.place') {
      steps.push(this._evaluatePlaceOrder(ruleId, action, context));
      return;
    }
    if (action.kind === 'state.set') {
      this._evaluateStateSet(ruleId, action, context, steps);
      return;
    }
    if (action.kind === 'state.increment') {
      this._evaluateStateIncrement(ruleId, action, context, steps);
      return;
    }
    if (action.kind === 'log.write') {
      steps.push({
        kind: action.kind,
        ...this._stepIdentity(context, ruleId, action.id),
        level: action.level,
        message: action.message,
      });
      return;
    }
    steps.push({
      kind: action.kind,
      ...this._stepIdentity(context, ruleId, action.id),
      reason: action.reason ?? 'Strategy requested a stop',
    });
  }

  private _evaluatePlaceOrder(
    ruleId: string,
    action: Extract<StrategyActionNode, { kind: 'order.place' }>,
    context: StrategyEvaluationContext,
  ): Extract<StrategyEvaluationStep, { kind: 'order.place' }> {
    if (action.order.orderType === 'limit') {
      const price = this._positiveDecimal(
        this._evaluateExpression(action.order.price, context),
        action.order.price.id,
        'Limit order price',
      );
      if (new StrategyDecimal(price).greaterThan(1)) {
        throw new StrategyEvaluationError(
          'INVALID_LIMIT_PRICE',
          'Limit order price must be less than or equal to 1',
          action.order.price.id,
        );
      }
      const shares = this._positiveDecimal(
        this._evaluateExpression(action.order.shares, context),
        action.order.shares.id,
        'Limit order shares',
      );
      const expiration = action.order.expiration
        ? this._evaluateExpiration(action.order.expiration, context)
        : undefined;
      return {
        kind: action.kind,
        ...this._stepIdentity(context, ruleId, action.id),
        asset: action.asset,
        side: action.side,
        order: {
          orderType: action.order.orderType,
          price,
          shares,
          postOnly: action.order.postOnly === true,
          ...(expiration == null ? {} : { expiration }),
        },
      };
    }

    const amount = this._positiveDecimal(
      this._evaluateExpression(action.order.amount, context),
      action.order.amount.id,
      'Market order amount',
    );
    return {
      kind: action.kind,
      ...this._stepIdentity(context, ruleId, action.id),
      asset: action.asset,
      side: action.side,
      order: {
        orderType: action.order.orderType,
        amount,
        marketOrderType: action.order.marketOrderType ?? 'FOK',
      },
    };
  }

  private _evaluateExpiration(
    expression: StrategyExpressionNode,
    context: StrategyEvaluationContext,
  ): number {
    const value = this._evaluateExpression(expression, context);
    const descriptor = this._descriptor(expression, context);
    const expiration =
      descriptor.type === 'timestamp'
        ? Math.floor(Date.parse(value as string) / 1_000)
        : (value as number);
    if (!Number.isSafeInteger(expiration) || expiration <= 0) {
      throw new StrategyEvaluationError(
        'INVALID_ORDER_EXPIRATION',
        'Limit order expiration must be a positive Unix timestamp',
        expression.id,
      );
    }
    return expiration;
  }

  private _evaluateStateSet(
    ruleId: string,
    action: Extract<StrategyActionNode, { kind: 'state.set' }>,
    context: StrategyEvaluationContext,
    steps: StrategyEvaluationStep[],
  ): void {
    const definition = this._stateDefinition(context.document, action.name, action.id);
    const evaluated = this._evaluateExpression(action.value, context);
    const value = this._coerceAssignedValue(evaluated, definition, action.id);
    const previousValue = context.state[action.name] ?? null;
    context.state[action.name] = value;
    steps.push({
      kind: action.kind,
      ...this._stepIdentity(context, ruleId, action.id),
      name: action.name,
      previousValue,
      value,
    });
  }

  private _evaluateStateIncrement(
    ruleId: string,
    action: Extract<StrategyActionNode, { kind: 'state.increment' }>,
    context: StrategyEvaluationContext,
    steps: StrategyEvaluationStep[],
  ): void {
    const definition = this._stateDefinition(context.document, action.name, action.id);
    const previousValue = context.state[action.name] ?? null;
    const evaluatedAmount = this._evaluateExpression(action.amount, context);
    if (previousValue == null || evaluatedAmount == null) {
      throw new StrategyEvaluationError(
        'NULL_STATE_INCREMENT',
        `State ${action.name} and its increment amount must be non-null`,
        action.id,
      );
    }

    let amount: string;
    let value: StrategyRuntimeValue;
    if (definition.type === 'decimal') {
      amount = this._decimal(evaluatedAmount, action.amount.id, 'State increment amount');
      value = this._normalizeDecimal(
        new StrategyDecimal(previousValue as string).plus(new StrategyDecimal(amount)),
        action.id,
      );
    } else {
      if (
        typeof previousValue !== 'number' ||
        typeof evaluatedAmount !== 'number' ||
        !Number.isSafeInteger(previousValue) ||
        !Number.isSafeInteger(evaluatedAmount)
      ) {
        throw new StrategyEvaluationError(
          'INVALID_STATE_INCREMENT',
          `State ${action.name} requires a safe integer increment`,
          action.id,
        );
      }
      const next = previousValue + evaluatedAmount;
      if (!Number.isSafeInteger(next) || (definition.type === 'duration' && next < 0)) {
        throw new StrategyEvaluationError(
          'INVALID_STATE_INCREMENT',
          `State increment for ${action.name} is outside its valid range`,
          action.id,
        );
      }
      amount = String(evaluatedAmount);
      value = next;
    }

    context.state[action.name] = value;
    steps.push({
      kind: action.kind,
      ...this._stepIdentity(context, ruleId, action.id),
      name: action.name,
      previousValue,
      amount,
      value,
    });
  }

  private _stepIdentity(
    context: StrategyEvaluationContext,
    ruleId: string,
    actionId: string,
  ): { idempotencyKey: string; ruleId: string; actionId: string } {
    return {
      idempotencyKey: [
        context.evaluationId,
        encodeURIComponent(ruleId),
        encodeURIComponent(actionId),
      ].join(':'),
      ruleId,
      actionId,
    };
  }

  private _stateDefinition(
    document: StrategyAstDocument,
    name: string,
    nodeId: string,
  ): StrategyStateDefinition {
    if (Object.hasOwn(document.state, name)) return document.state[name];
    throw new StrategyEvaluationError('UNKNOWN_STATE', `Unknown strategy state: ${name}`, nodeId);
  }

  private _coerceAssignedValue(
    value: StrategyRuntimeValue,
    definition: StrategyStateDefinition,
    nodeId: string,
  ): StrategyRuntimeValue {
    const coerced =
      definition.type === 'decimal' && typeof value === 'number' ? String(value) : value;
    const descriptor = this._types.descriptor(definition.type, definition.nullable === true);
    if (!this._types.validateValue(coerced, descriptor)) {
      throw new StrategyEvaluationError(
        'INVALID_STATE_VALUE',
        `State value must match ${definition.type}`,
        nodeId,
      );
    }
    return coerced;
  }

  private _evaluateExpression(
    node: StrategyExpressionNode,
    context: StrategyEvaluationContext,
  ): StrategyRuntimeValue {
    switch (node.kind) {
      case 'literal.boolean':
      case 'literal.decimal':
      case 'literal.integer':
      case 'literal.string':
      case 'literal.orderSide':
      case 'literal.timestamp':
      case 'literal.duration':
        return node.value;
      case 'parameter':
        return this._namedValue('parameter', node.name, context.parameters, node.id);
      case 'state':
        return this._namedValue('state', node.name, context.state, node.id);
      case 'reference':
        return this._referenceValue(node, context);
      case 'compare':
        return this._evaluateComparison(node, context);
      case 'logical':
        if (node.operator === 'all') {
          return node.items.every((item) => this._evaluateExpression(item, context) === true);
        }
        return node.items.some((item) => this._evaluateExpression(item, context) === true);
      case 'not': {
        const value = this._evaluateExpression(node.operand, context);
        return typeof value === 'boolean' ? !value : false;
      }
      case 'arithmetic':
        return this._evaluateArithmetic(node, context);
      case 'exists':
        return this._evaluateExpression(node.operand, context) != null;
    }
  }

  private _namedValue(
    kind: 'parameter' | 'state',
    name: string,
    values: Record<string, StrategyRuntimeValue>,
    nodeId: string,
  ): StrategyRuntimeValue {
    if (Object.hasOwn(values, name)) return values[name];
    throw new StrategyEvaluationError(
      `UNKNOWN_${kind.toUpperCase()}`,
      `Unknown strategy ${kind}: ${name}`,
      nodeId,
    );
  }

  private _referenceValue(
    node: StrategyReferenceNode,
    context: StrategyEvaluationContext,
  ): StrategyRuntimeValue {
    if (node.source === 'event') {
      return node.field === 'sequence' ? context.event.sequence : context.event.occurredAt;
    }
    const metadata = this._references.get(node);
    if (!metadata) {
      throw new StrategyEvaluationError(
        'INVALID_REFERENCE',
        `Unsupported strategy reference: ${node.source}.${node.field}`,
        node.id,
      );
    }
    const group = context.references[node.source] as unknown as
      Record<string, StrategyRuntimeValue> | undefined;
    if (!group || !Object.hasOwn(group, node.field) || group[node.field] == null) {
      if (metadata.nullable) return null;
      throw new StrategyEvaluationError(
        'MISSING_REFERENCE',
        `Missing required strategy reference: ${node.source}.${node.field}`,
        node.id,
      );
    }
    const value = group[node.field] ?? null;
    if (!this._types.validateValue(value, this._types.descriptor(metadata.type, false))) {
      throw new StrategyEvaluationError(
        'INVALID_REFERENCE_VALUE',
        `Invalid value for strategy reference ${node.source}.${node.field}`,
        node.id,
      );
    }
    return value;
  }

  private _evaluateComparison(
    node: Extract<StrategyExpressionNode, { kind: 'compare' }>,
    context: StrategyEvaluationContext,
  ): boolean {
    const left = this._evaluateExpression(node.left, context);
    const right = this._evaluateExpression(node.right, context);
    if (left == null || right == null) return false;

    const leftType = this._descriptor(node.left, context).type;
    const rightType = this._descriptor(node.right, context).type;
    let comparison: number;
    if (this._types.isNumeric(leftType) && this._types.isNumeric(rightType)) {
      comparison = new StrategyDecimal(left as string | number).comparedTo(
        new StrategyDecimal(right as string | number),
      );
    } else if (leftType === 'timestamp' && rightType === 'timestamp') {
      comparison = Date.parse(left as string) - Date.parse(right as string);
    } else if (leftType === 'duration' && rightType === 'duration') {
      comparison = (left as number) - (right as number);
    } else {
      comparison = left === right ? 0 : -1;
    }

    switch (node.operator) {
      case 'eq':
        return comparison === 0;
      case 'neq':
        return comparison !== 0;
      case 'gt':
        return comparison > 0;
      case 'gte':
        return comparison >= 0;
      case 'lt':
        return comparison < 0;
      case 'lte':
        return comparison <= 0;
    }
  }

  private _evaluateArithmetic(
    node: Extract<StrategyExpressionNode, { kind: 'arithmetic' }>,
    context: StrategyEvaluationContext,
  ): StrategyRuntimeValue {
    const left = this._evaluateExpression(node.left, context);
    const right = this._evaluateExpression(node.right, context);
    if (left == null || right == null) return null;

    const descriptor = this._descriptor(node, context);
    if (descriptor.type === 'duration') {
      const result =
        node.operator === 'add'
          ? (left as number) + (right as number)
          : (left as number) - (right as number);
      if (!Number.isSafeInteger(result) || result < 0) {
        throw new StrategyEvaluationError(
          'INVALID_DURATION_RESULT',
          'Duration arithmetic must produce a non-negative safe integer',
          node.id,
        );
      }
      return result;
    }

    const leftDecimal = new StrategyDecimal(left as string | number);
    const rightDecimal = new StrategyDecimal(right as string | number);
    if (node.operator === 'divide' && rightDecimal.isZero()) {
      throw new StrategyEvaluationError('DIVISION_BY_ZERO', 'Division by zero', node.id);
    }
    const result =
      node.operator === 'add'
        ? leftDecimal.plus(rightDecimal)
        : node.operator === 'subtract'
          ? leftDecimal.minus(rightDecimal)
          : node.operator === 'multiply'
            ? leftDecimal.times(rightDecimal)
            : leftDecimal.dividedBy(rightDecimal);
    if (descriptor.type === 'integer') {
      const integer = result.toNumber();
      if (!result.isInteger() || !Number.isSafeInteger(integer)) {
        throw new StrategyEvaluationError(
          'INTEGER_OVERFLOW',
          'Integer arithmetic result must be a safe integer',
          node.id,
        );
      }
      return integer;
    }
    return this._normalizeDecimal(result, node.id);
  }

  private _descriptor(
    node: StrategyExpressionNode,
    context: StrategyEvaluationContext,
  ): StrategyValueDescriptor {
    const cached = context.descriptors.get(node.id);
    if (cached) return cached;
    const diagnostics: Parameters<StrategyTypeSystem['inferExpression']>[2] = [];
    const descriptor = this._types.inferExpression(
      context.document,
      node,
      diagnostics,
      `node:${node.id}`,
    );
    if (!descriptor || diagnostics.some((diagnostic) => diagnostic.severity === 'error')) {
      throw new StrategyEvaluationError(
        'INVALID_COMPILED_PLAN',
        `Expression ${node.id} is not valid in the compiled plan`,
        node.id,
      );
    }
    context.descriptors.set(node.id, descriptor);
    return descriptor;
  }

  private _positiveDecimal(value: StrategyRuntimeValue, nodeId: string, label: string): string {
    const normalized = this._decimal(value, nodeId, label);
    if (!new StrategyDecimal(normalized).greaterThan(0)) {
      throw new StrategyEvaluationError(
        'EXPECTED_POSITIVE_DECIMAL',
        `${label} must be positive`,
        nodeId,
      );
    }
    return normalized;
  }

  private _decimal(value: StrategyRuntimeValue, nodeId: string, label: string): string {
    if ((typeof value !== 'string' && typeof value !== 'number') || value === '') {
      throw new StrategyEvaluationError(
        'EXPECTED_DECIMAL',
        `${label} must evaluate to a decimal`,
        nodeId,
      );
    }
    try {
      return this._normalizeDecimal(new StrategyDecimal(value), nodeId);
    } catch (error) {
      if (error instanceof StrategyEvaluationError) throw error;
      throw new StrategyEvaluationError(
        'EXPECTED_DECIMAL',
        `${label} must evaluate to a finite decimal`,
        nodeId,
        { cause: error },
      );
    }
  }

  private _normalizeDecimal(value: Decimal, nodeId: string): string {
    if (!value.isFinite()) {
      throw new StrategyEvaluationError(
        'NON_FINITE_DECIMAL',
        'Decimal result must be finite',
        nodeId,
      );
    }
    if (value.e > 256 || value.e < -256) {
      throw new StrategyEvaluationError(
        'DECIMAL_RESULT_TOO_LARGE',
        'Decimal result exceeds the supported exponent range',
        nodeId,
      );
    }
    const normalized = value.isZero() ? '0' : value.toFixed();
    if (normalized.length > 256) {
      throw new StrategyEvaluationError(
        'DECIMAL_RESULT_TOO_LARGE',
        'Decimal result exceeds the supported representation size',
        nodeId,
      );
    }
    return normalized;
  }

  private _isTimestamp(value: string): boolean {
    return timestampStringSchema.safeParse(value).success;
  }
}

export { StrategyAstEvaluator };
