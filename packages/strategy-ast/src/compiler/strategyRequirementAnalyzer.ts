import { StrategyReferenceCatalog } from './strategyReferenceCatalog.js';
import type {
  StrategyActionNode,
  StrategyAstDocument,
  StrategyCompiledRequirements,
  StrategyExpressionNode,
} from '../types.js';

class StrategyRequirementAnalyzer {
  private readonly _references = new StrategyReferenceCatalog();

  public analyze(document: StrategyAstDocument): StrategyCompiledRequirements {
    const requirements: StrategyCompiledRequirements = {
      orderBook: false,
      account: false,
      positions: false,
      market: false,
      trades: false,
      timerIntervalsMs: [],
    };

    if (document.riskPolicy.maximumOpenOrders != null) requirements.account = true;
    if (document.riskPolicy.maximumPositionShares != null) {
      requirements.positions = true;
      requirements.account = true;
    }

    for (const rule of document.rules) {
      if (rule.trigger.kind === 'orderBook.changed') requirements.orderBook = true;
      if (rule.trigger.kind === 'trade.received') requirements.trades = true;
      if (rule.trigger.kind === 'account.changed') requirements.account = true;
      if (rule.trigger.kind === 'timer.interval') {
        requirements.timerIntervalsMs.push(rule.trigger.intervalMs);
      }
      if (rule.condition) this._visitExpression(rule.condition, requirements);
      for (const action of rule.actions) this._visitAction(action, requirements);
    }

    requirements.timerIntervalsMs = [...new Set(requirements.timerIntervalsMs)].sort(
      (left, right) => left - right,
    );
    return requirements;
  }

  private _visitAction(
    action: StrategyActionNode,
    requirements: StrategyCompiledRequirements,
  ): void {
    if (action.kind === 'order.place') {
      if (action.order.orderType === 'limit') {
        this._visitExpression(action.order.price, requirements);
        this._visitExpression(action.order.shares, requirements);
        if (action.order.expiration) {
          this._visitExpression(action.order.expiration, requirements);
        }
      } else {
        this._visitExpression(action.order.amount, requirements);
      }
      return;
    }
    if (action.kind === 'state.set') {
      this._visitExpression(action.value, requirements);
      return;
    }
    if (action.kind === 'state.increment') {
      this._visitExpression(action.amount, requirements);
    }
  }

  private _visitExpression(
    node: StrategyExpressionNode,
    requirements: StrategyCompiledRequirements,
  ): void {
    if (node.kind === 'reference') {
      const requirement = this._references.get(node)?.requirement;
      if (requirement === 'orderBook') requirements.orderBook = true;
      if (requirement === 'account') requirements.account = true;
      if (requirement === 'positions') {
        requirements.positions = true;
        requirements.account = true;
      }
      if (requirement === 'market') requirements.market = true;
      if (requirement === 'trades') requirements.trades = true;
      return;
    }
    if (node.kind === 'compare' || node.kind === 'arithmetic') {
      this._visitExpression(node.left, requirements);
      this._visitExpression(node.right, requirements);
      return;
    }
    if (node.kind === 'logical') {
      for (const item of node.items) this._visitExpression(item, requirements);
      return;
    }
    if (node.kind === 'not' || node.kind === 'exists') {
      this._visitExpression(node.operand, requirements);
    }
  }
}

export { StrategyRequirementAnalyzer };
