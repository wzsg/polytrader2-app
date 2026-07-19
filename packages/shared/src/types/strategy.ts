type StrategyCompileStatus = 'pending' | 'success' | 'failed';
type StrategyRunStatus =
  'starting' | 'running' | 'stopping' | 'stopped' | 'stopped_with_cancel_error' | 'error';
type StrategyBotStatus = 'idle' | 'starting' | 'running' | 'stopping' | 'stopped' | 'error';
type StrategyLogLevel = 'debug' | 'info' | 'warn' | 'error';
type StrategyOrderSide = 'BUY' | 'SELL';

interface StrategyListItem {
  id: string;
  name: string;
  currentVersion: number;
  compileStatus: StrategyCompileStatus;
  compileError: string | null;
  createdAt: string;
  updatedAt: string;
}

interface StrategyDetail extends StrategyListItem {
  sourceCode: string;
  compiledCode: string | null;
}

interface StrategyVersionSummary {
  id: string;
  strategyId: string;
  version: number;
  name: string;
  compileStatus: StrategyCompileStatus;
  compileError: string | null;
  createdAt: string;
}

interface StrategyCreateInput {
  name: string;
  sourceCode: string;
}

interface StrategyUpdateInput {
  id: string;
  name?: string;
  sourceCode?: string;
  expectedVersion?: number;
}

interface StrategyCompileResult {
  status: StrategyCompileStatus;
  compiledCode: string | null;
  error: string | null;
}

type StrategyEditorWindowInput = { mode: 'new' } | { mode: 'edit'; strategyId: string };

interface StrategyLimitOrderInput {
  assetId: string;
  side: StrategyOrderSide;
  orderType: 'limit';
  price: number;
  shares: number;
  tickSize?: number;
  negRisk?: boolean;
  postOnly?: boolean;
  expiration?: number;
  idempotencyKey?: string;
}

interface StrategyMarketOrderInput {
  assetId: string;
  side: StrategyOrderSide;
  orderType: 'market';
  amount: number;
  tickSize?: number;
  negRisk?: boolean;
  marketOrderType?: 'FOK' | 'FAK';
  idempotencyKey?: string;
}

type StrategyPlaceOrderInput = StrategyLimitOrderInput | StrategyMarketOrderInput;

interface StrategyBotCreateInput {
  name: string;
  conditionId: string;
  assetId: string;
  strategyId: string;
  strategyVersion?: number | null;
  walletId: string;
  config?: string;
  autoStart?: boolean;
}

interface StrategyBotUpdateInput {
  id: string;
  name?: string;
  assetId?: string;
  strategyId?: string;
  strategyVersion?: number | null;
  walletId?: string;
  config?: string;
  autoStart?: boolean;
  enabled?: boolean;
}

interface StrategyBotListParams {
  marketId?: string;
  eventId?: string;
  strategyId?: string;
  walletId?: string;
  status?: StrategyBotStatus;
  autoStart?: boolean;
  enabled?: boolean;
  limit?: number;
}

interface StrategyBotListItem {
  id: string;
  name: string;
  marketId: string;
  eventId: string;
  conditionId: string | null;
  marketTitle: string;
  eventTitle: string;
  eventImage: string;
  eventActive: boolean | null;
  eventClosed: boolean | null;
  eventEndDate: string | null;
  marketIcon: string;
  assetId: string;
  strategyId: string;
  strategyName: string;
  strategyVersion: number;
  walletId: string;
  walletName: string;
  config: string;
  autoStart: boolean;
  enabled: boolean;
  status: StrategyBotStatus;
  activeRunId: string | null;
  runtimeError: string | null;
  lastRun: StrategyRunListItem | null;
  createdAt: string;
  updatedAt: string;
}

type StrategyBotDetail = StrategyBotListItem;

interface StrategyRunListParams {
  marketId?: string;
  eventId?: string;
  botId?: string;
  strategyId?: string;
  walletId?: string;
  limit?: number;
}

interface StrategyRunListItem {
  id: string;
  botId: string | null;
  marketId: string;
  eventId: string;
  conditionId: string | null;
  marketTitle: string;
  assetId: string;
  strategyId: string;
  strategyName: string;
  walletId: string;
  walletName: string;
  status: StrategyRunStatus;
  runtimeError: string | null;
  strategyVersion: number;
  config: string;
  startedAt: string;
  stoppedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface StrategyRunDetail extends StrategyRunListItem {
  marketSnapshot: string;
  outcomesSnapshot: string;
}

interface StrategyRunLogEntry {
  id: string;
  runId: string;
  level: StrategyLogLevel;
  module: string;
  message: string;
  time: string;
}

interface StrategyRunOrderRecord {
  id: string;
  runId: string;
  walletId: string;
  strategyId: string;
  strategyVersion: number;
  marketId: string;
  conditionId: string | null;
  input: string;
  request: string;
  response: string | null;
  success: boolean;
  exchangeOrderId: string | null;
  status: string | null;
  errorMessage: string | null;
  submittedAt: string;
  createdAt: string;
}

type StrategyRunRuntimeEvent =
  | { type: 'strategy-runs:changed'; marketId?: string }
  | {
      type: 'strategy-run:status';
      runId: string;
      marketId: string;
      status: StrategyRunStatus;
      error?: string | null;
    }
  | { type: 'strategy-run:log'; runId: string; marketId: string; log: StrategyRunLogEntry }
  | {
      type: 'strategy-run:order';
      runId: string;
      marketId: string;
      order: StrategyRunOrderRecord;
    };

type StrategyBotRuntimeEvent =
  | { type: 'bots:changed'; marketId?: string; botId?: string }
  | {
      type: 'bot:status';
      botId: string;
      marketId: string;
      status: StrategyBotStatus;
      activeRunId?: string | null;
      error?: string | null;
    }
  | { type: 'bot:log'; botId: string; marketId: string; runId: string; log: StrategyRunLogEntry }
  | {
      type: 'bot:order';
      botId: string;
      marketId: string;
      runId: string;
      order: StrategyRunOrderRecord;
    };

export type {
  StrategyBotCreateInput,
  StrategyBotDetail,
  StrategyBotListItem,
  StrategyBotListParams,
  StrategyBotRuntimeEvent,
  StrategyBotStatus,
  StrategyBotUpdateInput,
  StrategyCompileResult,
  StrategyCompileStatus,
  StrategyCreateInput,
  StrategyDetail,
  StrategyEditorWindowInput,
  StrategyLimitOrderInput,
  StrategyListItem,
  StrategyLogLevel,
  StrategyMarketOrderInput,
  StrategyOrderSide,
  StrategyPlaceOrderInput,
  StrategyRunDetail,
  StrategyRunListItem,
  StrategyRunListParams,
  StrategyRunLogEntry,
  StrategyRunOrderRecord,
  StrategyRunRuntimeEvent,
  StrategyRunStatus,
  StrategyUpdateInput,
  StrategyVersionSummary,
};
