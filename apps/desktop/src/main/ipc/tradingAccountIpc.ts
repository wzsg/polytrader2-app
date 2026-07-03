import { BrowserWindow, type IpcMain } from 'electron';
import type {
  ManualPlaceOrderInput,
  TradingAccountDataQuery,
  TradingAccountPositionMergeInput,
  TradingAccountPositionRedeemInput,
  TradingAccountPositionSplitInput,
  TradingAccountStatusData,
} from '@polytrader/shared';
import { wrap } from './result.js';
import { polymarketWalletService } from '../services/polymarketWalletService.js';
import { tradingAccountService } from '../services/tradingAccountService.js';

function registerTradingAccountHandlers(ipcMain: IpcMain): void {
  registerTradingAccountEvents();

  ipcMain.handle('trading-account:getStatus', async (_event, walletId: string) => ({
    ok: true,
    data: await getTradingAccountStatus(walletId),
  }));

  ipcMain.handle(
    'trading-account:queryAccount',
    wrap((query?: TradingAccountDataQuery) => {
      const normalized = normalizeTradingAccountDataQuery(query);
      return tradingAccountService.queryAccount({
        ...normalized,
        includeBalance: normalized.includeBalance === true,
      });
    }),
  );

  ipcMain.handle(
    'trading-account:queryOrders',
    wrap((query?: TradingAccountDataQuery) =>
      tradingAccountService.queryOrders(normalizeTradingAccountDataQuery(query)),
    ),
  );
  ipcMain.handle(
    'trading-account:cancelOrder',
    wrap(async (orderId: string, walletId: string) => {
      return tradingAccountService.cancelOrder({
        walletId,
        exchangeOrderId: orderId,
      });
    }),
  );
  ipcMain.handle(
    'trading-account:cancelOrders',
    wrap(async (orderIds: string[], walletId: string) => {
      return tradingAccountService.cancelOrders({
        walletId,
        exchangeOrderIds: orderIds,
      });
    }),
  );
  ipcMain.handle(
    'trading-account:deleteFailedOrder',
    wrap(async (orderId: string, walletId: string) => {
      await tradingAccountService.deleteFailedOrder({
        walletId,
        orderId,
      });
    }),
  );
  ipcMain.handle(
    'trading-account:cancelAll',
    wrap(async (walletId: string) => tradingAccountService.cancelAllOrders({ walletId })),
  );
  ipcMain.handle(
    'trading-account:queryTrades',
    wrap((query?: TradingAccountDataQuery) =>
      tradingAccountService.queryTrades(normalizeTradingAccountDataQuery(query)),
    ),
  );
  ipcMain.handle(
    'trading-account:queryPositions',
    wrap((query?: TradingAccountDataQuery) =>
      tradingAccountService.queryPositions(normalizeTradingAccountDataQuery(query)),
    ),
  );
  ipcMain.handle('trading-account:placeManualOrder', wrap(placeManualOrder));
  ipcMain.handle(
    'trading-account:splitPosition',
    wrap((input: TradingAccountPositionSplitInput) => tradingAccountService.splitPosition(input)),
  );
  ipcMain.handle(
    'trading-account:mergePositions',
    wrap((input: TradingAccountPositionMergeInput) => tradingAccountService.mergePositions(input)),
  );
  ipcMain.handle(
    'trading-account:redeemPositions',
    wrap((input: TradingAccountPositionRedeemInput) =>
      tradingAccountService.redeemPositions(input),
    ),
  );
}

function registerTradingAccountEvents(): void {
  tradingAccountService.on('balance-sync-event', (event) => {
    broadcastTradingAccountEvent({
      type: 'balance-changed',
      walletId: event.walletId,
      reason: event.reason,
      balance: event.balance,
      at: event.at,
    });
  });
  const broadcastOrderDataChanged = (event: {
    walletId: string;
    reason: string;
    at: string;
  }): void => {
    broadcastTradingAccountEvent({
      type: 'orders-changed',
      walletId: event.walletId,
      reason: event.reason,
      at: event.at,
    });
  };
  tradingAccountService.on('order-trading-event', broadcastOrderDataChanged);
  tradingAccountService.on('order-sync-event', broadcastOrderDataChanged);
  tradingAccountService.on('position-sync-event', (event) => {
    if (event.reason === 'sync-position-summary') {
      broadcastTradingAccountEvent({
        type: 'position-summary-changed',
        walletId: event.walletId,
        reason: event.reason,
        positionsTotalValue: event.positionsTotalValue ?? null,
        positionsInitialValue: event.positionsInitialValue ?? null,
        at: event.at,
      });
      return;
    }
    broadcastTradingAccountEvent({
      type: 'positions-changed',
      walletId: event.walletId,
      reason: event.reason,
      at: event.at,
    });
  });
  tradingAccountService.on('trade-sync-event', (event) => {
    broadcastTradingAccountEvent({
      type: 'trades-changed',
      walletId: event.walletId,
      reason: event.reason,
      at: event.at,
    });
  });
}

function broadcastTradingAccountEvent(event: unknown): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.webContents.send('trading-account:event', event);
  }
}

async function getTradingAccountStatus(walletId: string): Promise<TradingAccountStatusData> {
  try {
    const account = await polymarketWalletService.getPolymarketWalletSummary(walletId);
    return {
      credentialsConfigured: account.credentialsConfigured,
      positionsConfigured: Boolean(account.depositWalletAddress.trim()),
    };
  } catch {
    return {
      credentialsConfigured: false,
      positionsConfigured: false,
    };
  }
}

function normalizeTradingAccountDataQuery(
  query: TradingAccountDataQuery | undefined,
): TradingAccountDataQuery {
  const normalized: TradingAccountDataQuery = {
    walletId: normalizeString(query?.walletId),
    limit: normalizeNumber(query?.limit),
    offset: normalizeNumber(query?.offset),
  };
  if (typeof query?.includeBalance === 'boolean') {
    normalized.includeBalance = query.includeBalance;
  }
  if (Object.prototype.hasOwnProperty.call(query ?? {}, 'conditionId')) {
    normalized.conditionId = normalizeString(query?.conditionId) || '';
  }
  return normalized;
}

function normalizeString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  return value.trim() || undefined;
}

function normalizeNumber(value: unknown): number | undefined {
  if (value == null) return undefined;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
}

async function placeManualOrder(input: ManualPlaceOrderInput): Promise<unknown> {
  return tradingAccountService.placeManualOrder({
    ...input,
  });
}

export { registerTradingAccountHandlers };
