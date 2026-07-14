import type { AiAgentConfigState, AiAgentId, AiAgentIntegrationStatus } from '@polytrader/shared';
import type {
  AiAgentAdapter,
  ClaudeDesktopBridgeConfig,
  ConfigureAgentOptions,
  McpConnectionConfig,
} from './aiAgentIntegrationTypes.js';
import type { AgentCommandRunner } from './agentCommandRunner.js';
import type { ManagedConfigWriter } from './managedConfigWriter.js';

const SERVER_PATH = ['mcpServers', 'polytrader2'];

class ClaudeDesktopIntegrationAdapter implements AiAgentAdapter {
  private readonly _configPath: string;
  private readonly _applicationPaths: string[];
  private readonly _bridge: ClaudeDesktopBridgeConfig;
  private readonly _commandRunner: AgentCommandRunner;
  private readonly _configWriter: ManagedConfigWriter;

  public constructor(
    configPath: string,
    applicationPaths: string[],
    bridge: ClaudeDesktopBridgeConfig,
    commandRunner: AgentCommandRunner,
    configWriter: ManagedConfigWriter,
  ) {
    this._configPath = configPath;
    this._applicationPaths = applicationPaths;
    this._bridge = bridge;
    this._commandRunner = commandRunner;
    this._configWriter = configWriter;
  }

  public get id(): AiAgentId {
    return 'claude-desktop';
  }

  public async detect(connection?: McpConnectionConfig): Promise<AiAgentIntegrationStatus> {
    const installation = await this._commandRunner.findDesktopApplication(this._applicationPaths);
    try {
      const entry = await this._configWriter.readJsonValue(this._configPath, SERVER_PATH);
      return this._status(
        installation?.path ?? null,
        installation?.version ?? null,
        this._resolveConfigState(entry, connection),
        null,
      );
    } catch (error) {
      return this._status(
        installation?.path ?? null,
        installation?.version ?? null,
        'error',
        this._errorMessage(error),
      );
    }
  }

  public async configure(options: ConfigureAgentOptions): Promise<AiAgentIntegrationStatus> {
    const before = await this.detect(options);
    if (!before.installed) throw new Error('Claude Desktop is not installed');
    if (before.configState === 'error') {
      throw new Error(before.error || 'Claude Desktop configuration is invalid');
    }
    if (before.configState === 'conflict' && !options.replaceExisting) return before;
    await this._configWriter.writeJsonValue(
      this._configPath,
      SERVER_PATH,
      this._buildEntry(options),
    );
    return this.detect(options);
  }

  public async remove(connection?: McpConnectionConfig): Promise<AiAgentIntegrationStatus> {
    const before = await this.detect(connection);
    if (before.configState === 'not-configured' || before.configState === 'conflict') return before;
    await this._configWriter.writeJsonValue(this._configPath, SERVER_PATH, undefined);
    return this.detect();
  }

  private _buildEntry(connection: McpConnectionConfig): Record<string, unknown> {
    return {
      command: this._bridge.command,
      args: [
        this._bridge.scriptPath,
        '--endpoint',
        connection.endpoint,
        '--token',
        connection.bearerToken,
      ],
      env: { ELECTRON_RUN_AS_NODE: '1' },
    };
  }

  private _resolveConfigState(
    value: unknown,
    connection?: McpConnectionConfig,
  ): AiAgentConfigState {
    if (value === undefined) return 'not-configured';
    if (!this._isRecord(value)) return 'conflict';
    const env = this._isRecord(value.env) ? value.env : {};
    const args = Array.isArray(value.args) ? value.args : [];
    const bridgeMatches =
      value.command === this._bridge.command &&
      args[0] === this._bridge.scriptPath &&
      env.ELECTRON_RUN_AS_NODE === '1';
    if (!bridgeMatches) return 'conflict';
    if (!connection) return 'configured';
    return this._arraysEqual(args, this._buildEntry(connection).args as unknown[])
      ? 'configured'
      : 'update-required';
  }

  private _arraysEqual(left: unknown[], right: unknown[]): boolean {
    return left.length === right.length && left.every((value, index) => value === right[index]);
  }

  private _status(
    executablePath: string | null,
    version: string | null,
    configState: AiAgentConfigState,
    error: string | null,
  ): AiAgentIntegrationStatus {
    return {
      id: 'claude-desktop',
      displayName: 'Claude Desktop',
      installed: Boolean(executablePath),
      executablePath,
      version,
      configPath: this._configPath,
      configState,
      requiresRestart: configState === 'configured',
      error,
    };
  }

  private _isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private _errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}

export { ClaudeDesktopIntegrationAdapter };
