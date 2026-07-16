import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import type {
  ApiEvent,
  ClobOrder,
  DbMarket,
  Market,
  MarketTradeListResult,
  TradingAccountDataEvent,
  TradingAccountScopedData,
  TradingMarketEvent,
  TradingMarketSnapshot,
  TradingRuntimeAccountState,
  TradingStrategyState,
  TradingStrategyStateEvent,
  TradingWindowInput,
} from '@polytrader/shared';
import { translateUiKey } from '@/shared/i18n';
import { displayMarkets, getMarketIcon, isDisplayableMarket } from '@/shared/utils/markets';
import { getMarketTitle, normalizeApiEvent } from '@/shared/utils/apiEvent';
import { createRequestId } from '@/shared/utils/request';
import { resolvePriceHistoryRange, type PriceHistoryRange } from './usePriceHistoryRange';
import { useTradingOrderBookSummary } from './useTradingOrderBookSummary';
import { useTradingPanelLayout } from './useTradingPanelLayout';

export type CenterTab = 'market' | 'trades' | 'analysis' | 'holders';
export type ActivityTab =
  'orders' | 'positions' | 'walletTrades' | 'bots' | 'strategyLogs' | 'strategyHistory';

type WalletDataScope = {
  walletId: string;
  conditionId: string;
};

type WalletDataType = 'orders' | 'positions' | 'trades';

type WalletDataRequest = {
  requestId: string;
  scope: WalletDataScope;
};

export function useTradingApp() {
  const params = ref<TradingWindowInput>(readParamsFromUrl());
  const selectedTokenId = ref(params.value.tokenId ?? '');
  const runtimeSnapshot = ref<TradingMarketSnapshot | null>(null);
  const strategyState = ref<TradingStrategyState | null>(null);
  const walletState = ref<TradingRuntimeAccountState | null>(null);
  const runtimeLoading = ref(false);
  const runtimeError = ref('');
  const strategyLoading = ref(false);
  const strategyError = ref('');
  const walletLoading = ref(false);
  const walletError = ref('');
  const walletActionError = ref('');
  const cancelingOrderIds = ref<string[]>([]);
  const collapsedMarketRefs = ref(new Map<string, HTMLElement>());
  const marketTradesTotal = ref(0);
  const activeActivityTab = ref<ActivityTab>('positions');
  const activeCenterTab = ref<CenterTab>('market');
  const activeTradeTab = ref<'manual' | 'strategy'>('manual');
  const priceHistoryRange = ref<PriceHistoryRange>('all');
  const priceHistoryLoading = ref(false);
  const priceHistoryError = ref('');
  let runtimeRequestSeq = 0;
  let walletRequestSeq = 0;
  const walletDataRefreshVersions = new Map<string, number>();
  const strategyStateRefreshVersions = new Map<string, number>();
  let priceHistoryRequestSeq = 0;
  let defaultMarketTradesRequestSeq = 0;
  let defaultMarketTradesInFlight = false;
  let defaultMarketTradesEmptyKey = '';
  let unsubscribeParams: (() => void) | null = null;
  let unsubscribeCloseBlocked: (() => void) | null = null;
  let unsubscribeCloseRequested: (() => void) | null = null;
  let unsubscribeRuntime: (() => void) | null = null;
  let unsubscribeTradingStrategy: (() => void) | null = null;
  let unsubscribeTradingAccount: (() => void) | null = null;
  let walletOrdersChangedTimer: ReturnType<typeof setTimeout> | null = null;
  let walletPositionsChangedTimer: ReturnType<typeof setTimeout> | null = null;
  let walletTradesChangedTimer: ReturnType<typeof setTimeout> | null = null;
  let pendingRuntimeEvents: TradingMarketEvent[] = [];
  let replayingPendingRuntimeEvents = false;

  const marketId = computed(() => params.value.marketId || '');
  const eventId = computed(() => params.value.eventId || '');
  const metadata = computed(() => params.value.metadata);
  const startupError = computed(() => {
    if (!eventId.value.trim()) return translateUiKey('tradingWindow.missingEventId');
    if (!marketId.value.trim()) return translateUiKey('tradingWindow.missingMarketId');
    return '';
  });
  const {
    leftPanelCollapsed,
    rightPanelCollapsed,
    panelGridStyle,
    toggleLeftPanel,
    toggleRightPanel,
    startPanelWidthResize,
    stopPanelWidthResize,
  } = useTradingPanelLayout(eventId);

  const runtimeStatus = computed(() => runtimeSnapshot.value?.status ?? null);
  const runtimeErrors = computed(() => runtimeSnapshot.value?.errors ?? {});
  const event = computed<ApiEvent | null>(() =>
    runtimeSnapshot.value?.event ? normalizeApiEvent(runtimeSnapshot.value.event) : null,
  );
  const data = computed(() => {
    const detail = runtimeSnapshot.value?.marketDetail ?? null;
    if (!detail || String(detail.market?.id) !== String(marketId.value)) return null;
    return detail;
  });
  const eventLoading = computed(
    () => !event.value && (runtimeLoading.value || runtimeStatus.value?.gammaEvent === 'loading'),
  );
  const eventError = computed(() => runtimeErrors.value.gammaEvent || '');
  const error = computed(() => runtimeError.value || runtimeErrors.value.marketDetail || '');
  const eventMarkets = computed(() => (event.value ? displayMarkets(event.value.markets) : []));
  const showMarketSidebar = computed(
    () => Boolean(eventId.value) && eventMarkets.value.length !== 1,
  );
  const scopedMarketIds = computed(() => {
    const ids = eventMarkets.value.map((item) => String(item.id || '')).filter(Boolean);
    if (ids.length) return ids;
    return marketId.value ? [marketId.value] : [];
  });
  const eventMarket = computed(
    () => eventMarkets.value.find((item) => String(item.id) === String(marketId.value)) ?? null,
  );
  const currentDetail = computed(() => data.value);
  const marketDetailReady = computed(() => Boolean(currentDetail.value));
  const marketDetailPending = computed(
    () =>
      (runtimeLoading.value || runtimeStatus.value?.marketDetail === 'loading') &&
      !marketDetailReady.value,
  );
  const marketShell = computed(() => currentDetail.value?.market ?? eventMarket.value ?? null);
  const showInitialMarketLoading = computed(
    () =>
      !startupError.value &&
      (runtimeLoading.value || marketDetailPending.value) &&
      !marketShell.value,
  );
  const showInitialMarketError = computed(() =>
    Boolean(startupError.value || (error.value && !marketShell.value)),
  );
  const tokenOutcomes = computed(() => currentDetail.value?.outcomes ?? []);
  const holders = computed(() => currentDetail.value?.holders ?? []);
  const orderBooks = computed(() => runtimeSnapshot.value?.orderBooks ?? []);
  const priceHistory = computed(() => runtimeSnapshot.value?.priceHistory ?? {});
  const defaultMarketTrades = computed(() => runtimeSnapshot.value?.marketTrades.recent ?? null);
  const defaultMarketTradesSyncStatus = computed(
    () => runtimeSnapshot.value?.marketTrades.syncStatus ?? null,
  );
  const cryptoTick = computed(() => runtimeSnapshot.value?.cryptoTick ?? null);
  const binanceKline = computed(() => runtimeSnapshot.value?.binanceKline ?? null);
  const wsStatus = computed(() => runtimeSnapshot.value?.wsStatus ?? 'disconnected');
  const {
    orderBookDepth,
    displayBooks,
    spreadLabel,
    tickSizeLabel,
    liveDepthLabel,
    handleOrderBookSpreadChange,
    handleOrderBookTickChange,
  } = useTradingOrderBookSummary(orderBooks, selectedTokenId);

  const market = computed(() => marketShell.value);
  const conditionId = computed(() => currentDetail.value?.market.conditionId || '');
  const title = computed(() =>
    market.value ? getMarketTitle(market.value) : translateUiKey('tradingWindow.title'),
  );
  const marketIcon = computed(() => market.value?.icon || market.value?.image || '');
  const marketNegRisk = computed(() => currentDetail.value?.market.negRisk === true);
  const eventTitle = computed(() => event.value?.title || translateUiKey('tradingWindow.title'));
  const walletConfigured = computed(() => walletState.value?.credentialsConfigured ?? false);
  const accounts = computed(() => walletState.value?.accounts ?? []);
  const selectedPanelWalletId = computed({
    get: () => walletState.value?.selectedWalletId ?? '',
    set: (walletId: string) => {
      void handleOrderAccountChange(walletId);
    },
  });
  const panelLoading = computed(() => walletLoading.value);
  const panelError = computed(
    () => walletActionError.value || walletError.value || walletState.value?.error || '',
  );
  const walletDataError = computed(() => walletError.value || walletState.value?.error || '');
  const filteredOrders = computed(() => {
    if (!marketDetailReady.value) return [];
    return walletState.value?.orders ?? [];
  });
  const filteredPositions = computed(() => {
    if (!marketDetailReady.value) return [];
    return walletState.value?.positions ?? [];
  });
  const filteredWalletTrades = computed(() => {
    if (!marketDetailReady.value) return [];
    return walletState.value?.trades ?? [];
  });
  const strategyHistory = computed(() => strategyState.value?.history ?? []);
  const strategyLogs = computed(() => strategyState.value?.logs ?? []);
  const strategyOrderIdList = computed(() =>
    (strategyState.value?.orders ?? [])
      .filter((order) => order.success && order.exchangeOrderId)
      .map((order) => String(order.exchangeOrderId)),
  );
  const selectedStrategyRunId = computed(() => strategyState.value?.selectedRunId ?? '');
  const strategyActivityLoading = computed(() => strategyLoading.value);
  const strategyActivityError = computed(
    () => strategyError.value || strategyState.value?.error || '',
  );
  const wsStatusLabel = computed(() => {
    switch (wsStatus.value) {
      case 'live':
        return translateUiKey('tradingWindow.live');
      case 'connecting':
        return translateUiKey('tradingWindow.connecting');
      case 'error':
        return translateUiKey('tradingWindow.connectionFailed');
      default:
        return translateUiKey('tradingWindow.disconnected');
    }
  });

  function readParamsFromUrl(): TradingWindowInput {
    const search = new URLSearchParams(window.location.search);
    return {
      marketId: search.get('marketId') || '',
      eventId: search.get('eventId') || '',
      tokenId: search.get('tokenId'),
      outcome: search.get('outcome'),
      metadata: parseTradingMetadata(search.get('metadata')),
    };
  }

  function parseTradingMetadata(raw: string | null): unknown {
    if (!raw) return undefined;
    try {
      return JSON.parse(raw);
    } catch {
      return undefined;
    }
  }

  function stringifyTradingMetadata(metadata: unknown): string {
    if (metadata === undefined) return '';
    try {
      return JSON.stringify(metadata);
    } catch {
      return '';
    }
  }

  function cloneTradingMetadata(metadata: unknown): unknown {
    if (metadata === undefined) return undefined;
    try {
      return JSON.parse(JSON.stringify(metadata));
    } catch {
      return undefined;
    }
  }

  function writeParamsToUrl(input: TradingWindowInput): void {
    const search = new URLSearchParams();
    search.set('marketId', input.marketId);
    search.set('eventId', input.eventId);
    if (input.tokenId) search.set('tokenId', input.tokenId);
    if (input.outcome) search.set('outcome', input.outcome);
    const metadata = stringifyTradingMetadata(input.metadata);
    if (metadata) search.set('metadata', metadata);
    const nextUrl = `${window.location.pathname}?${search.toString()}`;
    window.history.replaceState(null, '', nextUrl);
  }

  function plainTradingWindowInput(input: TradingWindowInput): TradingWindowInput {
    return {
      marketId: String(input.marketId || ''),
      eventId: String(input.eventId || ''),
      tokenId: input.tokenId ? String(input.tokenId) : null,
      outcome: input.outcome ? String(input.outcome) : null,
      metadata: cloneTradingMetadata(input.metadata),
    };
  }

  function unsubscribeRuntimeForMarket(id: string): void {
    if (!id) return;
    void window.api.tradingMarket.unsubscribe(id);
  }

  function applyParams(next: TradingWindowInput): void {
    const previousMarketId = marketId.value;
    const nextInput = plainTradingWindowInput(next);
    params.value = nextInput;
    selectedTokenId.value = nextInput.tokenId ?? '';
    writeParamsToUrl(params.value);
    if (previousMarketId && previousMarketId !== nextInput.marketId) {
      unsubscribeRuntimeForMarket(previousMarketId);
    }
    void ensureRuntime(nextInput);
  }

  function selectMarket(
    nextMarketId: string,
    nextTokenId: string | null = null,
    nextOutcome: string | null = null,
  ): void {
    if (!nextMarketId) return;
    if (String(nextMarketId) === String(marketId.value)) {
      if (!nextTokenId) return;
      void selectOutcome(nextTokenId, nextOutcome);
      return;
    }
    const previousMarketId = marketId.value;
    const nextInput = plainTradingWindowInput({
      ...params.value,
      marketId: nextMarketId,
      tokenId: nextTokenId,
      outcome: nextOutcome,
      metadata: params.value.metadata,
    });
    params.value = nextInput;
    selectedTokenId.value = nextInput.tokenId ?? '';
    writeParamsToUrl(params.value);
    unsubscribeRuntimeForMarket(previousMarketId);
    void ensureRuntime(nextInput);
  }

  function getCollapsedMarketIcon(item: DbMarket | Market): string {
    return getMarketIcon(item, event.value ?? {});
  }

  function getCollapsedMarketTitle(item: DbMarket | Market): string {
    return getMarketTitle(item) || translateUiKey('market.untitled');
  }

  function getCollapsedMarketStatusClass(item: DbMarket | Market): string {
    return isDisplayableMarket(item) ? 'bg-[#22c55e]' : 'bg-[#ef4444]';
  }

  function getCollapsedMarketStatusTitle(item: DbMarket | Market): string {
    if (isDisplayableMarket(item)) return translateUiKey('status.active');
    return item.closed ? translateUiKey('status.closed') : translateUiKey('status.inactive');
  }

  function setCollapsedMarketRef(marketId: string, el: unknown): void {
    if (el instanceof HTMLElement) collapsedMarketRefs.value.set(String(marketId), el);
    else collapsedMarketRefs.value.delete(String(marketId));
  }

  function scrollCollapsedActiveMarketIntoView(): void {
    if (!leftPanelCollapsed.value) return;
    nextTick(() => {
      const el = collapsedMarketRefs.value.get(String(marketId.value));
      el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
  }

  async function selectOutcome(
    tokenId: string,
    explicitOutcome: string | null = null,
  ): Promise<void> {
    const outcome = explicitOutcome
      ? { label: explicitOutcome }
      : tokenOutcomes.value.find((item) => item.tokenId === tokenId);
    selectedTokenId.value = tokenId;
    params.value = {
      ...params.value,
      tokenId,
      outcome: outcome?.label ?? null,
    };
    writeParamsToUrl(params.value);
    if (!marketId.value) return;
    const result = await window.api.tradingMarket.selectToken(
      marketId.value,
      tokenId,
      outcome?.label,
    );
    if (result.ok) {
      applySnapshot(result.data);
      runtimeError.value = '';
    } else {
      runtimeError.value = result.error;
    }
  }

  async function handleOrderSubmitted(): Promise<void> {
    activeActivityTab.value = 'orders';
    await refreshWalletOrders();
  }

  async function handleStrategyRunSelected(runId: string): Promise<void> {
    activeActivityTab.value = 'strategyLogs';
    if (!marketId.value) return;
    const result = await window.api.tradingStrategy.selectRun(marketId.value, runId);
    if (result.ok) {
      strategyState.value = result.data;
      strategyError.value = '';
    } else {
      strategyError.value = result.error;
    }
  }

  async function handleStrategyChanged(): Promise<void> {
    await refreshStrategyState();
    await refreshAccountData();
  }

  function applySnapshot(snapshot: TradingMarketSnapshot): void {
    runtimeSnapshot.value = snapshot;
    if (snapshot.selectedTokenId) selectedTokenId.value = snapshot.selectedTokenId;
    if (snapshot.marketTrades.recent) marketTradesTotal.value = snapshot.marketTrades.recent.total;
    replayPendingRuntimeEvents(snapshot.marketId);
  }

  function applyRuntimeEvent(event: TradingMarketEvent): void {
    if (event.event.marketId !== marketId.value) return;
    const current = runtimeSnapshot.value;
    if (event.eventName === 'runtime-snapshot') {
      applySnapshot(event.event.snapshot);
      return;
    }
    if (!current) {
      pendingRuntimeEvents.push(event);
      return;
    }
    const next: TradingMarketSnapshot = {
      ...current,
      status: { ...current.status },
      errors: { ...current.errors },
      marketTrades: { ...current.marketTrades },
    };
    switch (event.eventName) {
      case 'runtime-status':
        next.status[event.event.scope] = event.event.status;
        if (event.event.error) next.errors[event.event.scope] = event.event.error;
        else delete next.errors[event.event.scope];
        break;
      case 'gamma-event':
        next.event = event.event.event;
        break;
      case 'market-detail':
        next.marketDetail = event.event.data;
        break;
      case 'order-book':
        next.orderBooks = event.event.orderBooks;
        next.recentLiveTrades = event.event.recentLiveTrades;
        next.wsStatus = event.event.wsStatus;
        break;
      case 'price-history-loaded':
        next.priceHistory = event.event.priceHistory;
        priceHistoryLoading.value = false;
        priceHistoryError.value = '';
        break;
      case 'price-history-updated':
        next.priceHistory = mergePriceHistory(next.priceHistory, event.event.pointsByToken);
        priceHistoryLoading.value = false;
        priceHistoryError.value = '';
        break;
      case 'market-trades-state':
        next.marketTrades = event.event.marketTrades;
        break;
      case 'crypto-tick':
        next.cryptoTick = event.event.cryptoTick;
        break;
      case 'binance-kline':
        next.binanceKline = event.event.binanceKline;
        break;
      default:
        break;
    }
    applySnapshot(next);
  }

  function replayPendingRuntimeEvents(snapshotMarketId: string): void {
    if (replayingPendingRuntimeEvents || !pendingRuntimeEvents.length) return;
    const replayEvents = pendingRuntimeEvents.filter(
      (event) => event.event.marketId === snapshotMarketId,
    );
    pendingRuntimeEvents = pendingRuntimeEvents.filter(
      (event) => event.event.marketId !== snapshotMarketId,
    );
    if (!replayEvents.length) return;
    replayingPendingRuntimeEvents = true;
    try {
      for (const event of replayEvents) applyRuntimeEvent(event);
    } finally {
      replayingPendingRuntimeEvents = false;
    }
  }

  function mergePriceHistory(
    current: TradingMarketSnapshot['priceHistory'],
    updates: TradingMarketSnapshot['priceHistory'],
  ): TradingMarketSnapshot['priceHistory'] {
    const merged: TradingMarketSnapshot['priceHistory'] = { ...current };
    for (const [tokenId, points] of Object.entries(updates)) {
      const byTime = new Map((merged[tokenId] ?? []).map((point) => [point.t, point]));
      for (const point of points) byTime.set(point.t, point);
      merged[tokenId] = [...byTime.values()].sort((a, b) => a.t - b.t);
    }
    return merged;
  }

  function applyDefaultMarketTrades(result: MarketTradeListResult): void {
    const current = runtimeSnapshot.value;
    if (!current) return;
    const next: TradingMarketSnapshot = {
      ...current,
      marketTrades: {
        ...current.marketTrades,
        syncStatus: result.syncStatus,
        recent: result,
        error: result.error || current.marketTrades.error,
        updatedAt: new Date().toISOString(),
      },
    };
    applySnapshot(next);
  }

  function applyTradingStrategyEvent(event: TradingStrategyStateEvent): void {
    if (event.marketId !== marketId.value) return;
    strategyState.value = event.strategy;
    strategyError.value = event.strategy.error || '';
  }

  function applyTradingAccountDataEvent(event: TradingAccountDataEvent): void {
    if (event.type === 'orders-changed') {
      if (event.walletId !== selectedPanelWalletId.value) return;
      scheduleWalletOrdersRefresh();
      return;
    }
    if (event.type === 'positions-changed') {
      if (event.walletId !== selectedPanelWalletId.value) return;
      scheduleWalletPositionsRefresh();
      return;
    }
    if (event.type === 'trades-changed') {
      if (event.walletId !== selectedPanelWalletId.value) return;
      scheduleWalletTradesRefresh();
      return;
    }
    if (event.type !== 'balance-changed' && event.type !== 'position-summary-changed') return;
    const current = walletState.value;
    if (!current) return;
    const nextAccounts = current.accounts.map((account) =>
      account.id === event.walletId
        ? {
            ...account,
            ...(event.type === 'balance-changed'
              ? { balance: event.balance }
              : {
                  positionsTotalValue: event.positionsTotalValue,
                  positionsInitialValue: event.positionsInitialValue,
                }),
          }
        : account,
    );
    const nextAccount = {
      ...current,
      accounts: nextAccounts,
      balance:
        event.type === 'balance-changed' && current.selectedWalletId === event.walletId
          ? event.balance
          : current.balance,
      updatedAt: event.at,
    };
    walletState.value = nextAccount;
  }

  async function ensureRuntime(input = params.value): Promise<void> {
    const requestInput = plainTradingWindowInput(input);
    if (!requestInput.marketId || !requestInput.eventId) return;
    const seq = ++runtimeRequestSeq;
    if (runtimeSnapshot.value?.marketId !== requestInput.marketId) {
      walletRequestSeq += 1;
      pendingRuntimeEvents = [];
      walletState.value = null;
      walletError.value = '';
      walletLoading.value = false;
      strategyState.value = null;
      strategyError.value = '';
      strategyLoading.value = false;
    }
    runtimeLoading.value = true;
    runtimeError.value = '';
    try {
      const result = await window.api.tradingMarket.subscribe(requestInput, {
        loadPriceHistory: false,
      });
      if (seq !== runtimeRequestSeq) return;
      if (result.ok) {
        applySnapshot(result.data);
        await Promise.all([refreshAccountData(), refreshStrategyState()]);
      } else {
        runtimeError.value = result.error;
      }
    } catch (error) {
      if (seq === runtimeRequestSeq) {
        runtimeError.value = error instanceof Error ? error.message : String(error);
      }
    } finally {
      if (seq === runtimeRequestSeq) runtimeLoading.value = false;
    }
  }

  function getWalletDataScope(): WalletDataScope | null {
    const walletId = selectedPanelWalletId.value.trim();
    const targetConditionId = conditionId.value.trim();
    if (!walletId || !targetConditionId) return null;
    return { walletId, conditionId: targetConditionId };
  }

  function getWalletDataRefreshKey(type: WalletDataType, scope: WalletDataScope): string {
    return `${type}:${scope.walletId}:${scope.conditionId}`;
  }

  function nextRefreshVersion(versions: Map<string, number>, key: string): number {
    const version = (versions.get(key) ?? 0) + 1;
    versions.set(key, version);
    return version;
  }

  function isCurrentRefreshVersion(
    versions: Map<string, number>,
    key: string,
    version: number,
  ): boolean {
    return versions.get(key) === version;
  }

  function nextWalletDataRefreshVersion(type: WalletDataType, scope: WalletDataScope): number {
    return nextRefreshVersion(walletDataRefreshVersions, getWalletDataRefreshKey(type, scope));
  }

  function isCurrentWalletDataRefresh(
    type: WalletDataType,
    scope: WalletDataScope,
    version: number,
  ): boolean {
    const activeScope = getWalletDataScope();
    if (
      !activeScope ||
      activeScope.walletId !== scope.walletId ||
      activeScope.conditionId !== scope.conditionId
    ) {
      return false;
    }
    return isCurrentRefreshVersion(
      walletDataRefreshVersions,
      getWalletDataRefreshKey(type, scope),
      version,
    );
  }

  function createWalletDataRequest(scope: WalletDataScope): WalletDataRequest {
    return { requestId: createRequestId(), scope };
  }

  function isMatchingWalletDataResponse<T>(
    data: TradingAccountScopedData<T>,
    request: WalletDataRequest,
  ): boolean {
    return (
      data.requestId === request.requestId &&
      data.walletId === request.scope.walletId &&
      data.conditionId === request.scope.conditionId
    );
  }

  async function refreshStrategyState(): Promise<void> {
    const targetMarketId = marketId.value;
    if (!targetMarketId) return;
    const version = nextRefreshVersion(strategyStateRefreshVersions, targetMarketId);
    strategyLoading.value = true;
    strategyError.value = '';
    try {
      const result = await window.api.tradingStrategy.getState(targetMarketId);
      if (
        marketId.value !== targetMarketId ||
        !isCurrentRefreshVersion(strategyStateRefreshVersions, targetMarketId, version)
      ) {
        return;
      }
      if (result.ok) {
        strategyState.value = result.data;
      } else {
        strategyError.value = result.error;
      }
    } catch (error) {
      if (
        marketId.value !== targetMarketId ||
        !isCurrentRefreshVersion(strategyStateRefreshVersions, targetMarketId, version)
      ) {
        return;
      }
      strategyError.value = error instanceof Error ? error.message : String(error);
    } finally {
      if (
        marketId.value === targetMarketId &&
        isCurrentRefreshVersion(strategyStateRefreshVersions, targetMarketId, version)
      ) {
        strategyLoading.value = false;
      }
    }
  }

  async function loadPriceHistory(): Promise<void> {
    const ids = tokenOutcomes.value.map((outcome) => outcome.tokenId).filter(Boolean);
    if (!marketId.value || !conditionId.value || !ids.length) {
      priceHistoryLoading.value = false;
      priceHistoryError.value = '';
      return;
    }

    const seq = ++priceHistoryRequestSeq;
    const range = resolvePriceHistoryRange(priceHistoryRange.value);
    priceHistoryLoading.value = true;
    priceHistoryError.value = '';
    try {
      const result = await window.api.tradingMarket.loadPriceHistory(
        marketId.value,
        range.value,
        range.fidelity,
      );
      if (seq !== priceHistoryRequestSeq) return;
      if (result.ok) {
        applySnapshot(result.data);
      } else {
        priceHistoryError.value = result.error;
      }
    } catch (error) {
      if (seq === priceHistoryRequestSeq) {
        priceHistoryError.value = error instanceof Error ? error.message : String(error);
      }
    } finally {
      if (
        seq === priceHistoryRequestSeq &&
        Object.values(priceHistory.value).some((points) => points.length)
      ) {
        priceHistoryLoading.value = false;
      }
    }
  }

  async function ensureDefaultMarketTrades(): Promise<void> {
    if (!marketId.value || !conditionId.value) return;
    const current = defaultMarketTrades.value;
    const status = defaultMarketTradesSyncStatus.value;
    if (current && (current.items.length > 0 || current.total > 0)) return;
    if (!status || (!status.totalCached && !status.backfilled)) return;

    const requestKey = [
      marketId.value,
      conditionId.value,
      status.totalCached,
      status.backfilled ? 'backfilled' : 'warming',
    ].join(':');
    if (defaultMarketTradesInFlight || defaultMarketTradesEmptyKey === requestKey) return;

    const seq = ++defaultMarketTradesRequestSeq;
    defaultMarketTradesInFlight = true;
    try {
      const result = await window.api.tradingMarket.listTrades(marketId.value, {
        marketId: marketId.value,
        conditionId: conditionId.value,
        sortField: 'time',
        sortOrder: 'desc',
        limit: 200,
        offset: 0,
      });
      if (seq !== defaultMarketTradesRequestSeq) return;
      if (result.ok) {
        applyDefaultMarketTrades(result.data);
        if (!result.data.total && !result.data.items.length)
          defaultMarketTradesEmptyKey = requestKey;
      }
    } finally {
      if (seq === defaultMarketTradesRequestSeq) defaultMarketTradesInFlight = false;
    }
  }

  async function refreshAccountData(walletId = selectedPanelWalletId.value): Promise<void> {
    if (!conditionId.value) return;
    const seq = ++walletRequestSeq;
    walletLoading.value = true;
    walletError.value = '';
    try {
      const result = await window.api.tradingAccount.getData({
        walletId: walletId || undefined,
        conditionId: conditionId.value,
        includeBalance: true,
      });
      if (seq !== walletRequestSeq) return;
      if (result.ok) {
        walletState.value = result.data;
      } else {
        walletError.value = result.error;
      }
    } catch (error) {
      if (seq === walletRequestSeq) {
        walletError.value = error instanceof Error ? error.message : String(error);
      }
    } finally {
      if (seq === walletRequestSeq) walletLoading.value = false;
    }
  }

  async function refreshWalletOrders(): Promise<void> {
    const scope = getWalletDataScope();
    if (!scope || !walletState.value) return;
    const version = nextWalletDataRefreshVersion('orders', scope);
    const request = createWalletDataRequest(scope);
    const result = await window.api.tradingAccount.getOrders({
      requestId: request.requestId,
      walletId: scope.walletId,
      conditionId: scope.conditionId,
    });
    if (!isCurrentWalletDataRefresh('orders', scope, version)) return;
    if (!result.ok) {
      walletError.value = result.error;
      return;
    }
    if (!isMatchingWalletDataResponse(result.data, request)) return;
    const current = walletState.value;
    if (!current) return;
    walletState.value = {
      ...current,
      orders: result.data.items,
      updatedAt: new Date().toISOString(),
    };
    walletError.value = '';
  }

  async function refreshWalletPositions(): Promise<void> {
    const scope = getWalletDataScope();
    if (!scope || !walletState.value) return;
    const version = nextWalletDataRefreshVersion('positions', scope);
    const request = createWalletDataRequest(scope);
    const result = await window.api.tradingAccount.getPositions({
      requestId: request.requestId,
      walletId: scope.walletId,
      conditionId: scope.conditionId,
    });
    if (!isCurrentWalletDataRefresh('positions', scope, version)) return;
    if (!result.ok) {
      walletError.value = result.error;
      return;
    }
    if (!isMatchingWalletDataResponse(result.data, request)) return;
    const current = walletState.value;
    if (!current) return;
    walletState.value = {
      ...current,
      positions: result.data.items,
      updatedAt: new Date().toISOString(),
    };
    walletError.value = '';
  }

  async function refreshWalletTrades(): Promise<void> {
    const scope = getWalletDataScope();
    if (!scope || !walletState.value) return;
    const version = nextWalletDataRefreshVersion('trades', scope);
    const request = createWalletDataRequest(scope);
    const result = await window.api.tradingAccount.getTrades({
      requestId: request.requestId,
      walletId: scope.walletId,
      conditionId: scope.conditionId,
    });
    if (!isCurrentWalletDataRefresh('trades', scope, version)) return;
    if (!result.ok) {
      walletError.value = result.error;
      return;
    }
    if (!isMatchingWalletDataResponse(result.data, request)) return;
    const current = walletState.value;
    if (!current) return;
    walletState.value = {
      ...current,
      trades: result.data.items,
      updatedAt: new Date().toISOString(),
    };
    walletError.value = '';
  }

  function scheduleWalletOrdersRefresh(): void {
    if (walletOrdersChangedTimer) clearTimeout(walletOrdersChangedTimer);
    walletOrdersChangedTimer = setTimeout(() => {
      walletOrdersChangedTimer = null;
      void refreshWalletOrders();
    }, 200);
  }

  function scheduleWalletPositionsRefresh(): void {
    if (walletPositionsChangedTimer) clearTimeout(walletPositionsChangedTimer);
    walletPositionsChangedTimer = setTimeout(() => {
      walletPositionsChangedTimer = null;
      void refreshWalletPositions();
    }, 200);
  }

  function scheduleWalletTradesRefresh(): void {
    if (walletTradesChangedTimer) clearTimeout(walletTradesChangedTimer);
    walletTradesChangedTimer = setTimeout(() => {
      walletTradesChangedTimer = null;
      void refreshWalletTrades();
    }, 200);
  }

  async function cancelOrder(orderId: string, walletId: string): Promise<void> {
    walletActionError.value = '';
    cancelingOrderIds.value = [orderId];
    try {
      const result = await window.api.tradingAccount.cancelOrder(orderId, walletId);
      if (!result.ok) {
        walletActionError.value = result.error;
        return;
      }
      await refreshWalletOrders();
    } finally {
      cancelingOrderIds.value = [];
    }
  }

  async function cancelOrders(orderIds: string[], walletId: string): Promise<void> {
    const exchangeOrderIds = [
      ...new Set(orderIds.map((orderId) => orderId.trim()).filter(Boolean)),
    ];
    if (!exchangeOrderIds.length) return;

    walletActionError.value = '';
    cancelingOrderIds.value = exchangeOrderIds;
    try {
      const result = await window.api.tradingAccount.cancelOrders(exchangeOrderIds, walletId);
      if (!result.ok) {
        walletActionError.value = result.error;
        return;
      }
      await refreshWalletOrders();
    } finally {
      cancelingOrderIds.value = [];
    }
  }

  async function deleteFailedOrder(orderId: string, walletId: string): Promise<void> {
    walletActionError.value = '';
    const result = await window.api.tradingAccount.deleteFailedOrder(orderId, walletId);
    if (!result.ok) {
      walletActionError.value = result.error;
      return;
    }
    removeAccountOrderFromMemory(orderId, walletId);
  }

  function removeAccountOrderFromMemory(orderId: string, walletId?: string): void {
    const current = walletState.value;
    if (!current) return;
    walletState.value = {
      ...current,
      orders: current.orders.filter((order) => !isSameAccountOrder(order, orderId, walletId)),
      updatedAt: new Date().toISOString(),
    };
  }

  function isSameAccountOrder(order: ClobOrder, orderId: string, walletId?: string): boolean {
    if (walletId && String(order.wallet_id || '') !== String(walletId)) return false;
    return [order.id, order.order_id, order.exchange_order_id]
      .filter((value): value is string => typeof value === 'string' && value.length > 0)
      .some((value) => String(value) === String(orderId));
  }

  async function handleOrderAccountChange(walletId: string): Promise<void> {
    if (!conditionId.value || !walletId || walletId === selectedPanelWalletId.value) return;
    walletActionError.value = '';
    await refreshAccountData(walletId);
    if (walletError.value) walletActionError.value = walletError.value;
  }

  async function requestTradingWindowClose(): Promise<void> {
    await window.api.confirmTradingWindowClose();
  }

  onMounted(async () => {
    unsubscribeParams = window.api.onTradingWindowParams(applyParams);
    unsubscribeCloseBlocked = window.api.onTradingWindowCloseBlocked(() => {
      window.alert(translateUiKey('dialog.closeBlocked'));
    });
    unsubscribeCloseRequested = window.api.onTradingWindowCloseRequested(() => {
      void requestTradingWindowClose();
    });
    unsubscribeRuntime = window.api.tradingMarket.onEvent(applyRuntimeEvent);
    unsubscribeTradingStrategy = window.api.tradingStrategy.onEvent(applyTradingStrategyEvent);
    unsubscribeTradingAccount = window.api.tradingAccount.onEvent(applyTradingAccountDataEvent);
    await ensureRuntime();
  });

  onUnmounted(() => {
    stopPanelWidthResize();
    unsubscribeParams?.();
    unsubscribeCloseBlocked?.();
    unsubscribeCloseRequested?.();
    unsubscribeRuntime?.();
    unsubscribeTradingStrategy?.();
    unsubscribeTradingAccount?.();
    if (walletOrdersChangedTimer) clearTimeout(walletOrdersChangedTimer);
    if (walletPositionsChangedTimer) clearTimeout(walletPositionsChangedTimer);
    if (walletTradesChangedTimer) clearTimeout(walletTradesChangedTimer);
    unsubscribeRuntimeForMarket(marketId.value);
  });

  watch(
    scopedMarketIds,
    (ids) => {
      void window.api.updateTradingWindowMarketScope([...ids]);
    },
    { immediate: true },
  );

  watch(tokenOutcomes, (outcomes) => {
    if (!outcomes.length) return;
    if (selectedTokenId.value && outcomes.some((item) => item.tokenId === selectedTokenId.value)) {
      return;
    }
    void selectOutcome(outcomes[0].tokenId);
  });

  watch(
    () =>
      [
        marketId.value,
        conditionId.value,
        tokenOutcomes.value.map((outcome) => outcome.tokenId).join('|'),
        priceHistoryRange.value,
      ].join(':'),
    () => {
      void loadPriceHistory();
    },
    { immediate: true },
  );

  watch(
    () =>
      [
        marketId.value,
        conditionId.value,
        defaultMarketTrades.value?.total ?? -1,
        defaultMarketTrades.value?.items.length ?? -1,
        defaultMarketTradesSyncStatus.value?.totalCached ?? 0,
        defaultMarketTradesSyncStatus.value?.backfilled ? '1' : '0',
      ].join(':'),
    () => {
      void ensureDefaultMarketTrades();
    },
    { immediate: true },
  );

  watch([marketId, leftPanelCollapsed, eventMarkets], () => {
    scrollCollapsedActiveMarketIntoView();
  });

  return {
    walletConfigured,
    walletDataError,
    accounts,
    activeActivityTab,
    activeCenterTab,
    activeTradeTab,
    cancelOrder,
    cancelOrders,
    cancelingOrderIds,
    deleteFailedOrder,
    conditionId,
    binanceKline,
    cryptoTick,
    defaultMarketTrades,
    defaultMarketTradesSyncStatus,
    displayBooks,
    error,
    event,
    eventError,
    eventId,
    eventLoading,
    eventMarkets,
    eventTitle,
    filteredWalletTrades,
    filteredOrders,
    filteredPositions,
    getCollapsedMarketIcon,
    getCollapsedMarketStatusClass,
    getCollapsedMarketStatusTitle,
    getCollapsedMarketTitle,
    handleOrderBookSpreadChange,
    handleOrderBookTickChange,
    handleOrderSubmitted,
    handleStrategyChanged,
    handleStrategyRunSelected,
    holders,
    leftPanelCollapsed,
    liveDepthLabel,
    market,
    marketDetailPending,
    marketDetailReady,
    marketIcon,
    marketId,
    metadata,
    marketNegRisk,
    marketTradesTotal,
    orderBookDepth,
    panelError,
    panelGridStyle,
    panelLoading,
    priceHistory,
    priceHistoryError,
    priceHistoryLoading,
    priceHistoryRange,
    requestTradingWindowClose,
    rightPanelCollapsed,
    selectedPanelWalletId,
    selectedStrategyRunId,
    selectedTokenId,
    selectMarket,
    setCollapsedMarketRef,
    showInitialMarketError,
    showInitialMarketLoading,
    showMarketSidebar,
    spreadLabel,
    startPanelWidthResize,
    startupError,
    strategyActivityError,
    strategyActivityLoading,
    strategyHistory,
    strategyLogs,
    strategyOrderIdList,
    strategyState,
    tickSizeLabel,
    title,
    toggleLeftPanel,
    toggleRightPanel,
    tokenOutcomes,
    wsStatus,
    wsStatusLabel,
  };
}
