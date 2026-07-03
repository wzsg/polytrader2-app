import { PolymarketApiClient } from '@polytrader/polymarket-api';
import { createSqlitePolymarketWithdrawalRepository } from '@polytrader/sqlite-repository';
import type {
  PolymarketBridgeAddressResponse,
  PolymarketBridgeDepositInput,
  PolymarketBridgeQuoteInput,
  PolymarketBridgeQuoteResponse,
  PolymarketBridgeSupportedAssetsResponse,
  PolymarketBridgeTransactionStatusResponse,
  PolymarketBridgeWithdrawalRecord,
  PolymarketBridgeWithdrawalInput,
  PolymarketBridgeWithdrawalSubmitResult,
} from '@polytrader/shared';
import type { PolymarketWithdrawalRepository } from '@polytrader/repository-contract';
import { applicationEventBus } from './applicationEventBus.js';
import { polymarketWalletService } from './polymarketWalletService.js';
import { tradingAccountService } from './tradingAccountService.js';
import { desktopWorkflowService } from './workflowService.js';

const POLYGON_CHAIN_ID = '137';
const PUSD_TOKEN_ADDRESS = '0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB';
const COLLATERAL_DECIMALS = 6;
const WITHDRAWAL_BRIDGE_TIMEOUT_MS = 10 * 60 * 1000;
const WITHDRAWAL_BRIDGE_POLL_INTERVAL_MS = 5000;

class PolymarketBridgeService {
  private readonly _apiClient: PolymarketApiClient;
  private readonly _withdrawalRepository: PolymarketWithdrawalRepository;

  public constructor(
    apiClient: PolymarketApiClient,
    withdrawalRepository: PolymarketWithdrawalRepository,
  ) {
    this._apiClient = apiClient;
    this._withdrawalRepository = withdrawalRepository;
  }

  public listSupportedAssets(): Promise<PolymarketBridgeSupportedAssetsResponse> {
    return this._apiClient.listBridgeSupportedAssets();
  }

  public async createDeposit(
    input: PolymarketBridgeDepositInput,
  ): Promise<PolymarketBridgeAddressResponse> {
    const credential = await this._getConfiguredCredential(input.walletId);
    return this._apiClient.createBridgeDeposit({ address: credential.depositWalletAddress });
  }

  public async quoteTransfer(
    input: PolymarketBridgeQuoteInput,
  ): Promise<PolymarketBridgeQuoteResponse> {
    return this._apiClient.quoteBridgeTransfer({
      fromAmountBaseUnit: this._collateralAmountBaseUnits(input.amount),
      fromChainId: POLYGON_CHAIN_ID,
      fromTokenAddress: PUSD_TOKEN_ADDRESS,
      recipientAddress: this._requireText(input.recipientAddress, 'Recipient address'),
      toChainId: this._requireText(input.toChainId, 'Destination chain ID'),
      toTokenAddress: this._requireText(input.toTokenAddress, 'Destination token address'),
    });
  }

  public async withdraw(
    input: PolymarketBridgeWithdrawalInput,
  ): Promise<PolymarketBridgeWithdrawalSubmitResult> {
    const credential = await this._getConfiguredCredential(input.walletId);
    const amount = this._collateralAmountBaseUnits(input.amount);
    const withdrawal = await this._withdrawalRepository.create({
      walletId: credential.id,
      walletAddress: credential.walletAddress,
      depositWalletAddress: credential.depositWalletAddress,
      amount: this._amountText(input.amount),
      amountBaseUnits: amount,
      fromChainId: POLYGON_CHAIN_ID,
      fromTokenAddress: PUSD_TOKEN_ADDRESS,
      toChainId: this._requireText(input.toChainId, 'Destination chain ID'),
      toTokenAddress: this._requireText(input.toTokenAddress, 'Destination token address'),
      recipientAddress: this._requireText(input.recipientAddr, 'Recipient address'),
    });
    this._publishCreated(withdrawal);
    await desktopWorkflowService.enqueuePolymarketBridgeWithdrawal({
      withdrawalId: withdrawal.id,
      walletId: withdrawal.walletId,
    });
    return { withdrawal };
  }

  public async runWithdrawalWorkflow(
    withdrawalId: string,
  ): Promise<PolymarketBridgeWithdrawalRecord> {
    let current = await this._withdrawalRepository.get(
      this._requireText(withdrawalId, 'Withdrawal ID'),
    );
    try {
      current = await this._updateWithdrawal(current.id, {
        status: 'creating_bridge_address',
        errorMessage: null,
      });
      const credential = await this._getConfiguredCredential(current.walletId);
      const withdrawal = await this._apiClient.createBridgeWithdrawal({
        address: credential.depositWalletAddress,
        toChainId: current.toChainId,
        toTokenAddress: current.toTokenAddress,
        recipientAddr: current.recipientAddress,
      });
      const bridgeAddress = this._requireEvmBridgeAddress(withdrawal);
      current = await this._updateWithdrawal(current.id, {
        status: 'transferring_pusd',
        bridgeAddress,
        bridgeResponse: withdrawal,
      });

      const account = this._apiClient.getPolymarketAccount(credential);
      const nonce = await account.getRelayerNonce();
      const transfer = await account.transferPusd({
        nonce,
        to: bridgeAddress as `0x${string}`,
        amount: current.amountBaseUnits,
      });
      current = await this._updateWithdrawal(current.id, {
        status: 'waiting_bridge_completion',
        relayerTransactionId: transfer.transactionID,
        relayerTransactionState: transfer.state,
        relayerTransactionHash: transfer.transactionHash ?? transfer.hash ?? null,
        submittedAt: this._now(),
      });
      tradingAccountService.scheduleAccountSync(credential.id);
      return await this._waitForBridgeCompletion(current);
    } catch (error) {
      const failed = await this._updateWithdrawal(current.id, {
        status: 'failed',
        errorMessage: this._errorMessage(error),
        completedAt: this._now(),
      });
      tradingAccountService.scheduleAccountSync(failed.walletId);
      this._publishFailed(failed);
      throw error;
    }
  }

  public getTransactionStatus(address: string): Promise<PolymarketBridgeTransactionStatusResponse> {
    return this._apiClient.getBridgeTransactionStatus(address);
  }

  public listWithdrawals(
    walletId?: string,
    limit?: number,
  ): Promise<PolymarketBridgeWithdrawalRecord[]> {
    const normalizedWalletId = walletId?.trim();
    return normalizedWalletId
      ? this._withdrawalRepository.listByWallet(normalizedWalletId, limit)
      : this._withdrawalRepository.listRecent(limit);
  }

  private async _getConfiguredCredential(walletId: string) {
    const credential = await polymarketWalletService.getPolymarketWalletCredential(
      this._requireText(walletId, 'Wallet ID'),
    );
    polymarketWalletService.assertPolymarketWalletCredentialsConfigured(credential);
    return credential;
  }

  private _requireEvmBridgeAddress(withdrawal: PolymarketBridgeAddressResponse): string {
    const bridgeAddress = withdrawal.address.evm?.trim();
    if (!bridgeAddress || !/^0x[a-fA-F0-9]{40}$/.test(bridgeAddress)) {
      throw new Error('Bridge API did not return an EVM withdrawal address');
    }
    return bridgeAddress;
  }

  private _collateralAmountBaseUnits(amount: string | number): string {
    const normalized = this._amountText(amount);
    const [integerPart, decimalPart = ''] = normalized.split('.');
    const paddedDecimalPart = decimalPart.padEnd(COLLATERAL_DECIMALS, '0');
    const baseUnits = `${integerPart}${paddedDecimalPart}`.replace(/^0+/, '') || '0';
    if (baseUnits === '0') throw new Error('Amount must be greater than 0');
    return baseUnits;
  }

  private _amountText(amount: string | number): string {
    const normalized = typeof amount === 'number' ? this._numberAmountText(amount) : amount.trim();
    if (!/^\d+(?:\.\d{1,6})?$/.test(normalized)) {
      throw new Error('Amount must be a positive decimal with at most 6 decimal places');
    }
    return normalized;
  }

  private _numberAmountText(amount: number): string {
    if (!Number.isFinite(amount) || amount <= 0) throw new Error('Amount must be greater than 0');
    return amount.toString();
  }

  private _requireText(value: string, name: string): string {
    const normalized = String(value ?? '').trim();
    if (!normalized) throw new Error(`${name} is required`);
    return normalized;
  }

  private async _waitForBridgeCompletion(
    withdrawal: PolymarketBridgeWithdrawalRecord,
  ): Promise<PolymarketBridgeWithdrawalRecord> {
    const bridgeAddress = this._requireText(withdrawal.bridgeAddress ?? '', 'Bridge address');
    const startedAt = Date.now();
    let current = withdrawal;
    while (Date.now() - startedAt < WITHDRAWAL_BRIDGE_TIMEOUT_MS) {
      const response = await this._apiClient.getBridgeTransactionStatus(bridgeAddress);
      const status = this._resolveBridgeStatus(response);
      current = await this._updateWithdrawal(current.id, {
        bridgeStatus: status,
        bridgeStatusResponse: response,
      });
      if (status === 'COMPLETED') {
        const succeeded = await this._updateWithdrawal(current.id, {
          status: 'succeeded',
          completedAt: this._now(),
        });
        tradingAccountService.scheduleAccountSync(succeeded.walletId);
        this._publishSucceeded(succeeded);
        return succeeded;
      }
      if (status === 'FAILED') {
        const failed = await this._updateWithdrawal(current.id, {
          status: 'failed',
          errorMessage: 'Bridge transaction failed',
          completedAt: this._now(),
        });
        tradingAccountService.scheduleAccountSync(failed.walletId);
        this._publishFailed(failed);
        return failed;
      }
      await this._sleep(WITHDRAWAL_BRIDGE_POLL_INTERVAL_MS);
    }

    const timedOut = await this._updateWithdrawal(current.id, {
      status: 'timed_out',
      errorMessage: 'Bridge transaction did not complete within 10 minutes',
      completedAt: this._now(),
    });
    tradingAccountService.scheduleAccountSync(timedOut.walletId);
    this._publishTimedOut(timedOut);
    return timedOut;
  }

  private _resolveBridgeStatus(
    response: PolymarketBridgeTransactionStatusResponse,
  ): PolymarketBridgeWithdrawalRecord['bridgeStatus'] {
    const statuses = response.transactions.map((transaction) => transaction.status).filter(Boolean);
    if (statuses.includes('COMPLETED')) return 'COMPLETED';
    if (statuses.includes('FAILED')) return 'FAILED';
    return statuses[0] ?? null;
  }

  private async _updateWithdrawal(
    id: string,
    fields: Parameters<PolymarketWithdrawalRepository['update']>[1],
  ): Promise<PolymarketBridgeWithdrawalRecord> {
    const previousWithdrawal = await this._withdrawalRepository.get(id);
    const withdrawal = await this._withdrawalRepository.update(id, fields);
    this._publishUpdated(withdrawal, previousWithdrawal);
    return withdrawal;
  }

  private _publishCreated(withdrawal: PolymarketBridgeWithdrawalRecord): void {
    applicationEventBus.publish('polymarket-withdrawal:created', {
      withdrawal,
      at: this._now(),
    });
  }

  private _publishUpdated(
    withdrawal: PolymarketBridgeWithdrawalRecord,
    previousWithdrawal: PolymarketBridgeWithdrawalRecord,
  ): void {
    applicationEventBus.publish('polymarket-withdrawal:updated', {
      withdrawal,
      previousWithdrawal,
      at: this._now(),
    });
  }

  private _publishSucceeded(withdrawal: PolymarketBridgeWithdrawalRecord): void {
    applicationEventBus.publish('polymarket-withdrawal:succeeded', {
      withdrawal,
      at: this._now(),
    });
  }

  private _publishFailed(withdrawal: PolymarketBridgeWithdrawalRecord): void {
    applicationEventBus.publish('polymarket-withdrawal:failed', {
      withdrawal,
      at: this._now(),
    });
  }

  private _publishTimedOut(withdrawal: PolymarketBridgeWithdrawalRecord): void {
    applicationEventBus.publish('polymarket-withdrawal:timed-out', {
      withdrawal,
      at: this._now(),
    });
  }

  private _errorMessage(error: unknown): string {
    if (error instanceof Error && error.message.trim()) return error.message.trim();
    if (typeof error === 'string' && error.trim()) return error.trim();
    return 'Unknown withdrawal error';
  }

  private _sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }

  private _now(): string {
    return new Date().toISOString();
  }
}

const polymarketBridgeService = new PolymarketBridgeService(
  PolymarketApiClient.getInstance(),
  createSqlitePolymarketWithdrawalRepository(),
);

desktopWorkflowService.registerPolymarketBridgeWithdrawalHandler((input) =>
  polymarketBridgeService.runWithdrawalWorkflow(input.withdrawalId),
);

export { polymarketBridgeService, PolymarketBridgeService };
