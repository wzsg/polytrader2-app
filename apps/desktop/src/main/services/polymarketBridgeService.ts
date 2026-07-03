import { PolymarketApiClient } from '@polytrader/polymarket-api';
import type {
  PolymarketBridgeAddressResponse,
  PolymarketBridgeDepositInput,
  PolymarketBridgeQuoteInput,
  PolymarketBridgeQuoteResponse,
  PolymarketBridgeSupportedAssetsResponse,
  PolymarketBridgeTransactionStatusResponse,
  PolymarketBridgeWithdrawalInput,
  PolymarketBridgeWithdrawalResult,
} from '@polytrader/shared';
import { polymarketWalletService } from './polymarketWalletService.js';
import { tradingAccountService } from './tradingAccountService.js';

const POLYGON_CHAIN_ID = '137';
const PUSD_TOKEN_ADDRESS = '0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB';
const COLLATERAL_DECIMALS = 6;

class PolymarketBridgeService {
  private readonly _apiClient: PolymarketApiClient;

  public constructor(apiClient: PolymarketApiClient) {
    this._apiClient = apiClient;
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
  ): Promise<PolymarketBridgeWithdrawalResult> {
    const credential = await this._getConfiguredCredential(input.walletId);
    const amount = this._collateralAmountBaseUnits(input.amount);
    const withdrawal = await this._apiClient.createBridgeWithdrawal({
      address: credential.depositWalletAddress,
      toChainId: this._requireText(input.toChainId, 'Destination chain ID'),
      toTokenAddress: this._requireText(input.toTokenAddress, 'Destination token address'),
      recipientAddr: this._requireText(input.recipientAddr, 'Recipient address'),
    });
    const bridgeAddress = this._requireEvmBridgeAddress(withdrawal);
    const account = this._apiClient.getPolymarketAccount(credential);
    const nonce = await account.getRelayerNonce();
    const transfer = await account.transferPusd({
      nonce,
      to: bridgeAddress as `0x${string}`,
      amount,
    });
    tradingAccountService.scheduleAccountSync(credential.id);
    return { withdrawal, bridgeAddress, transfer };
  }

  public getTransactionStatus(address: string): Promise<PolymarketBridgeTransactionStatusResponse> {
    return this._apiClient.getBridgeTransactionStatus(address);
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
}

const polymarketBridgeService = new PolymarketBridgeService(PolymarketApiClient.getInstance());

export { polymarketBridgeService, PolymarketBridgeService };
