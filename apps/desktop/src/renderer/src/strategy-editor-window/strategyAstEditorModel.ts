import type {
  StrategyActionNode,
  StrategyAstDocument,
  StrategyCompareNode,
  StrategyExpressionNode,
  StrategyReferenceNode,
  StrategyRule,
  StrategyTriggerNode,
} from '@polytrader/strategy-ast/ast';

type StrategyEditorNode = StrategyRule['trigger'] | StrategyExpressionNode | StrategyActionNode;
type StrategyLibraryNodeKind =
  | 'trigger.orderBook'
  | 'trigger.trade'
  | 'trigger.timer'
  | 'condition.marketActive'
  | 'condition.priceComparison'
  | 'condition.accountBalance'
  | 'action.limitOrder'
  | 'action.setState'
  | 'action.writeLog';

class StrategyAstEditorModel {
  private _document: StrategyAstDocument;

  public constructor(document: StrategyAstDocument) {
    this._document = this._clone(document);
  }

  public static parse(source: string): StrategyAstDocument {
    return JSON.parse(source) as StrategyAstDocument;
  }

  public static stringify(document: StrategyAstDocument): string {
    return JSON.stringify(document, null, 2);
  }

  public get document(): StrategyAstDocument {
    return this._clone(this._document);
  }

  public get primaryRule(): StrategyRule | null {
    return this._document.rules[0] ?? null;
  }

  public findNode(nodeId: string): StrategyEditorNode | null {
    for (const rule of this._document.rules) {
      if (rule.trigger.id === nodeId) return rule.trigger;
      const condition = rule.condition ? this._findExpression(rule.condition, nodeId) : null;
      if (condition) return condition;
      const action = rule.actions.find((candidate) => candidate.id === nodeId);
      if (action) return action;
    }
    return null;
  }

  public updatePriceThreshold(nodeId: string, value: string): StrategyAstDocument {
    const node = this.findNode(nodeId);
    if (!node || node.kind !== 'compare') return this.document;
    const compare = node as StrategyCompareNode;
    if (compare.right.kind === 'parameter') {
      const parameter = this._document.parameters[compare.right.name];
      if (parameter) parameter.defaultValue = value;
    } else if (compare.right.kind === 'literal.decimal') {
      compare.right.value = value;
    }
    return this.document;
  }

  public updateCompareOperator(
    nodeId: string,
    operator: StrategyCompareNode['operator'],
  ): StrategyAstDocument {
    const node = this.findNode(nodeId);
    if (node?.kind === 'compare') node.operator = operator;
    return this.document;
  }

  public removeNode(nodeId: string): StrategyAstDocument {
    for (const rule of this._document.rules) {
      if (rule.condition?.kind === 'logical') {
        rule.condition.items = rule.condition.items.filter((item) => item.id !== nodeId);
      } else if (rule.condition?.id === nodeId) {
        delete rule.condition;
      }
      rule.actions = rule.actions.filter((action) => action.id !== nodeId);
    }
    return this.document;
  }

  public addLibraryNode(kind: StrategyLibraryNodeKind): StrategyAstDocument {
    switch (kind) {
      case 'trigger.orderBook':
        return this._replaceTrigger('orderBook.changed');
      case 'trigger.trade':
        return this._replaceTrigger('trade.received');
      case 'trigger.timer':
        return this._replaceTrigger('timer.interval');
      case 'condition.marketActive':
        return this.addMarketActiveCondition();
      case 'condition.priceComparison':
        return this._addPriceComparisonCondition();
      case 'condition.accountBalance':
        return this._addAccountBalanceCondition();
      case 'action.limitOrder':
        return this._addLimitOrderAction();
      case 'action.setState':
        return this._addSetStateAction();
      case 'action.writeLog':
        return this.addLogAction();
    }
  }

  public addMarketActiveCondition(): StrategyAstDocument {
    const rule = this.primaryRule;
    if (!rule) return this.document;
    const item: StrategyCompareNode = {
      id: this._uniqueId('condition.market.active'),
      kind: 'compare',
      operator: 'eq',
      left: {
        id: this._uniqueId('reference.market.active'),
        kind: 'reference',
        source: 'market',
        field: 'active',
      },
      right: {
        id: this._uniqueId('literal.market.active'),
        kind: 'literal.boolean',
        value: true,
      },
    };
    this._appendCondition(rule, item);
    return this.document;
  }

  public addLogAction(): StrategyAstDocument {
    const rule = this.primaryRule;
    if (!rule) return this.document;
    rule.actions.push({
      id: this._uniqueId('action.log'),
      kind: 'log.write',
      level: 'info',
      message: 'Strategy rule matched',
    });
    return this.document;
  }

  public priceThreshold(nodeId: string): string {
    const node = this.findNode(nodeId);
    if (!node || node.kind !== 'compare') return '';
    if (node.right.kind === 'parameter') {
      return String(this._document.parameters[node.right.name]?.defaultValue ?? '');
    }
    return node.right.kind === 'literal.decimal' ? node.right.value : '';
  }

  public referenceLabel(node: StrategyExpressionNode): string {
    if (node.kind === 'reference') return this._referenceLabel(node);
    if (node.kind === 'parameter') return node.name;
    if (node.kind.startsWith('literal.')) {
      return 'value' in node ? String(node.value) : node.kind;
    }
    return node.kind;
  }

  private _findExpression(
    node: StrategyExpressionNode,
    nodeId: string,
  ): StrategyExpressionNode | null {
    if (node.id === nodeId) return node;
    if (node.kind === 'compare' || node.kind === 'arithmetic') {
      return this._findExpression(node.left, nodeId) ?? this._findExpression(node.right, nodeId);
    }
    if (node.kind === 'logical') {
      for (const item of node.items) {
        const match = this._findExpression(item, nodeId);
        if (match) return match;
      }
    }
    if (node.kind === 'not' || node.kind === 'exists') {
      return this._findExpression(node.operand, nodeId);
    }
    return null;
  }

  private _replaceTrigger(kind: StrategyTriggerNode['kind']): StrategyAstDocument {
    const rule = this.primaryRule;
    if (!rule) return this.document;
    const id = rule.trigger.id;
    if (kind === 'orderBook.changed' || kind === 'trade.received') {
      rule.trigger = { id, kind, outcome: 'selected' };
    } else if (kind === 'timer.interval') {
      rule.trigger = { id, kind, intervalMs: 60_000 };
    }
    return this.document;
  }

  private _addPriceComparisonCondition(): StrategyAstDocument {
    const rule = this.primaryRule;
    if (!rule) return this.document;
    this._appendCondition(rule, {
      id: this._uniqueId('condition.price'),
      kind: 'compare',
      operator: 'lte',
      left: {
        id: this._uniqueId('reference.orderBook.bestAsk'),
        kind: 'reference',
        source: 'orderBook',
        field: 'bestAsk',
        outcome: 'selected',
      },
      right: {
        id: this._uniqueId('literal.price'),
        kind: 'literal.decimal',
        value: '0.45',
      },
    });
    return this.document;
  }

  private _addAccountBalanceCondition(): StrategyAstDocument {
    const rule = this.primaryRule;
    if (!rule) return this.document;
    this._appendCondition(rule, {
      id: this._uniqueId('condition.account.balance'),
      kind: 'compare',
      operator: 'gte',
      left: {
        id: this._uniqueId('reference.account.balance'),
        kind: 'reference',
        source: 'account',
        field: 'availableBalance',
      },
      right: {
        id: this._uniqueId('literal.account.balance'),
        kind: 'literal.decimal',
        value: '100',
      },
    });
    return this.document;
  }

  private _addLimitOrderAction(): StrategyAstDocument {
    const rule = this.primaryRule;
    if (!rule) return this.document;
    rule.actions.push({
      id: this._uniqueId('action.limitOrder'),
      kind: 'order.place',
      asset: 'selected',
      side: 'BUY',
      order: {
        orderType: 'limit',
        price: {
          id: this._uniqueId('literal.order.price'),
          kind: 'literal.decimal',
          value: '0.45',
        },
        shares: {
          id: this._uniqueId('literal.order.shares'),
          kind: 'literal.decimal',
          value: '1',
        },
        postOnly: false,
      },
    });
    return this.document;
  }

  private _addSetStateAction(): StrategyAstDocument {
    const rule = this.primaryRule;
    if (!rule) return this.document;
    let stateName = Object.entries(this._document.state).find(
      ([, definition]) => definition.type === 'boolean',
    )?.[0];
    if (!stateName) {
      stateName = this._uniqueDefinitionName('workflowState');
      this._document.state[stateName] = {
        type: 'boolean',
        initialValue: false,
      };
    }
    rule.actions.push({
      id: this._uniqueId('action.setState'),
      kind: 'state.set',
      name: stateName,
      value: {
        id: this._uniqueId('literal.state.value'),
        kind: 'literal.boolean',
        value: true,
      },
    });
    return this.document;
  }

  private _appendCondition(rule: StrategyRule, item: StrategyExpressionNode): void {
    if (!rule.condition) {
      rule.condition = item;
    } else if (rule.condition.kind === 'logical') {
      rule.condition.items.push(item);
    } else {
      rule.condition = {
        id: this._uniqueId('condition.group'),
        kind: 'logical',
        operator: 'all',
        items: [rule.condition, item],
      };
    }
  }

  private _clone(document: StrategyAstDocument): StrategyAstDocument {
    return JSON.parse(JSON.stringify(document)) as StrategyAstDocument;
  }

  private _referenceLabel(node: StrategyReferenceNode): string {
    return `${node.source}.${node.field}`;
  }

  private _uniqueId(prefix: string): string {
    const existing = new Set<string>();
    for (const rule of this._document.rules) {
      existing.add(rule.id);
      existing.add(rule.trigger.id);
      for (const action of rule.actions) existing.add(action.id);
      if (rule.condition) this._collectExpressionIds(rule.condition, existing);
    }
    if (!existing.has(prefix)) return prefix;
    let index = 2;
    while (existing.has(`${prefix}.${index}`)) index += 1;
    return `${prefix}.${index}`;
  }

  private _uniqueDefinitionName(prefix: string): string {
    if (!(prefix in this._document.state)) return prefix;
    let index = 2;
    while (`${prefix}${index}` in this._document.state) index += 1;
    return `${prefix}${index}`;
  }

  private _collectExpressionIds(node: StrategyExpressionNode, target: Set<string>): void {
    target.add(node.id);
    if (node.kind === 'compare' || node.kind === 'arithmetic') {
      this._collectExpressionIds(node.left, target);
      this._collectExpressionIds(node.right, target);
    } else if (node.kind === 'logical') {
      for (const item of node.items) this._collectExpressionIds(item, target);
    } else if (node.kind === 'not' || node.kind === 'exists') {
      this._collectExpressionIds(node.operand, target);
    }
  }
}

export { StrategyAstEditorModel };
export type { StrategyEditorNode, StrategyLibraryNodeKind };
