import type { CompiledStrategyPlan } from '../types.js';

class CompiledStrategyPlanRegistry {
  private readonly _plans = new WeakSet<CompiledStrategyPlan>();

  public register(plan: CompiledStrategyPlan): void {
    this._plans.add(plan);
  }

  public contains(plan: CompiledStrategyPlan): boolean {
    return this._plans.has(plan);
  }
}

const compiledStrategyPlanRegistry = new CompiledStrategyPlanRegistry();

export { compiledStrategyPlanRegistry };
