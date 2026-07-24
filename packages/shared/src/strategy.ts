export const DEFAULT_STRATEGY_SOURCE = `{
  "schemaVersion": 1,
  "parameters": {
    "maxEntryPrice": {
      "type": "decimal",
      "defaultValue": "0.45",
      "minimum": "0.01",
      "maximum": "0.99",
      "description": "Highest accepted ask price"
    },
    "orderShares": {
      "type": "decimal",
      "defaultValue": "5",
      "minimum": "1",
      "maximum": "100"
    }
  },
  "state": {
    "positionEntered": {
      "type": "boolean",
      "initialValue": false
    }
  },
  "rules": [
    {
      "id": "rule.entry",
      "trigger": {
        "id": "trigger.entry.book",
        "kind": "orderBook.changed",
        "outcome": "selected"
      },
      "condition": {
        "id": "condition.entry",
        "kind": "logical",
        "operator": "all",
        "items": [
          {
            "id": "condition.market.active",
            "kind": "compare",
            "operator": "eq",
            "left": {
              "id": "reference.market.active",
              "kind": "reference",
              "source": "market",
              "field": "active"
            },
            "right": {
              "id": "literal.market.active",
              "kind": "literal.boolean",
              "value": true
            }
          },
          {
            "id": "condition.entry.price",
            "kind": "compare",
            "operator": "lte",
            "left": {
              "id": "reference.entry.ask",
              "kind": "reference",
              "source": "orderBook",
              "field": "bestAsk",
              "outcome": "selected"
            },
            "right": {
              "id": "parameter.entry.maxPrice",
              "kind": "parameter",
              "name": "maxEntryPrice"
            }
          },
          {
            "id": "condition.account.balance",
            "kind": "compare",
            "operator": "gte",
            "left": {
              "id": "reference.account.balance",
              "kind": "reference",
              "source": "account",
              "field": "availableBalance"
            },
            "right": {
              "id": "literal.account.balance",
              "kind": "literal.decimal",
              "value": "100"
            }
          }
        ]
      },
      "actions": [
        {
          "id": "action.entry.place",
          "kind": "order.place",
          "asset": "selected",
          "side": "BUY",
          "order": {
            "orderType": "limit",
            "price": {
              "id": "reference.entry.orderPrice",
              "kind": "reference",
              "source": "orderBook",
              "field": "bestAsk",
              "outcome": "selected"
            },
            "shares": {
              "id": "parameter.entry.shares",
              "kind": "parameter",
              "name": "orderShares"
            },
            "postOnly": false
          }
        },
        {
          "id": "action.entry.state",
          "kind": "state.set",
          "name": "positionEntered",
          "value": {
            "id": "literal.entry.state",
            "kind": "literal.boolean",
            "value": true
          }
        }
      ],
      "policy": {
        "cooldownMs": 1000
      }
    }
  ],
  "riskPolicy": {
    "maximumOpenOrders": 2,
    "maximumOrderValue": "10",
    "minimumOrderIntervalMs": 1000
  }
}`;

export const STRATEGY_CONTEXT_DTS = `
type StrategyOrderSide = 'BUY' | 'SELL';

interface StrategyBotInfo {
  id: string;
  name: string;
  marketId: string;
  eventId: string;
  strategyId: string;
  strategyVersion: number;
  walletId: string;
}

interface StrategyRunInfo {
  id: string;
  botId: string;
  marketId: string;
  strategyId: string;
  strategyVersion: number;
  startedAt: string;
}

interface StrategyLogger {
  debug(message: string, data?: unknown): void;
  info(message: string, data?: unknown): void;
  warn(message: string, data?: unknown): void;
  error(message: string, data?: unknown): void;
}

interface StrategyAccount {
  id: string;
  name: string;
  walletAddress: string;
  credentialsConfigured: boolean;
  depositWalletAddress: string;
  signatureType: number;
  chainId: number;
  clobHost: string;
  isDefault: boolean;
}

interface StrategyContextMarket {
  id: string;
  conditionId: string;
  title: string;
  active: boolean;
  closed: boolean;
  volume: number;
  volume24hr: number;
  liquidity: number;
}

interface StrategyMarketOutcome {
  tokenId: string;
  label: string;
  price: unknown;
  tickSize: number | null;
}

interface StrategyOrderBookLevel {
  price: string;
  size: string;
}

interface StrategyOrderBook {
  tokenId: string;
  label: string;
  bids: StrategyOrderBookLevel[];
  asks: StrategyOrderBookLevel[];
  tickSize: number;
  minOrderSize: string | null;
  lastTradePrice: string | null;
  lastTradeSide: string | null;
  lastTradePriceRaw: string | null;
  unavailable: boolean;
}

interface StrategyMarketTradeTick {
  id: string;
  tokenId: string;
  outcome?: string;
  side?: string;
  price?: string | number;
  priceRaw?: string | number;
  size?: string | number;
  timestamp?: string | number;
  transactionHash?: string;
  source: 'history' | 'live';
}

interface StrategyPriceHistoryPoint {
  t: number;
  p: number;
}

type StrategyRuntimeLoadScope =
  | 'gammaEvent'
  | 'marketDetail'
  | 'orderBook'
  | 'priceHistory'
  | 'marketTrades'
  | 'strategy';

type StrategyRuntimeConnectionStatus = 'idle' | 'loading' | 'ready' | 'error';
type StrategyRuntimeWsStatus = 'disconnected' | 'connecting' | 'live' | 'error';

interface StrategyAccountOrder {
  id: string;
  wallet_id?: string;
  order_id?: string;
  exchange_order_id?: string | null;
  market_id?: string;
  event_id?: string;
  event_title?: string;
  event_icon?: string;
  market_title?: string;
  market_icon?: string;
  status?: string;
  error_message?: string;
  side?: string;
  asset_id?: string;
  token_id?: string;
  market?: string;
  condition_id?: string;
  price?: string | number;
  original_size?: string | number;
  size_matched?: string | number;
  amount?: string | number;
  order_type?: string;
  outcome?: string;
  created_at?: string | number;
  owner?: string;
  maker_address?: string;
  expiration?: string | number;
  associate_trades?: string[];
}

interface StrategyAccountTrade {
  id?: string;
  market_id?: string;
  event_id?: string;
  event_title?: string;
  event_icon?: string;
  market_title?: string;
  market_icon?: string;
  taker_order_id?: string;
  conditionId?: string;
  condition_id?: string;
  market?: string;
  asset_id?: string;
  side?: string;
  price?: string | number;
  size?: string | number;
  fee_rate_bps?: string | number;
  status?: string;
  outcome?: string;
  match_time?: string | number;
  last_update?: string | number;
  bucket_index?: number;
  owner?: string;
  maker_address?: string;
  transaction_hash?: string;
  trader_side?: string;
}

interface StrategyAccountPosition {
  market_id?: string;
  event_id?: string;
  event_title?: string;
  event_icon?: string;
  market_title?: string;
  market_icon?: string;
  asset?: string;
  conditionId?: string;
  size?: number;
  avgPrice?: number;
  initialValue?: number;
  currentValue?: number;
  cashPnl?: number;
  percentPnl?: number;
  totalBought?: number;
  realizedPnl?: number;
  percentRealizedPnl?: number;
  curPrice?: number;
  redeemable?: boolean;
  mergeable?: boolean;
  title?: string;
  slug?: string;
  icon?: string;
  eventSlug?: string;
  outcome?: string;
  outcomeIndex?: number;
  oppositeOutcome?: string;
  oppositeAsset?: string;
  endDate?: string;
  negativeRisk?: boolean;
}

interface StrategyBalanceAllowanceToken {
  address: string;
  label: string;
  raw: string;
  formatted: string;
}

interface StrategyBalanceAllowance {
  balances: StrategyBalanceAllowanceToken[];
  allowances: StrategyBalanceAllowanceToken[];
}

interface StrategyRuntimeAccountState {
  accounts: StrategyAccount[];
  selectedWalletId: string;
  credentialsConfigured: boolean;
  positionsConfigured: boolean;
  balance: StrategyBalanceAllowance | null;
  orders: StrategyAccountOrder[];
  positions: StrategyAccountPosition[];
  trades: StrategyAccountTrade[];
  error: string;
  updatedAt: string | null;
}

interface StrategyMarketTradeListResult {
  items: StrategyMarketTradeTick[];
  total: number;
  hasMore: boolean;
  lastSyncedAt: string | null;
  error?: string;
}

interface StrategyRuntimeMarketTradeState {
  recent: StrategyMarketTradeListResult | null;
  error: string;
  updatedAt: string | null;
}

interface StrategyRuntimeSnapshot {
  marketId: string;
  eventId: string;
  selectedTokenId: string;
  selectedOutcome: string | null;
  status: Record<StrategyRuntimeLoadScope, StrategyRuntimeConnectionStatus>;
  errors: Partial<Record<StrategyRuntimeLoadScope, string>>;
  event: unknown | null;
  marketDetail: unknown | null;
  orderBooks: StrategyOrderBook[];
  recentLiveTrades: StrategyMarketTradeTick[];
  wsStatus: StrategyRuntimeWsStatus;
  priceHistory: Record<string, StrategyPriceHistoryPoint[]>;
  marketTrades: StrategyRuntimeMarketTradeState;
  strategy: unknown;
  updatedAt: string | null;
}

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

interface StrategyTradingBridge {
  placeOrder(input: StrategyPlaceOrderInput): Promise<unknown>;
  cancelOrder(orderId: string): Promise<unknown>;
  cancelAllOrders(): Promise<unknown>;
}

interface StrategyMarketDataBridge {
  getSnapshot(): Promise<StrategyRuntimeSnapshot | null>;
  loadMarketDetail(): Promise<StrategyRuntimeSnapshot>;
  loadPriceHistory(interval?: string, fidelity?: number): Promise<StrategyRuntimeSnapshot>;
  loadTrades(): Promise<StrategyRuntimeSnapshot>;
}

interface StrategyContext {
  bot: StrategyBotInfo;
  run: StrategyRunInfo;
  market: StrategyContextMarket;
  outcomes: StrategyMarketOutcome[];
  assetId: string;
  account: StrategyAccount;
  config: Record<string, unknown>;
  logger: StrategyLogger;
  marketData: StrategyMarketDataBridge;
  trading: StrategyTradingBridge;
}

declare abstract class StrategyBase {
  onStart?(ctx: StrategyContext): void | Promise<void>;
  onMarketData?(ctx: StrategyContext, snapshot: StrategyRuntimeSnapshot): void | Promise<void>;
  onOrderBook?(ctx: StrategyContext, orderBooks: StrategyOrderBook[]): void | Promise<void>;
  onTrade?(ctx: StrategyContext, trades: StrategyMarketTradeTick[]): void | Promise<void>;
  onAccount?(ctx: StrategyContext, walletState: StrategyRuntimeAccountState): void | Promise<void>;
  onStop?(ctx: StrategyContext): void | Promise<void>;
}

declare const console: {
  log(...args: unknown[]): void;
  debug(...args: unknown[]): void;
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
};
declare function setTimeout(handler: (...args: unknown[]) => void, timeout?: number, ...args: unknown[]): number;
declare function clearTimeout(handle?: number): void;
declare function setInterval(handler: (...args: unknown[]) => void, timeout?: number, ...args: unknown[]): number;
declare function clearInterval(handle?: number): void;
`;
