import { PolymarketApiClient } from '@polytrader/polymarket-api';
import { createSqlitePolymarketWalletRepository } from '@polytrader/sqlite-repository';
import { createPolymarketWalletService } from '@polytrader/polymarket-wallet';
import { applicationEventBus } from './applicationEventBus.js';
import { desktopWorkflowService } from './workflowService.js';
import { walletEncryptionService } from './walletEncryptionService.js';

const polymarketApiClient = PolymarketApiClient.getInstance();

const polymarketWalletService = createPolymarketWalletService({
  secretStore: walletEncryptionService,
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
