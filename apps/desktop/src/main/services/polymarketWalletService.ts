import { PolymarketApiClient } from '@polytrader/polymarket-api';
import { createSqlitePolymarketWalletRepository } from '@polytrader/sqlite-repository';
import { createPolymarketWalletService } from '@polytrader/polymarket-wallet';
import electron from 'electron';
import { applicationEventBus } from './applicationEventBus.js';
import { desktopWorkflowService } from './workflowService.js';

const { safeStorage } = electron;

const polymarketApiClient = PolymarketApiClient.getInstance();

const polymarketWalletService = createPolymarketWalletService({
  safeStorage: {
    isEncryptionAvailable: () => safeStorage.isEncryptionAvailable(),
    encryptString: (value) => safeStorage.encryptString(value),
    decryptString: (encrypted) => safeStorage.decryptString(encrypted),
  },
  accountCredentialDeriver: polymarketApiClient,
  depositWalletDeployer: polymarketApiClient,
  depositWalletApprover: polymarketApiClient,
  initializationWorkflowScheduler: desktopWorkflowService,
  repository: createSqlitePolymarketWalletRepository(),
  eventBus: applicationEventBus,
});

desktopWorkflowService.registerPolymarketWalletInitializationHandler((input) =>
  polymarketWalletService.initializePolymarketWallet(input.walletId, input.nonce),
);

export { polymarketWalletService };
