import { createHash, timingSafeEqual } from 'crypto';
import {
  RemoteAccessServer,
  type RemoteAccessAuthParams,
  type RemoteAccessOrderCancelParams,
  type RemoteAccessOrderListParams,
  type RemoteAccessOrderPlaceParams,
  type RemoteAccessRequestContext,
  type RemoteAccessWalletBalance,
  type RemoteAccessWalletSummary,
} from '@polytrader/remote-access';
import { polymarketWalletService } from './polymarketWalletService.js';
import { tradingAccountService } from './tradingAccountService.js';

const DEFAULT_REMOTE_ACCESS_PORT = 8790;
const DEFAULT_REMOTE_ACCESS_PATH = '/remote-access';

class DesktopRemoteAccessService {
  private _server: RemoteAccessServer | null = null;
  private _authenticationToken = '';

  public async applyEnvironmentConfig(): Promise<void> {
    const token = process.env.P2_REMOTE_ACCESS_TOKEN?.trim() || '';
    if (!token) {
      await this.stop();
      return;
    }
    if (this._server) return;

    this._authenticationToken = token;
    const server = new RemoteAccessServer({
      host: '127.0.0.1',
      port: this._parsePort(process.env.P2_REMOTE_ACCESS_PORT),
      path: process.env.P2_REMOTE_ACCESS_PATH?.trim() || DEFAULT_REMOTE_ACCESS_PATH,
      authenticator: {
        authenticate: (params) => this._authenticate(params),
      },
      handlers: {
        listWallets: () => this._listWallets(),
        getWalletBalance: (params) => this._getWalletBalance(params.walletId),
        listOrders: (params) => this._listOrders(params),
        placeOrder: (params, context) => this._placeOrder(params, context),
        cancelOrder: (params) => this._cancelOrder(params),
      },
      onWarning: (message, reason) => console.warn(message, reason),
    });
    await server.start();
    this._server = server;
    const address = server.address;
    console.info(
      `Remote access server listening on ws://${address?.host}:${address?.port}${address?.path}`,
    );
  }

  public async stop(): Promise<void> {
    const server = this._server;
    this._server = null;
    this._authenticationToken = '';
    await server?.stop();
  }

  private _authenticate(params: RemoteAccessAuthParams): boolean {
    if (!this._authenticationToken) return false;
    const expected = createHash('sha256').update(this._authenticationToken).digest();
    const actual = createHash('sha256').update(params.token).digest();
    return timingSafeEqual(expected, actual);
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

  private _parsePort(value: string | undefined): number {
    if (!value?.trim()) return DEFAULT_REMOTE_ACCESS_PORT;
    const port = Number(value);
    if (!Number.isInteger(port) || port < 1 || port > 65_535) {
      throw new Error('P2_REMOTE_ACCESS_PORT must be an integer between 1 and 65535');
    }
    return port;
  }
}

const remoteAccessService = new DesktopRemoteAccessService();

export { remoteAccessService };
