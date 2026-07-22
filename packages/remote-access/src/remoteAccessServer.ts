import type { AddressInfo } from 'net';
import { WebSocket, WebSocketServer, type RawData } from 'ws';
import { RemoteAccessError } from './remoteAccessError.js';
import { RemoteAccessProtocol } from './remoteAccessProtocol.js';
import {
  REMOTE_ACCESS_PROTOCOL_VERSION,
  type RemoteAccessOrderCancelParams,
  type RemoteAccessOrderPlaceParams,
  type RemoteAccessRequest,
  type RemoteAccessRequestContext,
  type RemoteAccessResponse,
  type RemoteAccessServerAddress,
  type RemoteAccessServerOptions,
  type RemoteAccessWriteMethod,
} from './types.js';

interface RemoteAccessClientState {
  authenticated: boolean;
  deviceId: string;
  alive: boolean;
}

interface RemoteAccessCachedRequest {
  fingerprint: string;
  response: Promise<RemoteAccessResponse>;
  completed: boolean;
  expiresAt: number;
}

class RemoteAccessServer {
  private readonly _options: Required<
    Pick<
      RemoteAccessServerOptions,
      | 'host'
      | 'path'
      | 'responseCacheTtlMs'
      | 'maxCachedRequests'
      | 'maxPayloadBytes'
      | 'heartbeatIntervalMs'
    >
  > &
    RemoteAccessServerOptions;
  private readonly _protocol = new RemoteAccessProtocol();
  private readonly _clients = new WeakMap<WebSocket, RemoteAccessClientState>();
  private readonly _requestCache = new Map<string, RemoteAccessCachedRequest>();
  private _webSocketServer: WebSocketServer | null = null;
  private _heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  public constructor(options: RemoteAccessServerOptions) {
    if (!Number.isInteger(options.port) || options.port < 0 || options.port > 65_535) {
      throw new Error('Remote access port must be an integer between 0 and 65535');
    }
    if (options.requireConfirmationForWrites && !options.confirmationProvider) {
      throw new Error('A confirmation provider is required when write confirmation is enabled');
    }
    this._options = {
      ...options,
      host: options.host?.trim() || '127.0.0.1',
      path: this._normalizePath(options.path),
      responseCacheTtlMs: options.responseCacheTtlMs ?? 5 * 60_000,
      maxCachedRequests: options.maxCachedRequests ?? 2_000,
      maxPayloadBytes: options.maxPayloadBytes ?? 64 * 1024,
      heartbeatIntervalMs: options.heartbeatIntervalMs ?? 30_000,
    };
  }

  public get address(): RemoteAccessServerAddress | null {
    const address = this._webSocketServer?.address();
    if (!address || typeof address === 'string') return null;
    return {
      host: this._options.host,
      port: (address as AddressInfo).port,
      path: this._options.path,
    };
  }

  public async start(): Promise<void> {
    if (this._webSocketServer) return;
    const server = new WebSocketServer({
      host: this._options.host,
      port: this._options.port,
      path: this._options.path,
      maxPayload: this._options.maxPayloadBytes,
    });
    this._webSocketServer = server;
    server.on('connection', (socket) => this._handleConnection(socket));

    await new Promise<void>((resolve, reject) => {
      const handleListening = (): void => {
        server.off('error', handleError);
        resolve();
      };
      const handleError = (error: Error): void => {
        server.off('listening', handleListening);
        this._webSocketServer = null;
        reject(error);
      };
      server.once('listening', handleListening);
      server.once('error', handleError);
    });
    this._startHeartbeat();
  }

  public async stop(): Promise<void> {
    const server = this._webSocketServer;
    if (!server) return;
    this._webSocketServer = null;
    if (this._heartbeatTimer) clearInterval(this._heartbeatTimer);
    this._heartbeatTimer = null;
    for (const client of server.clients) client.close(1001, 'Server stopping');
    await new Promise<void>((resolve) => server.close(() => resolve()));
    this._requestCache.clear();
  }

  private _normalizePath(value: string | undefined): string {
    const path = value?.trim() || '/remote-access';
    return path.startsWith('/') ? path : `/${path}`;
  }

  private _handleConnection(socket: WebSocket): void {
    this._clients.set(socket, { authenticated: false, deviceId: '', alive: true });
    socket.on('pong', () => {
      const state = this._clients.get(socket);
      if (state) state.alive = true;
    });
    socket.on('message', (data, isBinary) => {
      void this._handleMessage(socket, data, isBinary).catch((error: unknown) => {
        this._warn('Unhandled remote access request failure', error);
      });
    });
  }

  private async _handleMessage(socket: WebSocket, data: RawData, isBinary: boolean): Promise<void> {
    if (isBinary) {
      this._sendFailure(socket, '', 'INVALID_REQUEST', 'Binary messages are not supported');
      return;
    }

    const payload = data.toString('utf8');
    let request: RemoteAccessRequest;
    try {
      request = this._protocol.parseRequest(payload);
    } catch (error) {
      const requestId = this._protocol.extractRequestId(payload);
      this._sendError(socket, requestId, error);
      return;
    }

    if (request.method === 'auth') {
      await this._authenticate(socket, request);
      return;
    }

    const state = this._clients.get(socket);
    if (!state?.authenticated) {
      this._sendFailure(socket, request.id, 'AUTH_REQUIRED', 'Authentication is required');
      socket.close(1008, 'Authentication is required');
      return;
    }

    const response = await this._executeDeduplicated(request, state.deviceId);
    this._send(socket, response);
  }

  private async _authenticate(
    socket: WebSocket,
    request: Extract<RemoteAccessRequest, { method: 'auth' }>,
  ): Promise<void> {
    const existingState = this._clients.get(socket);
    if (existingState?.authenticated) {
      this._sendFailure(socket, request.id, 'ALREADY_AUTHENTICATED', 'Already authenticated');
      return;
    }
    let authenticated = false;
    try {
      authenticated = await this._options.authenticator.authenticate(request.params);
    } catch (error) {
      this._warn('Remote access authentication failed', error);
    }
    if (!authenticated) {
      this._sendFailure(socket, request.id, 'AUTH_FAILED', 'Authentication failed');
      socket.close(1008, 'Authentication failed');
      return;
    }
    if (!existingState) return;
    existingState.authenticated = true;
    existingState.deviceId = request.params.deviceId;
    this._sendSuccess(socket, request.id, {
      protocolVersion: REMOTE_ACCESS_PROTOCOL_VERSION,
      deviceId: existingState.deviceId,
    });
  }

  private async _executeDeduplicated(
    request: Exclude<RemoteAccessRequest, { method: 'auth' }>,
    deviceId: string,
  ): Promise<RemoteAccessResponse> {
    this._pruneRequestCache();
    const cacheKey = `${deviceId}:${request.id}`;
    const fingerprint = this._protocol.fingerprint(request);
    const cached = this._requestCache.get(cacheKey);
    if (cached) {
      if (cached.fingerprint !== fingerprint) {
        return this._failure(
          request.id,
          'REQUEST_ID_CONFLICT',
          'The request ID was already used for another request',
        );
      }
      return cached.response;
    }
    if (this._requestCache.size >= this._options.maxCachedRequests) {
      return this._failure(request.id, 'SERVER_BUSY', 'Too many requests are being processed');
    }

    const entry: RemoteAccessCachedRequest = {
      fingerprint,
      response: Promise.resolve(this._failure(request.id, 'INTERNAL_ERROR', 'Request failed')),
      completed: false,
      expiresAt: Number.POSITIVE_INFINITY,
    };
    entry.response = this._executeRequest(request, deviceId).finally(() => {
      entry.completed = true;
      entry.expiresAt = Date.now() + this._options.responseCacheTtlMs;
    });
    this._requestCache.set(cacheKey, entry);
    return entry.response;
  }

  private async _executeRequest(
    request: Exclude<RemoteAccessRequest, { method: 'auth' }>,
    deviceId: string,
  ): Promise<RemoteAccessResponse> {
    try {
      const context: RemoteAccessRequestContext = { deviceId, requestId: request.id };
      const data = await this._dispatch(request, context);
      return { id: request.id, ok: true, data };
    } catch (error) {
      return this._responseFromError(request.id, error);
    }
  }

  private async _dispatch(
    request: Exclude<RemoteAccessRequest, { method: 'auth' }>,
    context: RemoteAccessRequestContext,
  ): Promise<unknown> {
    if (request.method === 'ping') return { serverTime: new Date().toISOString() };
    if (request.method === 'wallet.list') return this._options.handlers.listWallets(context);
    if (request.method === 'wallet.getBalance') {
      return this._options.handlers.getWalletBalance(request.params, context);
    }
    if (request.method === 'order.list') {
      return this._options.handlers.listOrders(request.params, context);
    }
    if (request.method === 'order.place') {
      await this._confirmWrite(request.method, request.params, context);
      return this._options.handlers.placeOrder(request.params, context);
    }
    await this._confirmWrite(request.method, request.params, context);
    return this._options.handlers.cancelOrder(request.params, context);
  }

  private async _confirmWrite(
    method: RemoteAccessWriteMethod,
    params: RemoteAccessOrderPlaceParams | RemoteAccessOrderCancelParams,
    context: RemoteAccessRequestContext,
  ): Promise<void> {
    if (!this._options.requireConfirmationForWrites) return;
    const provider = this._options.confirmationProvider;
    if (!provider)
      throw new RemoteAccessError('CONFIRMATION_UNAVAILABLE', 'Confirmation unavailable');
    const approved = await provider.confirm({
      deviceId: context.deviceId,
      requestId: context.requestId,
      method,
      params,
    });
    if (!approved) {
      throw new RemoteAccessError('CONFIRMATION_REJECTED', 'The request was rejected');
    }
  }

  private _pruneRequestCache(): void {
    const now = Date.now();
    for (const [key, entry] of this._requestCache) {
      if (entry.completed && entry.expiresAt <= now) this._requestCache.delete(key);
    }
    if (this._requestCache.size < this._options.maxCachedRequests) return;
    for (const [key, entry] of this._requestCache) {
      if (!entry.completed) continue;
      this._requestCache.delete(key);
      if (this._requestCache.size < this._options.maxCachedRequests) return;
    }
  }

  private _startHeartbeat(): void {
    this._heartbeatTimer = setInterval(() => {
      const server = this._webSocketServer;
      if (!server) return;
      for (const socket of server.clients) {
        const state = this._clients.get(socket);
        if (!state) continue;
        if (!state.alive) {
          socket.terminate();
          continue;
        }
        state.alive = false;
        socket.ping();
      }
    }, this._options.heartbeatIntervalMs);
    this._heartbeatTimer.unref?.();
  }

  private _responseFromError(requestId: string, error: unknown): RemoteAccessResponse {
    if (error instanceof RemoteAccessError) {
      return this._failure(requestId, error.code, error.message);
    }
    const message =
      error instanceof Error && error.message.trim() ? error.message : 'Request failed';
    this._warn('Remote access operation failed', error);
    return this._failure(requestId, 'OPERATION_FAILED', message);
  }

  private _failure(id: string, code: string, message: string): RemoteAccessResponse {
    return { id, ok: false, error: { code, message } };
  }

  private _sendSuccess(socket: WebSocket, id: string, data: unknown): void {
    this._send(socket, { id, ok: true, data });
  }

  private _sendFailure(socket: WebSocket, id: string, code: string, message: string): void {
    this._send(socket, this._failure(id, code, message));
  }

  private _sendError(socket: WebSocket, id: string, error: unknown): void {
    this._send(socket, this._responseFromError(id, error));
  }

  private _send(socket: WebSocket, response: RemoteAccessResponse): void {
    if (socket.readyState !== WebSocket.OPEN) return;
    socket.send(this._protocol.encodeResponse(response));
  }

  private _warn(message: string, reason?: unknown): void {
    this._options.onWarning?.(message, reason);
  }
}

export { RemoteAccessServer };
