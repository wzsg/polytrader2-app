import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import type { ServerType } from '@hono/node-server';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import type { Context, Next } from 'hono';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import type { McpServerConfig, McpServerStatus } from '@polytrader/shared';
import { createPolytraderMcpServer } from './polytraderMcpServer.js';
import type { McpClientCredential, McpServerManagerOptions } from './types.js';

const MCP_HOST = '127.0.0.1';
const MCP_PATH = '/mcp';
const DEFAULT_MCP_PORT = 8708;
const MCP_CONFIG_KEY = 'mcp_server_config';
const MCP_CLIENT_CREDENTIALS_KEY = 'mcp_client_credentials';

type McpTransportMap = Record<string, WebStandardStreamableHTTPServerTransport>;
type McpRequestSummary = {
  rpcMethod: string | null;
  toolName: string | null;
  resourceUri: string | null;
};
type McpAccessLogInput = {
  requestId: string;
  sessionId?: string | null;
  statusCode: number | null;
  success: boolean;
  durationMs: number | null;
  summary?: McpRequestSummary;
  errorCode?: number | null;
  errorMessage?: string | null;
};

class McpServerManager {
  private _httpServer: ServerType | null = null;
  private _transports: McpTransportMap = {};
  private _statusError: string | null = null;
  private _activePort: number | null = null;
  private _activePrimaryToken: string | null = null;
  private readonly _options: McpServerManagerOptions;
  private _clientTokens: Record<string, string> = {};

  public constructor(options: McpServerManagerOptions) {
    this._options = options;
  }

  public async applySavedConfig(): Promise<void> {
    const config = await this.readConfig();
    if (!config.enabled) return;
    await this.start(config);
  }

  public async readConfig(): Promise<McpServerConfig> {
    const stored = await this._readStoredConfig();
    if (stored) return stored;
    const created = this._defaultConfig(false);
    await this._writeStoredConfig(created);
    return created;
  }

  public async writeConfig(input: Partial<McpServerConfig>): Promise<McpServerConfig> {
    const current = await this.readConfig();
    const next: McpServerConfig = {
      enabled: input.enabled ?? current.enabled,
      port: this._normalizePort(input.port ?? current.port),
      token: this._normalizeToken(input.token ?? current.token),
    };
    await this._writeStoredConfig(next);
    await this.applyConfig(next);
    return await this.readConfig();
  }

  public async resetToken(): Promise<McpServerConfig> {
    return this.writeConfig({ token: this._createToken() });
  }

  public async applyConfig(config: McpServerConfig): Promise<void> {
    if (!config.enabled) {
      await this.stop();
      this._statusError = null;
      return;
    }

    const shouldRestart =
      !this._httpServer ||
      this._activePort !== config.port ||
      this._activePrimaryToken !== config.token ||
      Boolean(this._statusError);
    if (!shouldRestart) return;

    await this.stop();
    await this.start(config);
  }

  public async start(config?: McpServerConfig): Promise<void> {
    if (this._httpServer) return;
    const activeConfig = config ?? (await this.readConfig());
    this._clientTokens = await this._readClientTokens();
    this._statusError = null;
    try {
      const app = new Hono();
      app.use('*', async (context, next) => this._validateLocalRequest(context, next));
      app.use(MCP_PATH, async (context, next) =>
        this._validateBearerToken(context, next, activeConfig.token),
      );
      app.all(MCP_PATH, async (context) => this._handleMcpRequest(context));
      app.notFound((context) => context.text('Not found', 404));

      this._httpServer = await new Promise<ServerType>((resolve, reject) => {
        const server = serve(
          {
            fetch: app.fetch,
            hostname: MCP_HOST,
            port: activeConfig.port,
          },
          () => resolve(server),
        );
        server.once('error', reject);
      });
      this._activePort = activeConfig.port;
      this._activePrimaryToken = activeConfig.token;
    } catch (error) {
      this._statusError = error instanceof Error ? error.message : String(error);
      await this.stop();
      throw error;
    }
  }

  public async stop(): Promise<void> {
    const transports = Object.values(this._transports);
    this._transports = {};
    await Promise.allSettled(transports.map((transport) => transport.close()));

    if (!this._httpServer) return;
    const server = this._httpServer;
    this._httpServer = null;
    this._activePort = null;
    this._activePrimaryToken = null;
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  }

  public async getStatus(): Promise<McpServerStatus> {
    const config = await this.readConfig();
    return {
      enabled: config.enabled,
      running: Boolean(this._httpServer),
      host: MCP_HOST,
      port: config.port,
      endpoint: this._endpoint(config.port),
      tokenConfigured: Boolean(config.token),
      error: this._statusError,
    };
  }

  public async getClientToken(clientId: string): Promise<string | null> {
    const normalizedClientId = this._normalizeClientId(clientId);
    const tokens = await this._readClientTokens();
    return tokens[normalizedClientId] ?? null;
  }

  public async issueClientToken(clientId: string): Promise<McpClientCredential> {
    const normalizedClientId = this._normalizeClientId(clientId);
    const tokens = await this._readClientTokens();
    const existing = tokens[normalizedClientId];
    if (existing) {
      this._clientTokens = tokens;
      return { clientId: normalizedClientId, token: existing, created: false };
    }
    const token = this._createToken();
    tokens[normalizedClientId] = token;
    await this._writeClientTokens(tokens);
    this._clientTokens = tokens;
    return { clientId: normalizedClientId, token, created: true };
  }

  public async revokeClientToken(clientId: string): Promise<void> {
    const normalizedClientId = this._normalizeClientId(clientId);
    const tokens = await this._readClientTokens();
    if (!(normalizedClientId in tokens)) return;
    delete tokens[normalizedClientId];
    await this._writeClientTokens(tokens);
    this._clientTokens = tokens;
  }

  private async _handleMcpRequest(context: Context): Promise<Response> {
    const startedAt = Date.now();
    const requestId = randomUUID();
    const request = context.req.raw;
    const sessionId = this._sessionId(request);
    let body: unknown;
    let summary: McpRequestSummary | undefined;
    try {
      body = await this._readJsonBody(request);
      summary = this._summarizeMcpBody(body);

      if (sessionId && this._transports[sessionId]) {
        const response = await this._handleTransportRequest(
          this._transports[sessionId],
          request,
          body,
        );
        this._writeAccessLog(context, {
          requestId,
          sessionId,
          statusCode: response.status,
          success: response.status < 400,
          durationMs: Date.now() - startedAt,
          summary,
        });
        return response;
      }

      if (!sessionId && isInitializeRequest(body)) {
        const transport = new WebStandardStreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (nextSessionId) => {
            this._transports[nextSessionId] = transport;
          },
          onsessionclosed: (closedSessionId) => {
            delete this._transports[closedSessionId];
          },
        });
        transport.onclose = () => {
          const closedSessionId = transport.sessionId;
          if (closedSessionId) delete this._transports[closedSessionId];
        };

        const server = createPolytraderMcpServer(this._options.ports);
        await server.connect(transport);
        const response = await transport.handleRequest(request, { parsedBody: body });
        this._writeAccessLog(context, {
          requestId,
          sessionId: transport.sessionId || null,
          statusCode: response.status,
          success: response.status < 400,
          durationMs: Date.now() - startedAt,
          summary,
        });
        return response;
      }

      const response = this._jsonRpcError(400, -32000, 'Bad Request: No valid session ID provided');
      this._writeAccessLog(context, {
        requestId,
        sessionId,
        statusCode: response.status,
        success: false,
        durationMs: Date.now() - startedAt,
        summary,
        errorCode: -32000,
        errorMessage: 'Bad Request: No valid session ID provided',
      });
      return response;
    } catch (error) {
      this._statusError = error instanceof Error ? error.message : String(error);
      const response = this._jsonRpcError(500, -32603, 'Internal server error');
      this._writeAccessLog(context, {
        requestId,
        sessionId,
        statusCode: response.status,
        success: false,
        durationMs: Date.now() - startedAt,
        summary,
        errorCode: -32603,
        errorMessage: this._statusError,
      });
      return response;
    }
  }

  private async _handleTransportRequest(
    transport: WebStandardStreamableHTTPServerTransport,
    request: Request,
    body: unknown,
  ): Promise<Response> {
    if (request.method === 'POST') {
      return transport.handleRequest(request, { parsedBody: body });
    }
    return transport.handleRequest(request);
  }

  private async _readJsonBody(request: Request): Promise<unknown> {
    if (request.method !== 'POST') return undefined;
    return request.clone().json();
  }

  private async _validateLocalRequest(context: Context, next: Next): Promise<Response | void> {
    const host = context.req.header('host') || '';
    const origin = context.req.header('origin') || '';
    if (!this._isAllowedHost(host) || (origin && !this._isAllowedOrigin(origin))) {
      this._writeAccessLog(context, {
        requestId: randomUUID(),
        statusCode: 403,
        success: false,
        durationMs: null,
        errorCode: -32003,
        errorMessage: 'Forbidden',
      });
      return context.text('Forbidden', 403);
    }
    await next();
  }

  private async _validateBearerToken(
    context: Context,
    next: Next,
    token: string,
  ): Promise<Response | void> {
    const authorization = context.req.header('authorization') || '';
    const value = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
    if (!this._matchesAnyToken(token, value)) {
      this._writeAccessLog(context, {
        requestId: randomUUID(),
        statusCode: 401,
        success: false,
        durationMs: null,
        errorCode: -32001,
        errorMessage: 'Unauthorized',
      });
      return context.json(
        {
          jsonrpc: '2.0',
          error: { code: -32001, message: 'Unauthorized' },
          id: null,
        },
        401,
      );
    }
    await next();
  }

  private _isAllowedHost(value: string): boolean {
    const trimmed = value.trim().toLowerCase();
    const host = trimmed.startsWith('[')
      ? trimmed.slice(0, trimmed.indexOf(']') + 1)
      : trimmed.split(':')[0];
    return host === '127.0.0.1' || host === 'localhost' || host === '[::1]' || host === '::1';
  }

  private _isAllowedOrigin(value: string): boolean {
    try {
      const origin = new URL(value);
      return this._isAllowedHost(origin.host);
    } catch {
      return false;
    }
  }

  private _tokenMatches(expected: string, actual: string): boolean {
    if (!expected || !actual) return false;
    const expectedBuffer = Buffer.from(expected);
    const actualBuffer = Buffer.from(actual);
    return (
      expectedBuffer.length === actualBuffer.length && timingSafeEqual(expectedBuffer, actualBuffer)
    );
  }

  private _matchesAnyToken(primaryToken: string, actual: string): boolean {
    if (this._tokenMatches(primaryToken, actual)) return true;
    return Object.values(this._clientTokens).some((token) => this._tokenMatches(token, actual));
  }

  private _sessionId(request: Request): string {
    return (request.headers.get('mcp-session-id') || '').trim();
  }

  private _jsonRpcError(status: number, code: number, message: string): Response {
    return Response.json(
      {
        jsonrpc: '2.0',
        error: { code, message },
        id: null,
      },
      { status },
    );
  }

  private _summarizeMcpBody(body: unknown): McpRequestSummary {
    if (Array.isArray(body)) {
      const summaries = body.map((item) => this._summarizeSingleMcpMessage(item));
      return {
        rpcMethod: this._joinSummaryValues(summaries.map((item) => item.rpcMethod)),
        toolName: this._joinSummaryValues(summaries.map((item) => item.toolName)),
        resourceUri: this._joinSummaryValues(summaries.map((item) => item.resourceUri)),
      };
    }
    return this._summarizeSingleMcpMessage(body);
  }

  private _summarizeSingleMcpMessage(body: unknown): McpRequestSummary {
    if (!this._isRecord(body)) {
      return { rpcMethod: null, toolName: null, resourceUri: null };
    }
    const rpcMethod = typeof body.method === 'string' ? body.method : null;
    const params = this._isRecord(body.params) ? body.params : null;
    return {
      rpcMethod,
      toolName: rpcMethod === 'tools/call' && typeof params?.name === 'string' ? params.name : null,
      resourceUri:
        rpcMethod === 'resources/read' && typeof params?.uri === 'string' ? params.uri : null,
    };
  }

  private _joinSummaryValues(values: Array<string | null>): string | null {
    const unique = [...new Set(values.filter((value): value is string => Boolean(value)))];
    if (unique.length === 0) return null;
    return unique.join(',').slice(0, 500);
  }

  private _writeAccessLog(context: Context, input: McpAccessLogInput): void {
    void this._options.accessLogRepository
      .insertLog({
        id: randomUUID(),
        requestId: input.requestId,
        sessionId:
          input.sessionId === undefined
            ? this._sessionId(context.req.raw) || null
            : input.sessionId,
        method: context.req.method,
        path: this._requestPath(context.req.raw),
        statusCode: input.statusCode,
        rpcMethod: input.summary?.rpcMethod ?? null,
        toolName: input.summary?.toolName ?? null,
        resourceUri: input.summary?.resourceUri ?? null,
        success: input.success,
        durationMs: input.durationMs,
        clientHost: this._clientHost(context),
        userAgent: context.req.header('user-agent') || null,
        errorCode: input.errorCode ?? null,
        errorMessage: input.errorMessage ?? null,
        createdAt: new Date().toISOString(),
      })
      .catch((error) => {
        console.warn('Failed to write MCP access log', error);
      });
  }

  private _clientHost(context: Context): string | null {
    const forwardedFor = context.req.header('x-forwarded-for');
    if (forwardedFor) return forwardedFor.split(',')[0]?.trim() || null;
    const origin = context.req.header('origin');
    if (origin) {
      try {
        return new URL(origin).host;
      } catch {
        return origin;
      }
    }
    return context.req.header('host') || null;
  }

  private _requestPath(request: Request): string {
    try {
      return new URL(request.url).pathname;
    } catch {
      return MCP_PATH;
    }
  }

  private _isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private async _readStoredConfig(): Promise<McpServerConfig | null> {
    const value = await this._options.metaRepository.getMetaValue(MCP_CONFIG_KEY);
    if (!value) return null;
    try {
      const parsed = JSON.parse(value) as Partial<McpServerConfig>;
      return {
        enabled: Boolean(parsed.enabled),
        port: this._normalizePort(parsed.port),
        token: this._normalizeToken(parsed.token),
      };
    } catch {
      return null;
    }
  }

  private async _writeStoredConfig(config: McpServerConfig): Promise<void> {
    await this._options.metaRepository.setMetaValue(MCP_CONFIG_KEY, JSON.stringify(config));
  }

  private async _readClientTokens(): Promise<Record<string, string>> {
    const value = await this._options.metaRepository.getMetaValue(MCP_CLIENT_CREDENTIALS_KEY);
    if (!value) return {};
    try {
      const parsed = JSON.parse(value) as Record<string, unknown>;
      return Object.fromEntries(
        Object.entries(parsed)
          .map(([clientId, token]) => [
            this._normalizeClientId(clientId),
            String(token ?? '').trim(),
          ])
          .filter((entry): entry is [string, string] => Boolean(entry[0] && entry[1])),
      );
    } catch {
      return {};
    }
  }

  private async _writeClientTokens(tokens: Record<string, string>): Promise<void> {
    await this._options.metaRepository.setMetaValue(
      MCP_CLIENT_CREDENTIALS_KEY,
      JSON.stringify(tokens),
    );
  }

  private _defaultConfig(enabled: boolean): McpServerConfig {
    return {
      enabled,
      port: DEFAULT_MCP_PORT,
      token: this._createToken(),
    };
  }

  private _normalizePort(value: unknown): number {
    const port = Number(value);
    if (!Number.isFinite(port)) return DEFAULT_MCP_PORT;
    return Math.max(1024, Math.min(65_535, Math.trunc(port)));
  }

  private _normalizeToken(value: unknown): string {
    const token = String(value ?? '').trim();
    return token || this._createToken();
  }

  private _normalizeClientId(value: unknown): string {
    const clientId = String(value ?? '')
      .trim()
      .toLowerCase();
    if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(clientId)) {
      throw new Error('Invalid MCP client ID');
    }
    return clientId;
  }

  private _createToken(): string {
    return randomBytes(32).toString('base64url');
  }

  private _endpoint(port: number): string {
    return `http://${MCP_HOST}:${port}${MCP_PATH}`;
  }
}

export { McpServerManager, MCP_HOST, MCP_PATH, DEFAULT_MCP_PORT, MCP_CLIENT_CREDENTIALS_KEY };
