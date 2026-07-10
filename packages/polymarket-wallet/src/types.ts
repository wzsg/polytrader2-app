import type {
  PolymarketWalletPositionSummary,
  PolymarketWalletRepository,
} from '@polytrader/repository-contract';
import type { ApplicationEventBus } from '@polytrader/event-bus';
import type {
  BalanceAllowance,
  PolymarketAccountCredentialDerivationInput,
  PolymarketAccountCredentialDerivationResult,
  PolymarketWalletCreateInput,
  PolymarketWalletCreationType,
  PolymarketWalletDerivedInput,
  PolymarketWalletInitializationStatus,
  PolymarketWalletImportInput,
  PolymarketWalletKeyMaterialReveal,
  PolymarketWalletSummary,
  PolymarketWalletUpdateInput,
  PolymarketWalletWalletKeyMaterialType,
} from '@polytrader/shared';
import type { WalletKeyMaterialSecurityService } from './security/walletKeyMaterialSecurityService.js';

type PolymarketStrategyWalletSummary = Omit<
  PolymarketWalletSummary,
  | 'apiKeyMasked'
  | 'secretMasked'
  | 'passphraseMasked'
  | 'relayerApiKeyMasked'
  | 'balance'
  | 'positionsTotalValue'
  | 'positionsInitialValue'
  | 'createdAt'
  | 'updatedAt'
>;

interface PolymarketWalletCredential {
  id: string;
  name: string;
  creationType: PolymarketWalletCreationType;
  walletKeyMaterialType: PolymarketWalletWalletKeyMaterialType;
  parentWalletId: string | null;
  derivationPath: string | null;
  privateKey: string;
  walletAddress: string;
  apiKey: string;
  secret: string;
  passphrase: string;
  depositWalletAddress: string;
  relayerApiKey: string;
  signatureType: number;
  chainId: number;
  clobHost: string;
  initializationStatus: PolymarketWalletInitializationStatus;
  initializationError: string;
  keyMaterialBackedUp: boolean;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

interface PolymarketAccountCredentialDeriver {
  derivePolymarketAccountCredentials(
    input: PolymarketAccountCredentialDerivationInput,
  ): Promise<PolymarketAccountCredentialDerivationResult>;
}

interface PolymarketDepositWalletDeploymentInput {
  id?: string;
  privateKey: string;
  apiKey: string;
  secret: string;
  passphrase: string;
  depositWalletAddress: string;
  signatureType?: number;
  chainId?: number;
  clobHost?: string;
  relayerApiBaseUrl?: string;
}

interface PolymarketDepositWalletDeploymentResult {
  transactionID?: string;
  state?: string;
  transactionHash?: string;
  hash?: string;
}

interface PolymarketDepositWalletDeployer {
  deployDepositWallet(
    input: PolymarketDepositWalletDeploymentInput,
  ): Promise<PolymarketDepositWalletDeploymentResult>;
}

type PolymarketDepositWalletApprovalInput = PolymarketDepositWalletDeploymentInput;
type PolymarketDepositWalletApprovalResult = PolymarketDepositWalletDeploymentResult;

interface PolymarketDepositWalletApprover {
  approvePolymarket(
    input: PolymarketDepositWalletApprovalInput,
  ): Promise<PolymarketDepositWalletApprovalResult>;
}

interface PolymarketWalletInitializationResult {
  wallet: PolymarketWalletSummary;
  depositWalletDeployment: PolymarketDepositWalletDeploymentResult | null;
  polymarketApproval: PolymarketDepositWalletApprovalResult | null;
}

interface PolymarketWalletInitializationWorkflowInput {
  walletId: string;
  nonce?: number;
}

interface PolymarketWalletInitializationWorkflowScheduler {
  enqueuePolymarketWalletInitialization(
    input: PolymarketWalletInitializationWorkflowInput,
  ): Promise<void>;
}

interface PolymarketWalletServiceOptions {
  secretStore: WalletKeyMaterialSecurityService;
  accountCredentialDeriver: PolymarketAccountCredentialDeriver;
  depositWalletDeployer: PolymarketDepositWalletDeployer;
  depositWalletApprover: PolymarketDepositWalletApprover;
  initializationWorkflowScheduler: PolymarketWalletInitializationWorkflowScheduler;
  repository: PolymarketWalletRepository;
  eventBus?: ApplicationEventBus;
}

interface PolymarketWalletService {
  /**
   * Read and validation methods.
   */

  /**
   * List all Polymarket wallet summaries.
   */
  listPolymarketWallets(): Promise<PolymarketWalletSummary[]>;

  /**
   * List Polymarket wallet credentials that are fully configured.
   */
  listConfiguredPolymarketWalletCredentials(): Promise<PolymarketWalletCredential[]>;

  /**
   * List wallet summaries for strategy modules.
   */
  listStrategyWallets(): Promise<PolymarketStrategyWalletSummary[]>;

  /**
   * Read complete credentials for a wallet.
   */
  getPolymarketWalletCredential(id: string): Promise<PolymarketWalletCredential>;

  /**
   * Read summary data for a wallet.
   */
  getPolymarketWalletSummary(id: string): Promise<PolymarketWalletSummary>;

  /**
   * Read wallet key material such as a private key or mnemonic.
   */
  getPolymarketWalletKeyMaterial(id: string): Promise<PolymarketWalletKeyMaterialReveal>;

  /**
   * Read complete credentials for the default Polymarket wallet.
   */
  getDefaultPolymarketWalletCredential(): Promise<PolymarketWalletCredential | null>;

  /**
   * Read complete credentials for the default configured Polymarket wallet.
   */
  getDefaultConfiguredPolymarketWalletCredential(): Promise<PolymarketWalletCredential | null>;

  /**
   * Assert that wallet credentials are fully configured.
   */
  assertPolymarketWalletCredentialsConfigured(credential: PolymarketWalletCredential): void;

  /**
   * Read the default Polymarket wallet summary.
   */
  getDefaultPolymarketWalletSummary(): Promise<PolymarketWalletSummary | null>;

  /**
   * Write and mutation methods.
   */

  /**
   * Create a Polymarket wallet.
   */
  createPolymarketWallet(input: PolymarketWalletCreateInput): Promise<PolymarketWalletSummary>;

  /**
   * Import an existing Polymarket wallet.
   */
  importPolymarketWallet(input: PolymarketWalletImportInput): Promise<PolymarketWalletSummary>;

  /**
   * Derive a new Polymarket wallet from a parent wallet.
   */
  createDerivedPolymarketWallet(
    input: PolymarketWalletDerivedInput,
  ): Promise<PolymarketWalletSummary>;

  /**
   * Initialize a newly created wallet through the background workflow runtime.
   */
  initializePolymarketWallet(
    id: string,
    nonce?: number,
  ): Promise<PolymarketWalletInitializationResult>;

  /**
   * Retry a failed wallet initialization through the background workflow runtime.
   */
  retryPolymarketWalletInitialization(id: string): Promise<PolymarketWalletSummary>;

  /**
   * Update a Polymarket wallet's base configuration.
   */
  updatePolymarketWallet(input: PolymarketWalletUpdateInput): Promise<PolymarketWalletSummary>;

  /**
   * Mark a wallet's key material as backed up.
   */
  markPolymarketWalletKeyMaterialBackedUp(id: string): Promise<PolymarketWalletSummary>;

  /**
   * Update a wallet balance and allowance snapshot.
   */
  updatePolymarketWalletBalance(id: string, balance: BalanceAllowance | null): Promise<boolean>;

  /**
   * Update a wallet position summary snapshot.
   */
  updatePolymarketWalletPositionSummary(
    id: string,
    summary: PolymarketWalletPositionSummary,
  ): Promise<boolean>;

  /**
   * Set the default Polymarket wallet.
   */
  setDefaultPolymarketWallet(id: string): Promise<PolymarketWalletSummary>;

  /**
   * Delete a Polymarket wallet.
   */
  deletePolymarketWallet(id: string): Promise<void>;
}

export type {
  PolymarketAccountCredentialDeriver,
  PolymarketDepositWalletApprover,
  PolymarketDepositWalletApprovalInput,
  PolymarketDepositWalletApprovalResult,
  PolymarketDepositWalletDeployer,
  PolymarketDepositWalletDeploymentInput,
  PolymarketDepositWalletDeploymentResult,
  PolymarketWalletInitializationWorkflowInput,
  PolymarketWalletInitializationWorkflowScheduler,
  PolymarketWalletInitializationResult,
  PolymarketWalletCredential,
  PolymarketWalletService,
  PolymarketWalletServiceOptions,
  PolymarketStrategyWalletSummary,
};
