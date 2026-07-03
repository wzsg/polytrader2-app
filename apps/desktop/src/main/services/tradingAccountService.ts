import { PolymarketApiClient } from '@polytrader/polymarket-api';
import type { BalanceAllowance } from '@polytrader/shared';
import {
  createSqliteAccountDataRepository,
  createSqliteEventRepository,
} from '@polytrader/sqlite-repository';
import { StrategyRunRepository } from '@polytrader/strategy-runtime';
import { createTradingAccountService } from '@polytrader/trading-account';
import { applicationEventBus } from './applicationEventBus.js';
import { polymarketWalletService } from './polymarketWalletService.js';

const apiClient = PolymarketApiClient.getInstance();
const eventRepository = createSqliteEventRepository();
const accountDataRepository = createSqliteAccountDataRepository();
type AccountCredentialRef = { id: string };

const accountProvider = {
  listPolymarketWallets: () => polymarketWalletService.listPolymarketWallets(),
  listConfiguredPolymarketWalletCredentials: () =>
    polymarketWalletService.listConfiguredPolymarketWalletCredentials(),
  getPolymarketWalletCredential: (walletId: string) =>
    polymarketWalletService.getPolymarketWalletCredential(walletId),
  getPolymarketWalletSummary: (walletId: string) =>
    polymarketWalletService.getPolymarketWalletSummary(walletId),
  getDefaultConfiguredPolymarketWalletCredential: () =>
    polymarketWalletService.getDefaultConfiguredPolymarketWalletCredential(),
  assertPolymarketWalletCredentialsConfigured: async (credential: AccountCredentialRef) =>
    polymarketWalletService.assertPolymarketWalletCredentialsConfigured(
      await polymarketWalletService.getPolymarketWalletCredential(credential.id),
    ),
  updatePolymarketWalletBalance: (walletId: string, balance: BalanceAllowance | null) =>
    polymarketWalletService.updatePolymarketWalletBalance(walletId, balance),
  updatePolymarketWalletPositionSummary: (
    walletId: string,
    summary: {
      positionsTotalValue: number | null;
      positionsInitialValue: number | null;
    },
  ) => polymarketWalletService.updatePolymarketWalletPositionSummary(walletId, summary),
};

const tradingAccountService = createTradingAccountService({
  query: {
    accountDataRepository,
    accountProvider,
  },
  sync: {
    accountRepository: accountDataRepository,
    balanceWriter: {
      updateBalance: (walletId, balance) =>
        accountProvider.updatePolymarketWalletBalance(walletId, balance),
    },
    positionSummaryWriter: {
      updatePositionSummary: (walletId, summary) =>
        accountProvider.updatePolymarketWalletPositionSummary(walletId, summary),
    },
    credentialProvider: {
      getAccount: (walletId) => accountProvider.getPolymarketWalletSummary(walletId),
      listAccounts: () => accountProvider.listPolymarketWallets(),
    },
    client: {
      getBalanceAllowance: async (walletId) =>
        apiClient
          .getPolymarketAccount(await accountProvider.getPolymarketWalletCredential(walletId))
          .getBalanceAllowance(),
      listOpenOrders: async (walletId) =>
        apiClient
          .getPolymarketAccount(await accountProvider.getPolymarketWalletCredential(walletId))
          .listOpenOrders(),
      getOrder: async (walletId, orderId) =>
        apiClient
          .getPolymarketAccount(await accountProvider.getPolymarketWalletCredential(walletId))
          .getOrder(orderId),
      listTrades: async (walletId) =>
        apiClient
          .getPolymarketAccount(await accountProvider.getPolymarketWalletCredential(walletId))
          .listTrades(),
      fetchPositionsByUser: (user) => apiClient.fetchPositionsByUser(user),
    },
    onWarning: (message, reason) => {
      console.warn(message, reason);
    },
    eventBus: applicationEventBus,
  },
  order: {
    accountDataRepository,
    marketResolver: {
      getMarketByAssetId: (assetId) => eventRepository.getMarketByClobTokenId(assetId),
    },
    apiClient,
    credentialProvider: {
      getCredential: (walletId) => accountProvider.getPolymarketWalletCredential(walletId),
    },
    strategyRunRepository: new StrategyRunRepository(),
  },
  position: {
    apiClient,
    credentialProvider: {
      getCredential: (walletId) => accountProvider.getPolymarketWalletCredential(walletId),
    },
    marketResolver: {
      getMarketByConditionId: (conditionId) => eventRepository.getMarketByConditionId(conditionId),
    },
  },
});

export { tradingAccountService };
