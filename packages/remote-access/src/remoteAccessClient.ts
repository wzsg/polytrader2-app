import { randomUUID } from 'crypto';
import { RemoteAccessError } from './remoteAccessError.js';
import { RemoteAccessProtocol } from './remoteAccessProtocol.js';
import {
  REMOTE_ACCESS_PROTOCOL_VERSION,
  type RemoteAccessClientOptions,
  type RemoteAccessClientState,
  type RemoteAccessOrderCancelParams,
  type RemoteAccessOrderPlaceParams,
  type RemoteAccessRequest,
  type RemoteAccessRequestContext,
  type RemoteAccessResponse,
  type RemoteAccessWriteMethod,
} from './types.js';

interface RemoteAccessCachedRequest {
  fingerprint: string;
  response: Promise<RemoteAccessResponse>;
  completed: boolean;
  expiresAt: number;
}

class RemoteAccessClient {
  private readonly _options: Required<
    Pick<
      RemoteAccessClientOptions,
      | 'responseCacheTtlMs'
      | 'maxCachedRequests'
      | 'maxPayloadBytes'
      | 'heartbeatIntervalMs'
      | 'connectionTimeoutMs'
      | 'authenticationTimeoutMs'
      | 'reconnectInitialDelayMs'
      | 'reconnectMaxDelayMs'
      | 'reconnectJitterRatio'
    >
  > &
    RemoteAccessClientOptions;
  private readonly _protocol = new RemoteAccessProtocol();
  private readonly _requestCache = new Map<string, RemoteAccessCachedRequest>();
  private _socket: WebSocket | null = null;
  private _state: RemoteAccessClientState = 'stopped';
  private _stopped = true;
  private _authenticationRequestId = '';
  private _heartbeatRequestId = '';
  private _reconnectDelayMs: number;
  private _reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private _connectionTimer: ReturnType<typeof setTimeout> | null = null;
  private _authenticationTimer: ReturnType<typeof setTimeout> | null = null;
  private _heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private _heartbeatResponseTimer: ReturnType<typeof setTimeout> | null = null;

  public constructor(options: RemoteAccessClientOptions) {
    if (!options.deviceId.trim()) throw new Error('Remote access device ID is required');
    if (!options.token) throw new Error('Remote access token is required');
    if (options.requireConfirmationForWrites && !options.confirmationProvider) {
      throw new Error('A confirmation provider is required when write confirmation is enabled');
    }
    const reconnectInitialDelayMs = options.reconnectInitialDelayMs ?? 1_000;
    const reconnectMaxDelayMs = options.reconnectMaxDelayMs ?? 30_000;
    if (reconnectInitialDelayMs < 0 || reconnectMaxDelayMs < reconnectInitialDelayMs) {
      throw new Error('Remote access reconnect delays are invalid');
    }
    const reconnectJitterRatio = options.reconnectJitterRatio ?? 0.2;
    if (reconnectJitterRatio < 0 || reconnectJitterRatio > 1) {
      throw new Error('Remote access reconnect jitter ratio must be between 0 and 1');
    }
    this._options = {
      ...options,
      url: this._normalizeUrl(options.url),
      deviceId: options.deviceId.trim(),
      responseCacheTtlMs: options.responseCacheTtlMs ?? 5 * 60_000,
      maxCachedRequests: options.maxCachedRequests ?? 2_000,
      maxPayloadBytes: options.maxPayloadBytes ?? 64 * 1024,
      heartbeatIntervalMs: options.heartbeatIntervalMs ?? 30_000,
      connectionTimeoutMs: options.connectionTimeoutMs ?? 10_000,
      authenticationTimeoutMs: options.authenticationTimeoutMs ?? 10_000,
      reconnectInitialDelayMs,
      reconnectMaxDelayMs,
      reconnectJitterRatio,
    };
    this._reconnectDelayMs = reconnectInitialDelayMs;
  }

  public get state(): RemoteAccessClientState {
    return this._state;
  }

  public start(): void {
    if (!this._stopped) return;
    this._stopped = false;
    this._reconnectDelayMs = this._options.reconnectInitialDelayMs;
    this._connect();
  }

  public stop(): void {
    if (this._stopped && !this._socket) return;
    this._stopped = true;
    this._clearTimers();
    const socket = this._socket;
    this._socket = null;
    if (socket) this._closeSocket(socket, 1000, 'Client stopping');
    this._authenticationRequestId = '';
    this._heartbeatRequestId = '';
    this._requestCache.clear();
    this._setState('stopped');
  }

  private _normalizeUrl(value: string): string {
    let url: URL;
    try {
      url = new URL(value.trim());
    } catch {
      throw new Error('Remote access URL must be a valid WebSocket URL');
    }
    if (url.protocol !== 'ws:' && url.protocol !== 'wss:') {
      throw new Error('Remote access URL must use ws or wss');
    }
    return url.toString();
  }

  private _connect(): void {
    if (this._stopped || this._socket) return;
    this._setState('connecting');
    const socket = new WebSocket(this._options.url);
    this._socket = socket;
    socket.addEventListener('open', () => this._handleOpen(socket));
    socket.addEventListener('message', (event) => {
      void this._handleMessage(socket, event).catch((error: unknown) => {
        this._warn('Unhandled remote access request failure', error);
      });
    });
    socket.addEventListener('error', (event) => {
      this._warn('Remote access connection failed', event);
    });
    socket.addEventListener('close', () => this._handleClose(socket));
    this._connectionTimer = setTimeout(() => {
      if (this._socket !== socket || this._state !== 'connecting') return;
      this._warn('Remote access connection timed out');
      this._closeSocket(socket, 1001, 'Connection timed out');
    }, this._options.connectionTimeoutMs);
    this._connectionTimer.unref?.();
  }

  private _handleOpen(socket: WebSocket): void {
    if (this._socket !== socket || this._stopped) return;
    this._clearConnectionTimer();
    this._setState('authenticating');
    this._authenticationRequestId = `auth:${randomUUID()}`;
    const request: Extract<RemoteAccessRequest, { method: 'auth' }> = {
      id: this._authenticationRequestId,
      method: 'auth',
      params: {
        protocolVersion: REMOTE_ACCESS_PROTOCOL_VERSION,
        deviceId: this._options.deviceId,
        token: this._options.token,
      },
    };
    socket.send(this._protocol.encodeRequest(request));
    this._authenticationTimer = setTimeout(() => {
      if (this._socket !== socket || this._state !== 'authenticating') return;
      this._warn('Remote access authentication timed out');
      socket.close(1008, 'Authentication timed out');
    }, this._options.authenticationTimeoutMs);
    this._authenticationTimer.unref?.();
  }

  private async _handleMessage(socket: WebSocket, event: MessageEvent): Promise<void> {
    if (this._socket !== socket || this._stopped) return;
    if (typeof event.data !== 'string') {
      this._warn('Remote access received an unsupported binary message');
      this._closeSocket(socket, 1003, 'Binary messages are not supported');
      return;
    }

    const payload = event.data;
    if (Buffer.byteLength(payload, 'utf8') > this._options.maxPayloadBytes) {
      this._warn('Remote access received a message that exceeded the payload limit');
      this._closeSocket(socket, 1009, 'Message is too large');
      return;
    }
    if (this._state === 'authenticating') {
      this._handleAuthenticationResponse(socket, payload);
      return;
    }
    if (this._state !== 'connected') return;
    if (this._handleHeartbeatResponse(payload)) return;

    let request: RemoteAccessRequest;
    try {
      request = this._protocol.parseRequest(payload);
    } catch (error) {
      const requestId = this._protocol.extractRequestId(payload);
      this._send(socket, this._responseFromError(requestId, error));
      return;
    }
    if (request.method === 'auth') {
      this._send(socket, this._failure(request.id, 'INVALID_METHOD', 'Auth is client initiated'));
      return;
    }

    const response = await this._executeDeduplicated(request);
    this._send(socket, response);
  }

  private _handleAuthenticationResponse(socket: WebSocket, payload: string): void {
    let response: RemoteAccessResponse;
    try {
      response = this._protocol.parseResponse(payload);
    } catch (error) {
      this._warn('Remote access authentication returned an invalid response', error);
      this._closeSocket(socket, 1008, 'Invalid authentication response');
      return;
    }
    if (response.id !== this._authenticationRequestId) {
      this._warn('Remote access authentication response ID did not match');
      this._closeSocket(socket, 1008, 'Authentication response ID mismatch');
      return;
    }
    if (!response.ok) {
      this._warn(`Remote access authentication failed: ${response.error.code}`);
      this._closeSocket(socket, 1008, 'Authentication failed');
      return;
    }
    this._clearAuthenticationTimer();
    this._authenticationRequestId = '';
    this._reconnectDelayMs = this._options.reconnectInitialDelayMs;
    this._setState('connected');
    this._startHeartbeat(socket);
  }

  private _handleClose(socket: WebSocket): void {
    if (this._socket !== socket) return;
    this._socket = null;
    this._authenticationRequestId = '';
    this._heartbeatRequestId = '';
    this._clearConnectionTimer();
    this._clearAuthenticationTimer();
    this._clearHeartbeatTimer();
    if (this._stopped) {
      this._setState('stopped');
      return;
    }
    this._scheduleReconnect();
  }

  private _scheduleReconnect(): void {
    if (this._stopped || this._reconnectTimer) return;
    this._setState('waiting-to-reconnect');
    const jitterRange = this._reconnectDelayMs * this._options.reconnectJitterRatio;
    const jitter = (Math.random() * 2 - 1) * jitterRange;
    const delay = Math.max(0, Math.round(this._reconnectDelayMs + jitter));
    this._reconnectDelayMs = Math.min(
      this._options.reconnectMaxDelayMs,
      Math.max(this._options.reconnectInitialDelayMs, this._reconnectDelayMs * 2),
    );
    this._reconnectTimer = setTimeout(() => {
      this._reconnectTimer = null;
      this._connect();
    }, delay);
    this._reconnectTimer.unref?.();
  }

  private async _executeDeduplicated(
    request: Exclude<RemoteAccessRequest, { method: 'auth' }>,
  ): Promise<RemoteAccessResponse> {
    this._pruneRequestCache();
    const fingerprint = this._protocol.fingerprint(request);
    const cached = this._requestCache.get(request.id);
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
      return this._failure(request.id, 'CLIENT_BUSY', 'Too many requests are being processed');
    }

    const entry: RemoteAccessCachedRequest = {
      fingerprint,
      response: Promise.resolve(this._failure(request.id, 'INTERNAL_ERROR', 'Request failed')),
      completed: false,
      expiresAt: Number.POSITIVE_INFINITY,
    };
    entry.response = this._executeRequest(request).finally(() => {
      entry.completed = true;
      entry.expiresAt = Date.now() + this._options.responseCacheTtlMs;
    });
    this._requestCache.set(request.id, entry);
    return entry.response;
  }

  private async _executeRequest(
    request: Exclude<RemoteAccessRequest, { method: 'auth' }>,
  ): Promise<RemoteAccessResponse> {
    try {
      const context: RemoteAccessRequestContext = {
        desktopDeviceId: this._options.deviceId,
        requestId: request.id,
      };
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
    if (request.method === 'ping') return { desktopTime: new Date().toISOString() };
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
    if (!provider) {
      throw new RemoteAccessError('CONFIRMATION_UNAVAILABLE', 'Confirmation unavailable');
    }
    const approved = await provider.confirm({
      desktopDeviceId: context.desktopDeviceId,
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

  private _startHeartbeat(socket: WebSocket): void {
    this._clearHeartbeatTimer();
    this._heartbeatTimer = setInterval(() => {
      if (this._socket !== socket || socket.readyState !== WebSocket.OPEN) return;
      if (this._heartbeatRequestId) return;
      this._heartbeatRequestId = `heartbeat:${randomUUID()}`;
      socket.send(
        this._protocol.encodeRequest({
          id: this._heartbeatRequestId,
          method: 'ping',
          params: {},
        }),
      );
      this._heartbeatResponseTimer = setTimeout(() => {
        if (this._socket !== socket || !this._heartbeatRequestId) return;
        this._warn('Remote access heartbeat timed out');
        this._closeSocket(socket, 1001, 'Heartbeat timed out');
      }, this._options.heartbeatIntervalMs);
      this._heartbeatResponseTimer.unref?.();
    }, this._options.heartbeatIntervalMs);
    this._heartbeatTimer.unref?.();
  }

  private _handleHeartbeatResponse(payload: string): boolean {
    if (!this._heartbeatRequestId) return false;
    let response: RemoteAccessResponse;
    try {
      response = this._protocol.parseResponse(payload);
    } catch {
      return false;
    }
    if (response.id !== this._heartbeatRequestId) return false;
    if (!response.ok) this._warn(`Remote access heartbeat failed: ${response.error.code}`);
    this._heartbeatRequestId = '';
    if (this._heartbeatResponseTimer) clearTimeout(this._heartbeatResponseTimer);
    this._heartbeatResponseTimer = null;
    return true;
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

  private _send(socket: WebSocket, response: RemoteAccessResponse): void {
    if (this._socket !== socket || socket.readyState !== WebSocket.OPEN) return;
    socket.send(this._protocol.encodeResponse(response));
  }

  private _closeSocket(socket: WebSocket, code: number, reason: string): void {
    try {
      socket.close(code, reason);
    } catch (error) {
      this._warn('Remote access connection could not be closed cleanly', error);
    }
  }

  private _setState(state: RemoteAccessClientState): void {
    if (this._state === state) return;
    this._state = state;
    try {
      this._options.onStateChange?.(state);
    } catch (error) {
      this._warn('Remote access state callback failed', error);
    }
  }

  private _clearTimers(): void {
    if (this._reconnectTimer) clearTimeout(this._reconnectTimer);
    this._reconnectTimer = null;
    this._clearConnectionTimer();
    this._clearAuthenticationTimer();
    this._clearHeartbeatTimer();
  }

  private _clearAuthenticationTimer(): void {
    if (this._authenticationTimer) clearTimeout(this._authenticationTimer);
    this._authenticationTimer = null;
  }

  private _clearConnectionTimer(): void {
    if (this._connectionTimer) clearTimeout(this._connectionTimer);
    this._connectionTimer = null;
  }

  private _clearHeartbeatTimer(): void {
    if (this._heartbeatTimer) clearInterval(this._heartbeatTimer);
    this._heartbeatTimer = null;
    if (this._heartbeatResponseTimer) clearTimeout(this._heartbeatResponseTimer);
    this._heartbeatResponseTimer = null;
    this._heartbeatRequestId = '';
  }

  private _warn(message: string, reason?: unknown): void {
    this._options.onWarning?.(message, reason);
  }
}

export { RemoteAccessClient };
