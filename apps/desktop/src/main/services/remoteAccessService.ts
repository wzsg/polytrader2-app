import {
  RemoteAccessClient,
  type RemoteAccessOrderCancelParams,
  type RemoteAccessOrderListParams,
  type RemoteAccessOrderPlaceParams,
  type RemoteAccessRequestContext,
  type RemoteAccessWalletBalance,
  type RemoteAccessWalletSummary,
} from '@polytrader/remote-access';
import { polymarketWalletService } from './polymarketWalletService.js';
import { tradingAccountService } from './tradingAccountService.js';

class DesktopRemoteAccessService {
  private _client: RemoteAccessClient | null = null;

  public async applyEnvironmentConfig(): Promise<void> {
    const url = process.env.P2_REMOTE_ACCESS_URL?.trim() || '';
    const token = process.env.P2_REMOTE_ACCESS_TOKEN?.trim() || '';
    const deviceId = process.env.P2_REMOTE_ACCESS_DEVICE_ID?.trim() || '';
    if (!url) {
      await this.stop();
      return;
    }
    if (!token) throw new Error('P2_REMOTE_ACCESS_TOKEN is required when remote access is enabled');
    if (!deviceId) {
      throw new Error('P2_REMOTE_ACCESS_DEVICE_ID is required when remote access is enabled');
    }
    if (this._client) return;

    const client = new RemoteAccessClient({
      url,
      deviceId,
      token,
      handlers: {
        listWallets: () => this._listWallets(),
        getWalletBalance: (params) => this._getWalletBalance(params.walletId),
        listOrders: (params) => this._listOrders(params),
        placeOrder: (params, context) => this._placeOrder(params, context),
        cancelOrder: (params) => this._cancelOrder(params),
      },
      onStateChange: (state) => console.info(`Remote access connection state: ${state}`),
      onWarning: (message, reason) => console.warn(message, reason),
    });
    this._client = client;
    client.start();
  }

  public async stop(): Promise<void> {
    const client = this._client;
    this._client = null;
    client?.stop();
  }

  private async _listWallets(): Promise<RemoteAccessWalletSummary[]> {
    const wallets = await polymarketWalletService.listPolymarketWallets();
    return wallets.map((wallet) => ({
      id: wallet.id,
      name: wallet.name,
      walletAddress: wallet.walletAddress,
      depositWalletAddress: wallet.depositWalletAddress,
      isDefault: wallet.isDefault,
      credentialsConfigured: wallet.credentialsConfigured,
      initializationStatus: wallet.initializationStatus,
    }));
  }

  private async _getWalletBalance(walletId: string): Promise<RemoteAccessWalletBalance> {
    await tradingAccountService.syncAccountNow(walletId);
    const wallet = await polymarketWalletService.getPolymarketWalletSummary(walletId);
    if (!wallet.balance) throw new Error('Wallet balance is unavailable');
    return {
      walletId,
      walletAddress: wallet.balance.walletAddress,
      balance: wallet.balance.balance,
      balanceUsd: wallet.balance.balanceUsd,
      allowances: wallet.balance.allowances,
      updatedAt: wallet.updatedAt,
    };
  }

  private _listOrders(params: RemoteAccessOrderListParams): Promise<unknown[]> {
    return tradingAccountService.queryOrders({
      walletId: params.walletId,
      limit: params.limit,
      offset: params.offset,
    });
  }

  private _placeOrder(
    params: RemoteAccessOrderPlaceParams,
    context: RemoteAccessRequestContext,
  ): Promise<unknown> {
    return tradingAccountService.placeManualOrder({
      walletId: params.walletId,
      orderId: context.requestId,
      order: {
        ...params.order,
        idempotencyKey: context.requestId,
      },
    });
  }

  private _cancelOrder(params: RemoteAccessOrderCancelParams): Promise<unknown> {
    return tradingAccountService.cancelOrder({
      walletId: params.walletId,
      exchangeOrderId: params.orderId,
    });
  }
}

const remoteAccessService = new DesktopRemoteAccessService();

export { remoteAccessService };
