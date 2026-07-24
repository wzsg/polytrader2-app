import { StrategyReferenceCatalog } from './strategyReferenceCatalog.js';
import { StrategyDecimal } from '../math/strategyDecimal.js';
import { canonicalDecimalPattern, timestampStringSchema } from '../schema/strategyValueSchemas.js';
import type {
  StrategyAstDocument,
  StrategyDiagnostic,
  StrategyExpressionNode,
  StrategyRuntimeValue,
  StrategyValueType,
} from '../types.js';

interface StrategyValueDescriptor {
  type: StrategyValueType;
  nullable: boolean;
}

class StrategyTypeSystem {
  private readonly _references = new StrategyReferenceCatalog();

  public inferExpression(
    document: StrategyAstDocument,
    node: StrategyExpressionNode,
    diagnostics: StrategyDiagnostic[],
    path: string,
  ): StrategyValueDescriptor | null {
    switch (node.kind) {
      case 'literal.boolean':
        return this._descriptor('boolean');
      case 'literal.decimal':
        return this._descriptor('decimal');
      case 'literal.integer':
        return this._descriptor('integer');
      case 'literal.string':
        return this._descriptor('string');
      case 'literal.orderSide':
        return this._descriptor('orderSide');
      case 'literal.timestamp':
        return this._descriptor('timestamp');
      case 'literal.duration':
        return this._descriptor('duration');
      case 'parameter':
        return this._resolveNamedDefinition(
          Object.hasOwn(document.parameters, node.name)
            ? document.parameters[node.name]
            : undefined,
          node.id,
          path,
          'parameter',
          node.name,
          diagnostics,
        );
      case 'state':
        return this._resolveNamedDefinition(
          Object.hasOwn(document.state, node.name) ? document.state[node.name] : undefined,
          node.id,
          path,
          'state',
          node.name,
          diagnostics,
        );
      case 'reference':
        return this._resolveReference(node, diagnostics, path);
      case 'compare':
        return this._inferComparison(document, node, diagnostics, path);
      case 'logical':
        return this._inferLogical(document, node, diagnostics, path);
      case 'not':
        return this._inferNot(document, node, diagnostics, path);
      case 'arithmetic':
        return this._inferArithmetic(document, node, diagnostics, path);
      case 'exists':
        this.inferExpression(document, node.operand, diagnostics, `${path}.operand`);
        return this._descriptor('boolean');
    }
  }

  public validateValue(value: StrategyRuntimeValue, descriptor: StrategyValueDescriptor): boolean {
    if (value == null) return descriptor.nullable;
    switch (descriptor.type) {
      case 'boolean':
        return typeof value === 'boolean';
      case 'decimal':
        return typeof value === 'string' && this._isDecimal(value);
      case 'integer':
        return typeof value === 'number' && Number.isSafeInteger(value);
      case 'string':
        return typeof value === 'string';
      case 'orderSide':
        return value === 'BUY' || value === 'SELL';
      case 'timestamp':
        return typeof value === 'string' && timestampStringSchema.safeParse(value).success;
      case 'duration':
        return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
    }
  }

  public isNumeric(type: StrategyValueType): boolean {
    return type === 'decimal' || type === 'integer';
  }

  public isAssignable(expected: StrategyValueDescriptor, actual: StrategyValueDescriptor): boolean {
    if (actual.nullable && !expected.nullable) return false;
    if (expected.type === actual.type) return true;
    return expected.type === 'decimal' && actual.type === 'integer';
  }

  public descriptor(type: StrategyValueType, nullable = false): StrategyValueDescriptor {
    return this._descriptor(type, nullable);
  }

  private _resolveNamedDefinition(
    definition: { type: StrategyValueType; nullable?: boolean } | undefined,
    nodeId: string,
    path: string,
    kind: 'parameter' | 'state',
    name: string,
    diagnostics: StrategyDiagnostic[],
  ): StrategyValueDescriptor | null {
    if (!definition) {
      diagnostics.push({
        code: `UNKNOWN_${kind.toUpperCase()}`,
        severity: 'error',
        message: `Unknown strategy ${kind}: ${name}`,
        nodeId,
        path,
      });
      return null;
    }
    return this._descriptor(definition.type, definition.nullable === true);
  }

  private _resolveReference(
    node: Extract<StrategyExpressionNode, { kind: 'reference' }>,
    diagnostics: StrategyDiagnostic[],
    path: string,
  ): StrategyValueDescriptor | null {
    const metadata = this._references.get(node);
    if (!metadata) {
      diagnostics.push({
        code: 'INVALID_REFERENCE',
        severity: 'error',
        message: `Unsupported strategy reference: ${node.source}.${node.field}`,
        nodeId: node.id,
        path,
      });
      return null;
    }
    return this._descriptor(metadata.type, metadata.nullable);
  }

  private _inferComparison(
    document: StrategyAstDocument,
    node: Extract<StrategyExpressionNode, { kind: 'compare' }>,
    diagnostics: StrategyDiagnostic[],
    path: string,
  ): StrategyValueDescriptor {
    const left = this.inferExpression(document, node.left, diagnostics, `${path}.left`);
    const right = this.inferExpression(document, node.right, diagnostics, `${path}.right`);
    if (!left || !right) return this._descriptor('boolean');

    const bothNumeric = this.isNumeric(left.type) && this.isNumeric(right.type);
    const sameType = left.type === right.type;
    const validEquality = node.operator === 'eq' || node.operator === 'neq';
    const validOrderedType =
      bothNumeric || (sameType && (left.type === 'timestamp' || left.type === 'duration'));
    if ((!validEquality && !validOrderedType) || (validEquality && !sameType && !bothNumeric)) {
      diagnostics.push({
        code: 'INCOMPATIBLE_COMPARISON',
        severity: 'error',
        message: `Cannot compare ${left.type} and ${right.type} with ${node.operator}`,
        nodeId: node.id,
        path,
      });
    }
    return this._descriptor('boolean');
  }

  private _inferLogical(
    document: StrategyAstDocument,
    node: Extract<StrategyExpressionNode, { kind: 'logical' }>,
    diagnostics: StrategyDiagnostic[],
    path: string,
  ): StrategyValueDescriptor {
    node.items.forEach((item, index) => {
      const descriptor = this.inferExpression(
        document,
        item,
        diagnostics,
        `${path}.items[${index}]`,
      );
      if (descriptor && descriptor.type !== 'boolean') {
        this._pushExpectedBoolean(diagnostics, item.id, `${path}.items[${index}]`, descriptor.type);
      }
    });
    return this._descriptor('boolean');
  }

  private _inferNot(
    document: StrategyAstDocument,
    node: Extract<StrategyExpressionNode, { kind: 'not' }>,
    diagnostics: StrategyDiagnostic[],
    path: string,
  ): StrategyValueDescriptor {
    const descriptor = this.inferExpression(document, node.operand, diagnostics, `${path}.operand`);
    if (descriptor && descriptor.type !== 'boolean') {
      this._pushExpectedBoolean(diagnostics, node.id, path, descriptor.type);
    }
    return this._descriptor('boolean');
  }

  private _inferArithmetic(
    document: StrategyAstDocument,
    node: Extract<StrategyExpressionNode, { kind: 'arithmetic' }>,
    diagnostics: StrategyDiagnostic[],
    path: string,
  ): StrategyValueDescriptor {
    const left = this.inferExpression(document, node.left, diagnostics, `${path}.left`);
    const right = this.inferExpression(document, node.right, diagnostics, `${path}.right`);
    const numericOperands =
      left && right && this.isNumeric(left.type) && this.isNumeric(right.type);
    const durationOperands =
      left &&
      right &&
      left.type === 'duration' &&
      right.type === 'duration' &&
      (node.operator === 'add' || node.operator === 'subtract');
    if (left && right && !numericOperands && !durationOperands) {
      diagnostics.push({
        code: 'EXPECTED_NUMERIC',
        severity: 'error',
        message: `Invalid ${node.operator} operands: ${left.type} and ${right.type}`,
        nodeId: node.id,
        path,
      });
    }
    if (
      node.operator === 'divide' &&
      (node.right.kind === 'literal.decimal' || node.right.kind === 'literal.integer') &&
      new StrategyDecimal(node.right.value).isZero()
    ) {
      diagnostics.push({
        code: 'DIVISION_BY_ZERO',
        severity: 'error',
        message: 'Division by a literal zero is not allowed',
        nodeId: node.id,
        path,
      });
    }

    const integerResult =
      numericOperands &&
      left.type === 'integer' &&
      right.type === 'integer' &&
      node.operator !== 'divide';
    return this._descriptor(
      durationOperands ? 'duration' : integerResult ? 'integer' : 'decimal',
      Boolean(left?.nullable || right?.nullable),
    );
  }

  private _pushExpectedBoolean(
    diagnostics: StrategyDiagnostic[],
    nodeId: string,
    path: string,
    actual: StrategyValueType,
  ): void {
    diagnostics.push({
      code: 'EXPECTED_BOOLEAN',
      severity: 'error',
      message: `Expected boolean expression, received ${actual}`,
      nodeId,
      path,
    });
  }

  private _descriptor(type: StrategyValueType, nullable = false): StrategyValueDescriptor {
    return { type, nullable };
  }

  private _isDecimal(value: string): boolean {
    if (!canonicalDecimalPattern.test(value) || value.length > 256) return false;
    try {
      return new StrategyDecimal(value).isFinite();
    } catch {
      return false;
    }
  }
}

export { StrategyTypeSystem };
export type { StrategyValueDescriptor };
