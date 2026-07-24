import { StrategyDecimal } from '../math/strategyDecimal.js';
import { strategyAstSchema } from '../schema/strategyAstSchema.js';
import { StrategyAstCanonicalizer } from '../serialization/strategyAstCanonicalizer.js';
import { compiledStrategyPlanRegistry } from './compiledStrategyPlanRegistry.js';
import { StrategyRequirementAnalyzer } from './strategyRequirementAnalyzer.js';
import { StrategyTypeSystem, type StrategyValueDescriptor } from './strategyTypeSystem.js';
import type {
  CompiledStrategyPlan,
  StrategyActionNode,
  StrategyAstCompileResult,
  StrategyAstCompilerOptions,
  StrategyAstDocument,
  StrategyDiagnostic,
  StrategyExpressionNode,
  StrategyParameterDefinition,
  StrategyRule,
  StrategyRuntimeValue,
  StrategyValueType,
} from '../types.js';

const DEFAULT_MAX_NODES = 500;
const DEFAULT_MAX_DEPTH = 32;
const DEFAULT_MAX_RULES = 64;
const DEFAULT_MAX_ACTIONS_PER_RULE = 32;
const ABSOLUTE_MAX_NODES = 10_000;
const ABSOLUTE_MAX_DEPTH = 64;
const ABSOLUTE_MAX_RULES = 256;
const ABSOLUTE_MAX_ACTIONS_PER_RULE = 64;
const MAX_PARAMETER_DEFINITIONS = 128;
const MAX_STATE_DEFINITIONS = 128;
const MAX_INPUT_STRING_LENGTH = 10_000;

class StrategyAstCompiler {
  private readonly _options: Required<StrategyAstCompilerOptions>;
  private readonly _canonicalizer = new StrategyAstCanonicalizer();
  private readonly _requirements = new StrategyRequirementAnalyzer();
  private readonly _types = new StrategyTypeSystem();

  public constructor(options: StrategyAstCompilerOptions = {}) {
    this._options = {
      maxNodes: this._compilerLimit(
        'maxNodes',
        options.maxNodes ?? DEFAULT_MAX_NODES,
        ABSOLUTE_MAX_NODES,
      ),
      maxDepth: this._compilerLimit(
        'maxDepth',
        options.maxDepth ?? DEFAULT_MAX_DEPTH,
        ABSOLUTE_MAX_DEPTH,
      ),
      maxRules: this._compilerLimit(
        'maxRules',
        options.maxRules ?? DEFAULT_MAX_RULES,
        ABSOLUTE_MAX_RULES,
      ),
      maxActionsPerRule: this._compilerLimit(
        'maxActionsPerRule',
        options.maxActionsPerRule ?? DEFAULT_MAX_ACTIONS_PER_RULE,
        ABSOLUTE_MAX_ACTIONS_PER_RULE,
      ),
    };
  }

  public async compile(input: unknown): Promise<StrategyAstCompileResult> {
    let preflightDiagnostics: StrategyDiagnostic[];
    try {
      preflightDiagnostics = this._preflightInput(input);
    } catch {
      return this._failedDiagnostic(
        'INPUT_INSPECTION_FAILED',
        'Strategy input could not be inspected safely',
        '$',
      );
    }
    if (preflightDiagnostics.length > 0) {
      return { status: 'failed', plan: null, diagnostics: preflightDiagnostics };
    }

    let parsed: ReturnType<typeof strategyAstSchema.safeParse>;
    try {
      parsed = strategyAstSchema.safeParse(input);
    } catch {
      return this._failedDiagnostic(
        'SCHEMA_EVALUATION_FAILED',
        'Strategy input could not be validated safely',
        '$',
      );
    }
    if (!parsed.success) {
      return {
        status: 'failed',
        plan: null,
        diagnostics: parsed.error.issues.map((issue) => ({
          code: 'SCHEMA_INVALID',
          severity: 'error',
          message: issue.message,
          nodeId: null,
          path: issue.path.length ? issue.path.join('.') : '$',
        })),
      };
    }

    try {
      const document = parsed.data;
      const diagnostics: StrategyDiagnostic[] = [];
      this._validateDocument(document, diagnostics);
      if (diagnostics.some((diagnostic) => diagnostic.severity === 'error')) {
        return { status: 'failed', plan: null, diagnostics };
      }

      const metrics = this._measureDocument(document);
      const plan = {
        schemaVersion: document.schemaVersion,
        definitionHash: await this._canonicalizer.hash(document),
        document,
        requirements: this._requirements.analyze(document),
        nodeCount: metrics.nodeCount,
      } as unknown as CompiledStrategyPlan;
      this._deepFreeze(plan);
      compiledStrategyPlanRegistry.register(plan);
      return {
        status: 'success',
        diagnostics,
        plan,
      };
    } catch {
      return this._failedDiagnostic(
        'COMPILATION_FAILED',
        'Strategy compilation failed unexpectedly',
        '$',
      );
    }
  }

  private _compilerLimit(name: string, value: number, maximum: number): number {
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new TypeError(`${name} must be a positive safe integer`);
    }
    if (value > maximum) {
      throw new TypeError(`${name} cannot exceed the hard safety limit of ${maximum}`);
    }
    return value;
  }

  private _preflightInput(input: unknown): StrategyDiagnostic[] {
    const diagnostics: StrategyDiagnostic[] = [];
    const root = this._recordValue(input);
    if (root) {
      this._preflightDefinitionCount(
        root.parameters,
        MAX_PARAMETER_DEFINITIONS,
        'parameters',
        diagnostics,
      );
      this._preflightDefinitionCount(root.state, MAX_STATE_DEFINITIONS, 'state', diagnostics);
      if (Array.isArray(root.rules) && root.rules.length > this._options.maxRules) {
        diagnostics.push({
          code: 'TOO_MANY_RULES',
          severity: 'error',
          message: `Strategy has ${root.rules.length} rules; maximum is ${this._options.maxRules}`,
          nodeId: null,
          path: 'rules',
        });
      }
    }
    if (diagnostics.length > 0) return diagnostics;

    const stack: Array<{ value: unknown; depth: number; path: string }> = [
      { value: input, depth: 0, path: '$' },
    ];
    const seen = new WeakSet<object>();
    let visitedContainers = 0;
    let visitedValues = 0;
    const maximumContainers = this._options.maxNodes * 64 + 4_096;
    const maximumValues = this._options.maxNodes * 128 + 8_192;
    while (stack.length > 0) {
      const current = stack.pop();
      if (!current) break;
      visitedValues += 1;
      if (visitedValues > maximumValues) {
        diagnostics.push({
          code: 'INPUT_TOO_LARGE',
          severity: 'error',
          message: 'Strategy input exceeds the compiler value budget',
          nodeId: null,
          path: '$',
        });
        return diagnostics;
      }
      if (typeof current.value === 'string') {
        if (current.value.length > MAX_INPUT_STRING_LENGTH) {
          diagnostics.push({
            code: 'INPUT_STRING_TOO_LONG',
            severity: 'error',
            message: `Strategy input strings cannot exceed ${MAX_INPUT_STRING_LENGTH} characters`,
            nodeId: null,
            path: current.path,
          });
          return diagnostics;
        }
        continue;
      }
      if (current.value == null || typeof current.value !== 'object') continue;
      if (seen.has(current.value)) {
        diagnostics.push({
          code: 'INPUT_NOT_JSON_TREE',
          severity: 'error',
          message: 'Strategy input must be an acyclic JSON tree',
          nodeId: null,
          path: current.path,
        });
        return diagnostics;
      }
      seen.add(current.value);
      visitedContainers += 1;
      if (visitedContainers > maximumContainers) {
        diagnostics.push({
          code: 'INPUT_TOO_LARGE',
          severity: 'error',
          message: 'Strategy input exceeds the compiler traversal budget',
          nodeId: null,
          path: '$',
        });
        return diagnostics;
      }
      if (current.depth > this._options.maxDepth + 8) {
        diagnostics.push({
          code: 'AST_TOO_DEEP',
          severity: 'error',
          message: `Strategy depth exceeds the maximum of ${this._options.maxDepth}`,
          nodeId: null,
          path: current.path,
        });
        return diagnostics;
      }

      if (Array.isArray(current.value)) {
        if (current.value.length + visitedValues > maximumValues) {
          diagnostics.push({
            code: 'INPUT_TOO_LARGE',
            severity: 'error',
            message: 'Strategy input exceeds the compiler value budget',
            nodeId: null,
            path: current.path,
          });
          return diagnostics;
        }
        current.value.forEach((value, index) => {
          stack.push({
            value,
            depth: current.depth + 1,
            path: `${current.path}[${index}]`,
          });
        });
        continue;
      }
      const entries = Object.entries(current.value);
      if (entries.length + visitedValues > maximumValues) {
        diagnostics.push({
          code: 'INPUT_TOO_LARGE',
          severity: 'error',
          message: 'Strategy input exceeds the compiler value budget',
          nodeId: null,
          path: current.path,
        });
        return diagnostics;
      }
      for (const [key, value] of entries) {
        stack.push({
          value,
          depth: current.depth + 1,
          path: current.path === '$' ? key : `${current.path}.${key}`,
        });
      }
    }
    return diagnostics;
  }

  private _preflightDefinitionCount(
    value: unknown,
    maximum: number,
    path: string,
    diagnostics: StrategyDiagnostic[],
  ): void {
    const record = this._recordValue(value);
    if (!record) return;
    const count = Object.keys(record).length;
    if (count <= maximum) return;
    diagnostics.push({
      code: 'TOO_MANY_DEFINITIONS',
      severity: 'error',
      message: `Strategy has ${count} ${path} definitions; maximum is ${maximum}`,
      nodeId: null,
      path,
    });
  }

  private _recordValue(value: unknown): Record<string, unknown> | null {
    return value != null && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  }

  private _failedDiagnostic(code: string, message: string, path: string): StrategyAstCompileResult {
    return {
      status: 'failed',
      plan: null,
      diagnostics: [{ code, severity: 'error', message, nodeId: null, path }],
    };
  }

  private _deepFreeze(value: object): void {
    const stack: object[] = [value];
    const seen = new WeakSet<object>();
    while (stack.length > 0) {
      const current = stack.pop();
      if (!current || seen.has(current)) continue;
      seen.add(current);
      for (const nested of Object.values(current)) {
        if (nested != null && typeof nested === 'object') stack.push(nested);
      }
      Object.freeze(current);
    }
  }

  private _validateDocument(
    document: StrategyAstDocument,
    diagnostics: StrategyDiagnostic[],
  ): void {
    if (document.rules.length > this._options.maxRules) {
      diagnostics.push({
        code: 'TOO_MANY_RULES',
        severity: 'error',
        message: `Strategy has ${document.rules.length} rules; maximum is ${this._options.maxRules}`,
        nodeId: null,
        path: 'rules',
      });
    }

    this._validateDefinitions(document, diagnostics);
    this._validateRiskPolicy(document, diagnostics);
    const ids = new Set<string>();
    document.rules.forEach((rule, ruleIndex) => {
      const path = `rules[${ruleIndex}]`;
      this._registerId(ids, rule.id, diagnostics, path);
      this._validateRule(document, rule, diagnostics, path, ids);
    });

    const metrics = this._measureDocument(document);
    if (metrics.nodeCount > this._options.maxNodes) {
      diagnostics.push({
        code: 'TOO_MANY_NODES',
        severity: 'error',
        message: `Strategy has ${metrics.nodeCount} nodes; maximum is ${this._options.maxNodes}`,
        nodeId: null,
        path: '$',
      });
    }
    if (metrics.maxDepth > this._options.maxDepth) {
      diagnostics.push({
        code: 'AST_TOO_DEEP',
        severity: 'error',
        message: `Strategy depth is ${metrics.maxDepth}; maximum is ${this._options.maxDepth}`,
        nodeId: null,
        path: '$',
      });
    }
  }

  private _validateDefinitions(
    document: StrategyAstDocument,
    diagnostics: StrategyDiagnostic[],
  ): void {
    for (const [name, definition] of Object.entries(document.parameters)) {
      if (definition.defaultValue !== undefined) {
        this._validateDefinedValue(
          definition.defaultValue,
          this._types.descriptor(definition.type, definition.nullable === true),
          diagnostics,
          `parameters.${name}.defaultValue`,
          `parameter ${name}`,
        );
      }
      this._validateBounds(definition, diagnostics, {
        path: `parameters.${name}`,
        label: `parameter ${name}`,
      });
    }
    for (const [name, definition] of Object.entries(document.state)) {
      this._validateDefinedValue(
        definition.initialValue,
        this._types.descriptor(definition.type, definition.nullable === true),
        diagnostics,
        `state.${name}.initialValue`,
        `state ${name}`,
      );
    }
  }

  private _validateRiskPolicy(
    document: StrategyAstDocument,
    diagnostics: StrategyDiagnostic[],
  ): void {
    for (const [name, value] of [
      ['maximumPositionShares', document.riskPolicy.maximumPositionShares],
      ['maximumOrderValue', document.riskPolicy.maximumOrderValue],
    ] as const) {
      if (value == null) continue;
      try {
        if (!new StrategyDecimal(value).greaterThan(0)) {
          throw new Error('not positive');
        }
      } catch {
        diagnostics.push({
          code: 'INVALID_RISK_LIMIT',
          severity: 'error',
          message: `${name} must be a positive decimal`,
          nodeId: null,
          path: `riskPolicy.${name}`,
        });
      }
    }
  }

  private _validateRule(
    document: StrategyAstDocument,
    rule: StrategyRule,
    diagnostics: StrategyDiagnostic[],
    path: string,
    ids: Set<string>,
  ): void {
    this._registerId(ids, rule.trigger.id, diagnostics, `${path}.trigger`);
    if (rule.actions.length > this._options.maxActionsPerRule) {
      diagnostics.push({
        code: 'TOO_MANY_ACTIONS',
        severity: 'error',
        message: `Rule has ${rule.actions.length} actions; maximum is ${this._options.maxActionsPerRule}`,
        nodeId: rule.id,
        path: `${path}.actions`,
      });
    }
    if (rule.condition) {
      const descriptor = this._validateExpression(
        document,
        rule.condition,
        diagnostics,
        `${path}.condition`,
        ids,
      );
      if (descriptor && descriptor.type !== 'boolean') {
        diagnostics.push({
          code: 'EXPECTED_BOOLEAN',
          severity: 'error',
          message: `Rule condition must be boolean, received ${descriptor.type}`,
          nodeId: rule.condition.id,
          path: `${path}.condition`,
        });
      }
    }
    rule.actions.forEach((action, actionIndex) => {
      if (action.kind === 'strategy.stop' && actionIndex !== rule.actions.length - 1) {
        diagnostics.push({
          code: 'STOP_ACTION_NOT_LAST',
          severity: 'error',
          message: 'A strategy.stop action must be the final action in its rule',
          nodeId: action.id,
          path: `${path}.actions[${actionIndex}]`,
        });
      }
      this._registerId(ids, action.id, diagnostics, `${path}.actions[${actionIndex}]`);
      this._validateAction(document, action, diagnostics, `${path}.actions[${actionIndex}]`, ids);
    });
  }

  private _validateAction(
    document: StrategyAstDocument,
    action: StrategyActionNode,
    diagnostics: StrategyDiagnostic[],
    path: string,
    ids: Set<string>,
  ): void {
    if (action.kind === 'order.place') {
      if (action.order.orderType === 'limit') {
        this._expectNumericExpression(
          document,
          action.order.price,
          diagnostics,
          `${path}.order.price`,
          ids,
        );
        this._expectNumericExpression(
          document,
          action.order.shares,
          diagnostics,
          `${path}.order.shares`,
          ids,
        );
        if (action.order.expiration) {
          const expiration = this._validateExpression(
            document,
            action.order.expiration,
            diagnostics,
            `${path}.order.expiration`,
            ids,
          );
          if (expiration && expiration.type !== 'integer' && expiration.type !== 'timestamp') {
            diagnostics.push({
              code: 'INVALID_EXPIRATION_TYPE',
              severity: 'error',
              message: `Order expiration must be integer or timestamp, received ${expiration.type}`,
              nodeId: action.order.expiration.id,
              path: `${path}.order.expiration`,
            });
          }
        }
      } else {
        this._expectNumericExpression(
          document,
          action.order.amount,
          diagnostics,
          `${path}.order.amount`,
          ids,
        );
      }
      return;
    }
    if (action.kind === 'state.set') {
      const definition = Object.hasOwn(document.state, action.name)
        ? document.state[action.name]
        : undefined;
      const value = this._validateExpression(
        document,
        action.value,
        diagnostics,
        `${path}.value`,
        ids,
      );
      if (!definition) {
        diagnostics.push({
          code: 'UNKNOWN_STATE',
          severity: 'error',
          message: `Unknown strategy state: ${action.name}`,
          nodeId: action.id,
          path,
        });
      } else if (
        value &&
        !this._types.isAssignable(
          this._types.descriptor(definition.type, definition.nullable === true),
          value,
        )
      ) {
        diagnostics.push({
          code: 'STATE_TYPE_MISMATCH',
          severity: 'error',
          message: `Cannot assign ${value.type} to state ${action.name} (${definition.type})`,
          nodeId: action.id,
          path,
        });
      }
      return;
    }
    if (action.kind === 'state.increment') {
      const definition = Object.hasOwn(document.state, action.name)
        ? document.state[action.name]
        : undefined;
      const amount = this._validateExpression(
        document,
        action.amount,
        diagnostics,
        `${path}.amount`,
        ids,
      );
      if (!definition) {
        diagnostics.push({
          code: 'UNKNOWN_STATE',
          severity: 'error',
          message: `Unknown strategy state: ${action.name}`,
          nodeId: action.id,
          path,
        });
      } else if (!this._types.isNumeric(definition.type) && definition.type !== 'duration') {
        diagnostics.push({
          code: 'EXPECTED_NUMERIC_STATE',
          severity: 'error',
          message: `State ${action.name} must be numeric or duration`,
          nodeId: action.id,
          path,
        });
      } else if (
        amount &&
        !this._types.isAssignable(
          this._types.descriptor(definition.type, false),
          this._types.descriptor(amount.type, false),
        )
      ) {
        diagnostics.push({
          code: 'STATE_INCREMENT_TYPE_MISMATCH',
          severity: 'error',
          message: `Cannot increment ${definition.type} state ${action.name} by ${amount.type}`,
          nodeId: action.id,
          path,
        });
      }
    }
  }

  private _expectNumericExpression(
    document: StrategyAstDocument,
    expression: StrategyExpressionNode,
    diagnostics: StrategyDiagnostic[],
    path: string,
    ids: Set<string>,
  ): void {
    const descriptor = this._validateExpression(document, expression, diagnostics, path, ids);
    if (descriptor && !this._types.isNumeric(descriptor.type)) {
      diagnostics.push({
        code: 'EXPECTED_NUMERIC',
        severity: 'error',
        message: `Expected numeric expression, received ${descriptor.type}`,
        nodeId: expression.id,
        path,
      });
    }
  }

  private _validateExpression(
    document: StrategyAstDocument,
    expression: StrategyExpressionNode,
    diagnostics: StrategyDiagnostic[],
    path: string,
    ids: Set<string>,
  ): StrategyValueDescriptor | null {
    this._registerExpressionIds(expression, ids, diagnostics, path);
    return this._types.inferExpression(document, expression, diagnostics, path);
  }

  private _registerExpressionIds(
    expression: StrategyExpressionNode,
    ids: Set<string>,
    diagnostics: StrategyDiagnostic[],
    path: string,
  ): void {
    this._registerId(ids, expression.id, diagnostics, path);
    if (expression.kind === 'compare' || expression.kind === 'arithmetic') {
      this._registerExpressionIds(expression.left, ids, diagnostics, `${path}.left`);
      this._registerExpressionIds(expression.right, ids, diagnostics, `${path}.right`);
      return;
    }
    if (expression.kind === 'logical') {
      expression.items.forEach((item, index) =>
        this._registerExpressionIds(item, ids, diagnostics, `${path}.items[${index}]`),
      );
      return;
    }
    if (expression.kind === 'not' || expression.kind === 'exists') {
      this._registerExpressionIds(expression.operand, ids, diagnostics, `${path}.operand`);
    }
  }

  private _registerId(
    ids: Set<string>,
    id: string,
    diagnostics: StrategyDiagnostic[],
    path: string,
  ): void {
    if (ids.has(id)) this._pushDuplicateId(diagnostics, id, path);
    ids.add(id);
  }

  private _pushDuplicateId(diagnostics: StrategyDiagnostic[], id: string, path: string): void {
    diagnostics.push({
      code: 'DUPLICATE_NODE_ID',
      severity: 'error',
      message: `Duplicate strategy node ID: ${id}`,
      nodeId: id,
      path,
    });
  }

  private _validateDefinedValue(
    value: StrategyRuntimeValue,
    descriptor: StrategyValueDescriptor,
    diagnostics: StrategyDiagnostic[],
    path: string,
    label: string,
  ): void {
    if (this._types.validateValue(value, descriptor)) return;
    diagnostics.push({
      code: 'INVALID_DEFAULT_VALUE',
      severity: 'error',
      message: `Invalid value for ${label}; expected ${descriptor.type}`,
      nodeId: null,
      path,
    });
  }

  private _validateBounds(
    definition: StrategyParameterDefinition,
    diagnostics: StrategyDiagnostic[],
    input: { path: string; label: string },
  ): void {
    const { type, minimum, maximum } = definition;
    if (minimum == null && maximum == null) return;
    if (!this._supportsBounds(type)) {
      diagnostics.push({
        code: 'INVALID_BOUNDS',
        severity: 'error',
        message: `${input.label} cannot declare bounds for type ${type}`,
        nodeId: null,
        path: input.path,
      });
      return;
    }
    if (
      (minimum != null && !this._isValidBound(type, minimum)) ||
      (maximum != null && !this._isValidBound(type, maximum))
    ) {
      diagnostics.push({
        code: 'INVALID_BOUNDS',
        severity: 'error',
        message: `${input.label} has bounds that do not match type ${type}`,
        nodeId: null,
        path: input.path,
      });
      return;
    }
    try {
      if (minimum != null && maximum != null && new StrategyDecimal(minimum).greaterThan(maximum)) {
        throw new Error('minimum exceeds maximum');
      }
      if (
        definition.defaultValue != null &&
        this._types.validateValue(
          definition.defaultValue,
          this._types.descriptor(definition.type, definition.nullable === true),
        )
      ) {
        const value = new StrategyDecimal(definition.defaultValue as string | number);
        if (
          (minimum != null && value.lessThan(minimum)) ||
          (maximum != null && value.greaterThan(maximum))
        ) {
          diagnostics.push({
            code: 'DEFAULT_OUT_OF_BOUNDS',
            severity: 'error',
            message: `${input.label} default value is outside its declared bounds`,
            nodeId: null,
            path: `${input.path}.defaultValue`,
          });
        }
      }
    } catch {
      diagnostics.push({
        code: 'INVALID_BOUNDS',
        severity: 'error',
        message: `${input.label} has invalid minimum or maximum bounds`,
        nodeId: null,
        path: input.path,
      });
    }
  }

  private _supportsBounds(type: StrategyValueType): boolean {
    return this._types.isNumeric(type) || type === 'duration';
  }

  private _isValidBound(type: StrategyValueType, value: string | number): boolean {
    if (type === 'decimal') {
      return this._types.validateValue(value, this._types.descriptor('decimal'));
    }
    if (type === 'integer') return typeof value === 'number' && Number.isSafeInteger(value);
    return (
      type === 'duration' && typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    );
  }

  private _measureDocument(document: StrategyAstDocument): {
    nodeCount: number;
    maxDepth: number;
  } {
    let nodeCount = 0;
    let maxDepth = 0;
    const visitExpression = (expression: StrategyExpressionNode, depth: number): void => {
      nodeCount += 1;
      maxDepth = Math.max(maxDepth, depth);
      if (expression.kind === 'compare' || expression.kind === 'arithmetic') {
        visitExpression(expression.left, depth + 1);
        visitExpression(expression.right, depth + 1);
      } else if (expression.kind === 'logical') {
        expression.items.forEach((item) => visitExpression(item, depth + 1));
      } else if (expression.kind === 'not' || expression.kind === 'exists') {
        visitExpression(expression.operand, depth + 1);
      }
    };
    for (const rule of document.rules) {
      nodeCount += 2;
      maxDepth = Math.max(maxDepth, 1);
      if (rule.condition) visitExpression(rule.condition, 2);
      for (const action of rule.actions) {
        nodeCount += 1;
        maxDepth = Math.max(maxDepth, 2);
        if (action.kind === 'order.place') {
          if (action.order.orderType === 'limit') {
            visitExpression(action.order.price, 3);
            visitExpression(action.order.shares, 3);
            if (action.order.expiration) visitExpression(action.order.expiration, 3);
          } else {
            visitExpression(action.order.amount, 3);
          }
        } else if (action.kind === 'state.set') {
          visitExpression(action.value, 3);
        } else if (action.kind === 'state.increment') {
          visitExpression(action.amount, 3);
        }
      }
    }
    return { nodeCount, maxDepth };
  }
}

export { StrategyAstCompiler };
