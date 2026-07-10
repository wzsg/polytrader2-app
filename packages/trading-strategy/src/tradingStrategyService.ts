import { EventEmitter } from 'events';
import type {
  StrategyRunDetail,
  StrategyRunListItem,
  StrategyRunLogEntry,
  StrategyRunOrderRecord,
  StrategyRunRuntimeEvent,
  TradingStrategyState,
  TradingStrategyStateEvent,
} from '@polytrader/shared';

const DEFAULT_STRATEGY_HISTORY_LIMIT = 50;
const DEFAULT_STRATEGY_LOG_LIMIT = 300;

interface StrategyRunHistoryPort {
  getActiveByMarket(marketId: string): Promise<StrategyRunDetail | null>;
  listHistory(options: { marketId: string; limit: number }): Promise<StrategyRunListItem[]>;
  getLogs(runId: string, limit: number): Promise<StrategyRunLogEntry[]>;
  getOrders(runId: string, limit: number): Promise<StrategyRunOrderRecord[]>;
  onRuntimeEvent(callback: (event: StrategyRunRuntimeEvent) => void): () => void;
}

interface TradingStrategyServiceOptions {
  strategyHistory: StrategyRunHistoryPort;
}

interface TradingStrategyService {
  getState(marketId: string): Promise<TradingStrategyState>;
  selectRun(marketId: string, runId: string): Promise<TradingStrategyState>;
  onEvent(callback: (event: TradingStrategyStateEvent) => void): () => void;
  dispose(): void;
}

type TradingStrategyServiceEventMap = {
  state: [event: TradingStrategyStateEvent];
};

class TradingStrategyServiceImpl
  extends EventEmitter<TradingStrategyServiceEventMap>
  implements TradingStrategyService
{
  private readonly _strategyHistory: StrategyRunHistoryPort;
  private readonly _selectedRunIds = new Map<string, string>();
  private readonly _unsubscribeRuntimeEvents: () => void;

  public constructor(options: TradingStrategyServiceOptions) {
    super();
    this._strategyHistory = options.strategyHistory;
    this._unsubscribeRuntimeEvents = this._strategyHistory.onRuntimeEvent((event) => {
      if ('marketId' in event && event.marketId) void this._emitState(event.marketId);
    });
  }

  public async getState(marketId: string): Promise<TradingStrategyState> {
    return await this._createState(this._normalizeMarketId(marketId));
  }

  public async selectRun(marketId: string, runId: string): Promise<TradingStrategyState> {
    const normalizedMarketId = this._normalizeMarketId(marketId);
    this._selectedRunIds.set(normalizedMarketId, String(runId || '').trim());
    const state = await this._createState(normalizedMarketId);
    this._emitEvent(normalizedMarketId, state);
    return state;
  }

  public onEvent(callback: (event: TradingStrategyStateEvent) => void): () => void {
    this.on('state', callback);
    return () => this.off('state', callback);
  }

  public dispose(): void {
    this._unsubscribeRuntimeEvents();
    this.removeAllListeners();
    this._selectedRunIds.clear();
  }

  private _normalizeMarketId(marketId: string): string {
    const normalized = String(marketId || '').trim();
    if (!normalized) throw new Error('marketId is required');
    return normalized;
  }

  private async _createState(marketId: string): Promise<TradingStrategyState> {
    const activeRun = await this._strategyHistory.getActiveByMarket(marketId);
    const history = await this._strategyHistory.listHistory({
      marketId,
      limit: DEFAULT_STRATEGY_HISTORY_LIMIT,
    });
    const selectedRunId = this._resolveSelectedRunId(marketId, activeRun?.id || '', history);
    const [logs, orders] = selectedRunId
      ? await Promise.all([
          this._strategyHistory.getLogs(selectedRunId, DEFAULT_STRATEGY_LOG_LIMIT),
          this._strategyHistory.getOrders(selectedRunId, DEFAULT_STRATEGY_LOG_LIMIT),
        ])
      : [[], []];
    return {
      marketId,
      activeRun,
      history,
      logs,
      orders,
      selectedRunId,
      error: '',
      updatedAt: this._now(),
    };
  }

  private _resolveSelectedRunId(
    marketId: string,
    activeRunId: string,
    history: StrategyRunListItem[],
  ): string {
    const selectedRunId = this._selectedRunIds.get(marketId) || '';
    if (selectedRunId && history.some((run) => run.id === selectedRunId)) return selectedRunId;
    return activeRunId || history[0]?.id || '';
  }

  private async _emitState(marketId: string): Promise<void> {
    try {
      const state = await this.getState(marketId);
      this._emitEvent(marketId, state);
    } catch {
      // Runtime event callbacks must not break the strategy runtime event source.
    }
  }

  private _emitEvent(marketId: string, state: TradingStrategyState): void {
    this.emit('state', { marketId, strategy: state });
  }

  private _now(): string {
    return new Date().toISOString();
  }
}

export { TradingStrategyServiceImpl };
export type { StrategyRunHistoryPort, TradingStrategyService, TradingStrategyServiceOptions };
