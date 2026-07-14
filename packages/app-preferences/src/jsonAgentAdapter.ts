import type { AiAgentConfigState, AiAgentId, AiAgentIntegrationStatus } from '@polytrader/shared';
import type {
  AiAgentAdapter,
  ConfigureAgentOptions,
  McpConnectionConfig,
} from './aiAgentIntegrationTypes.js';
import type { AgentCommandRunner } from './agentCommandRunner.js';
import type { ManagedConfigWriter } from './managedConfigWriter.js';

interface JsonAgentDefinition {
  id: AiAgentId;
  displayName: string;
  command: string;
  knownExecutablePaths: string[];
  desktopApplicationPaths?: string[];
  configPath: string;
  rootKey: string;
  transportType?: string;
}

class JsonAgentAdapter implements AiAgentAdapter {
  private readonly _definition: JsonAgentDefinition;
  private readonly _commandRunner: AgentCommandRunner;
  private readonly _configWriter: ManagedConfigWriter;

  public constructor(
    definition: JsonAgentDefinition,
    commandRunner: AgentCommandRunner,
    configWriter: ManagedConfigWriter,
  ) {
    this._definition = definition;
    this._commandRunner = commandRunner;
    this._configWriter = configWriter;
  }

  public get id(): AiAgentId {
    return this._definition.id;
  }

  public async detect(connection?: McpConnectionConfig): Promise<AiAgentIntegrationStatus> {
    const installation = await this._commandRunner.findPreferredInstallation(
      this._definition.command,
      this._definition.knownExecutablePaths,
      this._definition.desktopApplicationPaths ?? [],
    );
    const executablePath = installation?.path ?? null;
    const version = installation?.version ?? null;
    try {
      const entry = await this._configWriter.readJsonValue(this._definition.configPath, [
        this._definition.rootKey,
        'polytrader2',
      ]);
      return this._status(
        executablePath,
        version,
        this._resolveConfigState(entry, connection),
        null,
      );
    } catch (error) {
      return this._status(executablePath, version, 'error', this._errorMessage(error));
    }
  }

  public async configure(options: ConfigureAgentOptions): Promise<AiAgentIntegrationStatus> {
    const before = await this.detect(options);
    if (!before.installed) throw new Error(`${this._definition.displayName} is not installed`);
    if (before.configState === 'error')
      throw new Error(before.error || 'Agent configuration is invalid');
    if (before.configState === 'conflict' && !options.replaceExisting) {
      return before;
    }
    await this._configWriter.writeJsonValue(
      this._definition.configPath,
      [this._definition.rootKey, 'polytrader2'],
      this._buildEntry(options),
    );
    return this.detect(options);
  }

  public async remove(connection?: McpConnectionConfig): Promise<AiAgentIntegrationStatus> {
    const before = await this.detect(connection);
    if (before.configState === 'not-configured') return before;
    if (before.configState === 'conflict') return before;
    await this._configWriter.writeJsonValue(
      this._definition.configPath,
      [this._definition.rootKey, 'polytrader2'],
      undefined,
    );
    return this.detect();
  }

  private _buildEntry(connection: McpConnectionConfig): Record<string, unknown> {
    const entry: Record<string, unknown> = {
      url: connection.endpoint,
      headers: { Authorization: `Bearer ${connection.bearerToken}` },
    };
    if (this._definition.transportType) entry.type = this._definition.transportType;
    if (this._definition.id === 'opencode') entry.enabled = true;
    return entry;
  }

  private _resolveConfigState(
    value: unknown,
    connection?: McpConnectionConfig,
  ): AiAgentConfigState {
    if (value === undefined) return 'not-configured';
    if (!this._isRecord(value)) return 'conflict';
    if (!connection) return 'configured';
    const url = typeof value.url === 'string' ? value.url : '';
    const headers = this._isRecord(value.headers) ? value.headers : {};
    const authorization = typeof headers.Authorization === 'string' ? headers.Authorization : '';
    const typeMatches =
      !this._definition.transportType || value.type === this._definition.transportType;
    if (
      url === connection.endpoint &&
      authorization === `Bearer ${connection.bearerToken}` &&
      typeMatches
    ) {
      return 'configured';
    }
    return url === connection.endpoint ? 'update-required' : 'conflict';
  }

  private _status(
    executablePath: string | null,
    version: string | null,
    configState: AiAgentConfigState,
    error: string | null,
  ): AiAgentIntegrationStatus {
    return {
      id: this._definition.id,
      displayName: this._definition.displayName,
      installed: Boolean(executablePath),
      executablePath,
      version,
      configPath: this._definition.configPath,
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

export { JsonAgentAdapter };
export type { JsonAgentDefinition };
