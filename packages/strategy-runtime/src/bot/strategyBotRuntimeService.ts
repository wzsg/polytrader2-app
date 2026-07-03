import { randomUUID } from 'crypto';
import { EventEmitter } from 'events';
import type {
  Market,
  MarketDetailData,
  OrderBook,
  StrategyBotCreateInput,
  StrategyBotDetail,
  StrategyBotListItem,
  StrategyBotListParams,
  StrategyBotRuntimeEvent,
  StrategyBotStatus,
  StrategyBotUpdateInput,
  StrategyLogLevel,
  StrategyPlaceOrderInput,
  StrategyRunDetail,
  StrategyRunListItem,
  StrategyRunLogEntry,
  StrategyRunOrderRecord,
  PolymarketWalletSummary,
  TradingAccountDataEvent,
  TradingMarketEvent,
  TradingRuntimeAccountState,
  TradingMarketSnapshot,
} from '@polytrader/shared';
import type { StrategyRuntimeMarketSubscription, StrategyRuntimePorts } from '../ports.js';
import { StrategyExecutor } from '../executor/strategyExecutor.js';
import { StrategyBotRepository } from './strategyBotRepository.js';
import {
  StrategyRunRepository,
  type StrategyRow,
  type StrategyVersionRow,
} from '../run/strategyRunRepository.js';
import {
  strategyRunHistoryService,
  type StrategyRunHistoryService,
} from '../run/strategyRunHistoryService.js';
import { parseConfig } from '../utils/json.js';
import { getMarketTitle } from '../utils/market.js';
import { now } from '../utils/time.js';

type BotRuntimeEventMap = {
  'runtime-event': [event: StrategyBotRuntimeEvent];
};

interface ActiveBotRuntime {
  botId: string;
  runId: string;
  marketId: string;
  assetId: string;
  walletId: string;
  status: StrategyBotStatus;
  executor: StrategyExecutor;
  marketSubscription: StrategyRuntimeMarketSubscription;
}

interface StrategyBotRuntimeServiceOptions {
  ports: StrategyRuntimePorts;
  repository?: StrategyBotRepository;
  runRepository?: StrategyRunRepository;
  runHistoryService?: StrategyRunHistoryService;
}

interface StrategyRuntimeOutcome extends Omit<MarketDetailData['outcomes'][number], 'tickSize'> {
  tickSize: number | null;
}

interface StrategyRuntimeOrderBook extends Omit<OrderBook, 'tickSize'> {
  tickSize: number;
}

interface StrategyRuntimeSnapshotForSandbox extends Omit<TradingMarketSnapshot, 'orderBooks'> {
  orderBooks: StrategyRuntimeOrderBook[];
}

const ACTIVE_STATUSES: StrategyBotStatus[] = ['starting', 'running', 'stopping'];
class StrategyBotRuntimeService extends EventEmitter<BotRuntimeEventMap> {
  private readonly _active = new Map<string, ActiveBotRuntime>();
  private readonly _repository: StrategyBotRepository;
  private readonly _runRepository: StrategyRunRepository;
  private readonly _runHistory: StrategyRunHistoryService;
  private readonly _ports: StrategyRuntimePorts;
  private readonly _unsubscribeAccountEvents: () => void;

  public constructor(options: StrategyBotRuntimeServiceOptions) {
    super();
    this._ports = options.ports;
    this._runRepository = options.runRepository ?? new StrategyRunRepository();
    this._repository = options.repository ?? new StrategyBotRepository();
    this._runHistory = options.runHistoryService ?? strategyRunHistoryService;
    this._unsubscribeAccountEvents = this._ports.accounts.onDataEvent((event) => {
      this.dispatchTradingAccountEvent(event);
    });
  }

  public init(): void {
    void this._repository.markUnfinishedBotsInterrupted().catch((error) => {
      console.warn('Failed to mark unfinished bots interrupted', error);
    });
    void this.startAutoStartBots().catch((error) => {
      console.warn('Failed to start auto-start bots', error);
    });
  }

  public dispose(): void {
    this._unsubscribeAccountEvents();
  }

  public listBots(params?: StrategyBotListParams): Promise<StrategyBotListItem[]> {
    return this._repository.list(params);
  }

  public async createBot(input: StrategyBotCreateInput): Promise<StrategyBotDetail> {
    const bot = await this._repository.create(input);
    this.emitBotEvent({ type: 'bots:changed', marketId: bot.marketId, botId: bot.id });
    return bot;
  }

  public async updateBot(input: StrategyBotUpdateInput): Promise<StrategyBotDetail> {
    const bot = await this._repository.update(input);
    this.emitBotEvent({ type: 'bots:changed', marketId: bot.marketId, botId: bot.id });
    return bot;
  }

  public async deleteBot(id: string): Promise<void> {
    const bot = await this._repository.get(id);
    if (this._active.has(id)) {
      await this.stopBot(id);
    }
    await this._repository.delete(id);
    this.emitBotEvent({ type: 'bots:changed', marketId: bot.marketId, botId: id });
  }

  public getActiveRun(id: string): Promise<StrategyRunDetail | null> {
    return this._repository.getActiveRun(id);
  }

  public async listRuns(botId: string, limit?: number): Promise<StrategyRunListItem[]> {
    await this._repository.get(botId);
    return this._runRepository.listRuns({ botId, limit: limit || 100 });
  }

  public getLogs(runId: string, limit?: number): Promise<StrategyRunLogEntry[]> {
    return this._runRepository.listLogs(runId, limit);
  }

  public getOrders(runId: string, limit?: number): Promise<StrategyRunOrderRecord[]> {
    return this._runRepository.listOrders(runId, limit);
  }

  public async startBot(id: string): Promise<StrategyBotDetail> {
    const existing = this._active.get(id);
    if (existing && ACTIVE_STATUSES.includes(existing.status)) {
      return await this._repository.get(id);
    }

    const bot = await this._repository.get(id);
    if (!bot.enabled) throw new Error('Bot is disabled');

    let runtime: ActiveBotRuntime | null = null;
    let marketSubscription: StrategyRuntimeMarketSubscription | null = null;
    try {
      const startingBot = await this._repository.updateRuntimeStatus(id, 'starting', null, null);
      this.emitBotEvent({
        type: 'bot:status',
        botId: id,
        marketId: bot.marketId,
        status: 'starting',
        activeRunId: null,
      });

      const marketSubscribeResult = await this._ports.marketRuntime.subscribe(
        {
          marketId: bot.marketId,
          eventId: bot.eventId,
          tokenId: bot.assetId,
          outcome: null,
        },
        {
          startOrderBook: true,
          startMarketTradeSync: true,
          loadStrategy: true,
          loadPriceHistory: true,
        },
      );
      marketSubscription = marketSubscribeResult.subscription;
      const snapshot = marketSubscribeResult.snapshot;

      const marketDetail = snapshot.marketDetail;
      if (!marketDetail) throw new Error('Failed to start bot: market detail is unavailable');
      this.assertSelectedOutcomeAvailable(marketDetail, bot.assetId);
      const strategy = await this._runRepository.getStrategyRow(bot.strategyId);
      const version = await this._runRepository.resolveStrategyVersion(
        strategy,
        bot.strategyVersion,
      );
      const strategyVersion = this.runtimeVersionNumber(version, strategy);
      const compiledCode = this.runtimeCompiledCode(version);
      const sourceCode = this.runtimeSourceCode(version);
      const accountCredential = await this._ports.accounts.getCredential(bot.walletId);
      this.assertPolymarketWalletCredentialsConfigured(accountCredential);
      const account = await this._ports.accounts.getSummary(bot.walletId);
      const config = parseConfig(bot.config);
      const runId = randomUUID();
      const startedAt = now();
      const assetId = bot.assetId;

      await this._runRepository.createRun({
        id: runId,
        botId: bot.id,
        marketId: bot.marketId,
        eventId: bot.eventId,
        conditionId: marketDetail.market.conditionId || bot.conditionId || null,
        marketSnapshot: marketDetail.market,
        outcomesSnapshot: marketDetail.outcomes,
        assetId,
        strategy,
        version,
        strategyVersion,
        sourceCode,
        compiledCode,
        walletId: account.id,
        walletName: account.name,
        config: bot.config,
        startedAt,
      });

      const context = this.createStrategyContext({
        bot: startingBot,
        runId,
        startedAt,
        marketDetail,
        assetId,
        account,
        strategy,
        strategyVersion,
        config,
      });
      const executor = new StrategyExecutor(compiledCode, context, {
        runtimePaths: this._ports.executor.getRuntimePaths(),
        hostCall: (method, args) =>
          this.handleHostCall({
            method,
            args,
            bot,
            runId,
            marketId: bot.marketId,
            walletId: account.id,
            strategyId: strategy.id,
            strategyVersion,
          }),
      });

      runtime = {
        botId: bot.id,
        runId,
        marketId: bot.marketId,
        assetId,
        walletId: account.id,
        status: 'starting',
        executor,
        marketSubscription,
      };
      this._active.set(bot.id, runtime);
      marketSubscription.onEvent((event) => {
        this.dispatchTradingMarketEvent(event);
      });
      this._runHistory.emitRuntimeEvent({
        type: 'strategy-run:status',
        runId,
        marketId: bot.marketId,
        status: 'starting',
      });
      await this.writeLog(bot.id, runId, bot.marketId, 'info', 'bot run starting', 'runtime');

      await executor.start();

      runtime.status = 'running';
      await this._runRepository.updateRunStatus(runId, 'running', null);
      const runningBot = await this._repository.updateRuntimeStatus(bot.id, 'running', runId, null);
      await this.writeLog(bot.id, runId, bot.marketId, 'info', 'bot run running', 'runtime');
      const walletState = await this.queryRuntimeAccountState(bot.walletId, snapshot);
      this._runHistory.emitRuntimeEvent({
        type: 'strategy-run:status',
        runId,
        marketId: bot.marketId,
        status: 'running',
      });
      this._runHistory.emitRuntimeEvent({
        type: 'strategy-runs:changed',
        marketId: bot.marketId,
      });
      this.emitBotEvent({
        type: 'bot:status',
        botId: bot.id,
        marketId: bot.marketId,
        status: 'running',
        activeRunId: runId,
      });
      this.emitBotEvent({ type: 'bots:changed', marketId: bot.marketId, botId: bot.id });
      void executor.executeCallback('onMarketData', snapshot).catch((err) => {
        void this.failRuntime(runtime!, err).catch((error) => {
          console.warn('Failed to mark bot runtime failed', error);
        });
      });
      void executor.executeCallback('onAccount', walletState).catch((err) => {
        void this.failRuntime(runtime!, err).catch((error) => {
          console.warn('Failed to mark bot runtime failed', error);
        });
      });
      return runningBot;
    } catch (error) {
      if (runtime) {
        await this.failRuntime(runtime, error).catch(() => undefined);
      } else {
        marketSubscription?.unsubscribe();
        const message = error instanceof Error ? error.message : String(error);
        await this._repository.updateRuntimeStatus(bot.id, 'error', null, message);
        this.emitBotEvent({
          type: 'bot:status',
          botId: bot.id,
          marketId: bot.marketId,
          status: 'error',
          activeRunId: null,
          error: message,
        });
        this.emitBotEvent({ type: 'bots:changed', marketId: bot.marketId, botId: bot.id });
      }
      throw error;
    }
  }

  public async stopBot(id: string): Promise<StrategyBotDetail> {
    const bot = await this._repository.get(id);
    const runtime = this._active.get(id);
    if (!runtime) {
      if (ACTIVE_STATUSES.includes(bot.status)) {
        return await this._repository.updateRuntimeStatus(id, 'stopped', null, null);
      }
      return bot;
    }

    runtime.status = 'stopping';
    await this._repository.updateRuntimeStatus(id, 'stopping', runtime.runId, null);
    this.emitBotEvent({
      type: 'bot:status',
      botId: id,
      marketId: runtime.marketId,
      status: 'stopping',
      activeRunId: runtime.runId,
    });
    this._runHistory.emitRuntimeEvent({
      type: 'strategy-run:status',
      runId: runtime.runId,
      marketId: runtime.marketId,
      status: 'stopping',
    });
    await this._runRepository.updateRunStatus(runtime.runId, 'stopping', null);
    await this.writeLog(id, runtime.runId, runtime.marketId, 'info', 'bot run stopping', 'runtime');

    try {
      await runtime.executor.stop();
      this._active.delete(id);
      runtime.marketSubscription.unsubscribe();
      await this._runRepository.updateRunStatus(runtime.runId, 'stopped', null, now());
      const stoppedBot = await this._repository.updateRuntimeStatus(id, 'stopped', null, null);
      await this.writeLog(
        id,
        runtime.runId,
        runtime.marketId,
        'info',
        'bot run stopped',
        'runtime',
      );
      this._runHistory.emitRuntimeEvent({
        type: 'strategy-run:status',
        runId: runtime.runId,
        marketId: runtime.marketId,
        status: 'stopped',
        error: null,
      });
      this._runHistory.emitRuntimeEvent({
        type: 'strategy-runs:changed',
        marketId: runtime.marketId,
      });
      this.emitBotEvent({
        type: 'bot:status',
        botId: id,
        marketId: runtime.marketId,
        status: 'stopped',
        activeRunId: null,
      });
      this.emitBotEvent({ type: 'bots:changed', marketId: runtime.marketId, botId: id });
      return stoppedBot;
    } catch (error) {
      await this.failRuntime(runtime, error);
      throw error;
    }
  }

  public async stopAll(): Promise<void> {
    await Promise.allSettled([...this._active.keys()].map((id) => this.stopBot(id)));
  }

  private async startAutoStartBots(): Promise<void> {
    const bots = await this._repository.list({ autoStart: true, enabled: true, limit: 1_000 });
    for (const bot of bots) {
      try {
        await this.startBot(bot.id);
      } catch (error) {
        console.warn(`Failed to auto-start bot: ${bot.id}`, error);
      }
    }
  }

  private createStrategyContext(input: {
    bot: StrategyBotDetail;
    runId: string;
    startedAt: string;
    marketDetail: MarketDetailData;
    assetId: string;
    account: PolymarketWalletSummary;
    strategy: StrategyRow;
    strategyVersion: number;
    config: Record<string, unknown>;
  }): Record<string, unknown> {
    return {
      bot: {
        id: input.bot.id,
        name: input.bot.name,
        marketId: input.bot.marketId,
        eventId: input.bot.eventId,
        strategyId: input.strategy.id,
        strategyVersion: input.strategyVersion,
        walletId: input.account.id,
      },
      run: {
        id: input.runId,
        botId: input.bot.id,
        marketId: input.bot.marketId,
        strategyId: input.strategy.id,
        strategyVersion: input.strategyVersion,
        startedAt: input.startedAt,
      },
      market: this.toStrategyMarket(input.marketDetail.market),
      outcomes: this.toStrategyOutcomes(input.marketDetail.outcomes),
      assetId: input.assetId,
      account: this.toStrategyAccount(input.account),
      config: input.config,
    };
  }

  private assertSelectedOutcomeAvailable(marketDetail: MarketDetailData, assetId: string): void {
    if (!marketDetail.outcomes.length) {
      throw new Error('Failed to start bot: market outcomes are unavailable');
    }
    if (!marketDetail.outcomes.some((outcome) => outcome.tokenId === assetId)) {
      throw new Error('Failed to start bot: selected asset is not available in market outcomes');
    }
  }

  private async handleHostCall(input: {
    method: string;
    args: unknown[];
    bot: StrategyBotDetail;
    runId: string;
    marketId: string;
    walletId: string;
    strategyId: string;
    strategyVersion: number;
  }): Promise<unknown> {
    const { method, args, bot, runId, marketId } = input;
    switch (method) {
      case 'logger.debug':
        return this.writeLog(
          bot.id,
          runId,
          marketId,
          'debug',
          String(args[0] ?? ''),
          'strategy',
          args[1],
        );
      case 'logger.info':
        return this.writeLog(
          bot.id,
          runId,
          marketId,
          'info',
          String(args[0] ?? ''),
          'strategy',
          args[1],
        );
      case 'logger.warn':
        return this.writeLog(
          bot.id,
          runId,
          marketId,
          'warn',
          String(args[0] ?? ''),
          'strategy',
          args[1],
        );
      case 'logger.error':
        return this.writeLog(
          bot.id,
          runId,
          marketId,
          'error',
          String(args[0] ?? ''),
          'strategy',
          args[1],
        );
      case 'marketData.getSnapshot':
        return this.toStrategyRuntimeSnapshot(this._ports.marketRuntime.getSnapshot(marketId));
      case 'marketData.loadMarketDetail':
        return this.toStrategyRuntimeSnapshot(
          await this._ports.marketRuntime.loadMarketDetail(marketId),
        );
      case 'marketData.loadPriceHistory':
        return this.toStrategyRuntimeSnapshot(
          await this._ports.marketRuntime.loadPriceHistory(
            marketId,
            args[0] == null ? undefined : String(args[0]),
            args[1] == null ? undefined : Number(args[1]),
          ),
        );
      case 'marketData.loadTrades':
        return this.toStrategyRuntimeSnapshot(await this._ports.marketRuntime.loadTrades(marketId));
      case 'trading.placeOrder':
        try {
          return await this._ports.orders.placeStrategyOrder({
            walletId: input.walletId,
            runId,
            strategyId: input.strategyId,
            strategyVersion: input.strategyVersion,
            marketId,
            order: args[0] as StrategyPlaceOrderInput,
            onOrderRecord: (order) => {
              this._runHistory.emitRuntimeEvent({
                type: 'strategy-run:order',
                runId,
                marketId,
                order,
              });
              this.emitBotEvent({
                type: 'bot:order',
                botId: bot.id,
                marketId,
                runId,
                order,
              });
              void this._ports.accounts.syncAccountNow(order.walletId).catch((err) => {
                console.warn(`Failed to refresh account cache: ${order.walletId}`, err);
              });
            },
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          await this.writeLog(
            bot.id,
            runId,
            marketId,
            'error',
            `placeOrder failed: ${message}`,
            'trading',
          );
          throw error;
        }
      case 'trading.cancelOrder':
        return this._ports.orders.cancelOrder({
          walletId: input.walletId,
          exchangeOrderId: String(args[0] ?? ''),
        });
      case 'trading.cancelAllOrders':
        return this._ports.orders.cancelAllOrders({ walletId: input.walletId });
      default:
        throw new Error(`Unknown strategy bridge call: ${method}`);
    }
  }

  private async writeLog(
    botId: string,
    runId: string,
    marketId: string,
    level: StrategyLogLevel,
    message: string,
    module = 'strategy',
    data?: unknown,
  ): Promise<StrategyRunLogEntry> {
    const log = await this._runRepository.insertLog(runId, level, message, module, data);
    this._runHistory.emitRuntimeEvent({ type: 'strategy-run:log', runId, marketId, log });
    this.emitBotEvent({ type: 'bot:log', botId, marketId, runId, log });
    return log;
  }

  private dispatchTradingMarketEvent(event: TradingMarketEvent): void {
    const runtimes = [...this._active.values()].filter(
      (runtime) => runtime.marketId === event.event.marketId && runtime.status === 'running',
    );
    if (!runtimes.length) return;

    for (const runtime of runtimes) {
      switch (event.eventName) {
        case 'runtime-snapshot':
          this.dispatchCallback(
            runtime,
            'onMarketData',
            this.toStrategyRuntimeSnapshot(event.event.snapshot),
          );
          break;
        case 'market-detail':
        case 'price-history-loaded': {
          const snapshot = this._ports.marketRuntime.getSnapshot(runtime.marketId);
          const strategySnapshot = this.toStrategyRuntimeSnapshot(snapshot);
          if (strategySnapshot) this.dispatchCallback(runtime, 'onMarketData', strategySnapshot);
          break;
        }
        case 'order-book': {
          const orderBooks = this.toStrategyOrderBooks(event.event.orderBooks);
          if (orderBooks.some((book) => book.tokenId === runtime.assetId)) {
            this.dispatchCallback(runtime, 'onOrderBook', orderBooks);
          }
          break;
        }
        case 'market-trades-state':
          this.dispatchCallback(runtime, 'onTrade', event.event.marketTrades.recent?.items ?? []);
          break;
        default:
          break;
      }
    }
  }

  private dispatchTradingAccountEvent(event: TradingAccountDataEvent): void {
    const runtimes = [...this._active.values()].filter(
      (runtime) => runtime.walletId === event.walletId && runtime.status === 'running',
    );
    for (const runtime of runtimes) {
      void this.queryRuntimeAccountState(runtime.walletId, runtime.marketId)
        .then((walletState) => {
          this.dispatchCallback(runtime, 'onAccount', walletState);
        })
        .catch((error) => {
          void this.failRuntime(runtime, error).catch((reason) => {
            console.warn('Failed to mark bot runtime failed', reason);
          });
        });
    }
  }

  private dispatchCallback(runtime: ActiveBotRuntime, name: string, payload: unknown): void {
    void runtime.executor.executeCallback(name, payload).catch((error) => {
      void this.failRuntime(runtime, error).catch((reason) => {
        console.warn('Failed to mark bot runtime failed', reason);
      });
    });
  }

  private queryRuntimeAccountState(
    walletId: string,
    snapshotOrMarketId: TradingMarketSnapshot | string,
  ): Promise<TradingRuntimeAccountState> {
    const snapshot =
      typeof snapshotOrMarketId === 'string'
        ? this._ports.marketRuntime.getSnapshot(snapshotOrMarketId)
        : snapshotOrMarketId;
    return this._ports.accounts.queryAccount({
      walletId,
      conditionId: snapshot?.marketDetail?.market.conditionId || '',
      includeBalance: true,
    });
  }

  private toStrategyRuntimeSnapshot(
    snapshot: TradingMarketSnapshot | null,
  ): StrategyRuntimeSnapshotForSandbox | null {
    if (!snapshot) return null;
    return {
      ...snapshot,
      orderBooks: this.toStrategyOrderBooks(snapshot.orderBooks),
    };
  }

  private toStrategyOutcomes(outcomes: MarketDetailData['outcomes']): StrategyRuntimeOutcome[] {
    return outcomes.map((outcome) => ({
      ...outcome,
      tickSize: this.toStrategyTickSize(outcome.tickSize),
    }));
  }

  private toStrategyOrderBooks(orderBooks: OrderBook[]): StrategyRuntimeOrderBook[] {
    return orderBooks.flatMap((book) => {
      const tickSize = this.toStrategyTickSize(book.tickSize);
      return tickSize == null ? [] : [{ ...book, tickSize }];
    });
  }

  private toStrategyTickSize(value: unknown): number | null {
    const tickSize = Number(value);
    return Number.isFinite(tickSize) && tickSize > 0 ? tickSize : null;
  }

  private async failRuntime(runtime: ActiveBotRuntime, error: unknown): Promise<void> {
    if (this._active.get(runtime.botId)?.runId !== runtime.runId) return;
    const message = error instanceof Error ? error.message : String(error);
    runtime.status = 'error';
    runtime.executor.dispose();
    this._active.delete(runtime.botId);
    runtime.marketSubscription.unsubscribe();
    await this._runRepository.updateRunStatus(runtime.runId, 'error', message, now());
    await this._repository.updateRuntimeStatus(runtime.botId, 'error', null, message);
    await this.writeLog(
      runtime.botId,
      runtime.runId,
      runtime.marketId,
      'error',
      message,
      'runtime',
    );
    this._runHistory.emitRuntimeEvent({
      type: 'strategy-run:status',
      runId: runtime.runId,
      marketId: runtime.marketId,
      status: 'error',
      error: message,
    });
    this._runHistory.emitRuntimeEvent({
      type: 'strategy-runs:changed',
      marketId: runtime.marketId,
    });
    this.emitBotEvent({
      type: 'bot:status',
      botId: runtime.botId,
      marketId: runtime.marketId,
      status: 'error',
      activeRunId: null,
      error: message,
    });
    this.emitBotEvent({ type: 'bots:changed', marketId: runtime.marketId, botId: runtime.botId });
  }

  private emitBotEvent(event: StrategyBotRuntimeEvent): void {
    this.emit('runtime-event', event);
  }

  private runtimeVersionNumber(
    version: StrategyVersionRow | StrategyRow,
    strategy: StrategyRow,
  ): number {
    return 'version' in version ? version.version : strategy.currentVersion;
  }

  private runtimeSourceCode(version: StrategyVersionRow | StrategyRow): string {
    return version.sourceCode;
  }

  private runtimeCompiledCode(version: StrategyVersionRow | StrategyRow): string {
    if (version.compileStatus !== 'success' || !version.compiledCode) {
      throw new Error(version.compileError || 'Strategy did not compile successfully');
    }
    return version.compiledCode;
  }

  private toStrategyAccount(account: PolymarketWalletSummary): Record<string, unknown> {
    return {
      id: account.id,
      name: account.name,
      walletAddress: account.walletAddress,
      credentialsConfigured: account.credentialsConfigured,
      depositWalletAddress: account.depositWalletAddress,
      signatureType: account.signatureType,
      chainId: account.chainId,
      clobHost: account.clobHost,
      isDefault: account.isDefault,
    };
  }

  private toStrategyMarket(market: Market): Record<string, unknown> {
    return {
      id: market.id,
      conditionId: market.conditionId || '',
      title: getMarketTitle(market),
      active: market.active,
      closed: market.closed,
      volume: market.volume,
      volume24hr: market.volume24hr,
      liquidity: market.liquidity,
    };
  }

  private assertPolymarketWalletCredentialsConfigured(
    credential: Pick<
      Awaited<ReturnType<StrategyRuntimePorts['accounts']['getCredential']>>,
      'apiKey' | 'secret' | 'passphrase' | 'depositWalletAddress'
    >,
  ): void {
    if (
      credential.apiKey.trim() &&
      credential.secret.trim() &&
      credential.passphrase.trim() &&
      credential.depositWalletAddress.trim()
    ) {
      return;
    }
    throw new Error(
      'This account is missing API Key, Secret, Passphrase, and Deposit Wallet Address, so it cannot be used for trading',
    );
  }
}

export { StrategyBotRuntimeService };
export type { ActiveBotRuntime, StrategyBotRuntimeServiceOptions };
