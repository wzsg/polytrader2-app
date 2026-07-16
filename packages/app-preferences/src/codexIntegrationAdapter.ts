import type { AiAgentConfigState, AiAgentId, AiAgentIntegrationStatus } from '@polytrader/shared';
import type {
  AiAgentAdapter,
  ConfigureAgentOptions,
  McpConnectionConfig,
} from './aiAgentIntegrationTypes.js';
import type { AgentCommandRunner } from './agentCommandRunner.js';
import type { ManagedConfigWriter } from './managedConfigWriter.js';

const BEGIN_MARKER = '# BEGIN POLYTRADER2 MANAGED MCP';
const END_MARKER = '# END POLYTRADER2 MANAGED MCP';
const SERVER_TABLE = '[mcp_servers.polytrader2]';

class CodexIntegrationAdapter implements AiAgentAdapter {
  private readonly _configPath: string;
  private readonly _knownExecutablePaths: string[];
  private readonly _desktopApplicationPaths: string[];
  private readonly _commandRunner: AgentCommandRunner;
  private readonly _configWriter: ManagedConfigWriter;

  public constructor(
    configPath: string,
    knownExecutablePaths: string[],
    desktopApplicationPaths: string[],
    commandRunner: AgentCommandRunner,
    configWriter: ManagedConfigWriter,
  ) {
    this._configPath = configPath;
    this._knownExecutablePaths = knownExecutablePaths;
    this._desktopApplicationPaths = desktopApplicationPaths;
    this._commandRunner = commandRunner;
    this._configWriter = configWriter;
  }

  public get id(): AiAgentId {
    return 'codex';
  }

  public async detect(connection?: McpConnectionConfig): Promise<AiAgentIntegrationStatus> {
    const installation = await this._commandRunner.findPreferredInstallation(
      'codex',
      this._knownExecutablePaths,
      this._desktopApplicationPaths,
    );
    const executablePath = installation?.path ?? null;
    const version = installation?.version ?? null;
    try {
      const content = await this._configWriter.readTextFile(this._configPath);
      const block = await this._configWriter.readManagedTomlBlock(
        this._configPath,
        BEGIN_MARKER,
        END_MARKER,
      );
      let state: AiAgentConfigState = 'not-configured';
      if (block) state = this._resolveBlockState(block, connection);
      else if (content.includes(SERVER_TABLE)) state = 'conflict';
      return this._status(executablePath, version, state, null);
    } catch (error) {
      return this._status(executablePath, version, 'error', this._errorMessage(error));
    }
  }

  public async configure(options: ConfigureAgentOptions): Promise<AiAgentIntegrationStatus> {
    const before = await this.detect(options);
    if (!before.installed) throw new Error('Codex is not installed');
    if (before.configState === 'error')
      throw new Error(before.error || 'Codex configuration is invalid');
    if (before.configState === 'conflict' && !options.replaceExisting) return before;
    if (before.configState === 'conflict') {
      throw new Error('An unmanaged Codex MCP server named polytrader2 already exists');
    }
    await this._configWriter.writeManagedTomlBlock(
      this._configPath,
      BEGIN_MARKER,
      END_MARKER,
      this._buildBlock(options),
    );
    return this.detect(options);
  }

  public async remove(connection?: McpConnectionConfig): Promise<AiAgentIntegrationStatus> {
    const before = await this.detect(connection);
    if (before.configState === 'not-configured') return before;
    if (before.configState === 'conflict') return before;
    await this._configWriter.writeManagedTomlBlock(
      this._configPath,
      BEGIN_MARKER,
      END_MARKER,
      null,
    );
    return this.detect();
  }

  private _buildBlock(connection: McpConnectionConfig): string {
    return [
      BEGIN_MARKER,
      SERVER_TABLE,
      `url = "${this._escapeToml(connection.endpoint)}"`,
      `http_headers = { Authorization = "Bearer ${this._escapeToml(connection.bearerToken)}" }`,
      'enabled = true',
      END_MARKER,
    ].join('\n');
  }

  private _resolveBlockState(block: string, connection?: McpConnectionConfig): AiAgentConfigState {
    if (!connection) return 'configured';
    const endpointMatches = block.includes(`url = "${this._escapeToml(connection.endpoint)}"`);
    const tokenMatches = block.includes(
      `Authorization = "Bearer ${this._escapeToml(connection.bearerToken)}"`,
    );
    if (endpointMatches && tokenMatches) return 'configured';
    return endpointMatches ? 'update-required' : 'conflict';
  }

  private _escapeToml(value: string): string {
    return value.replaceAll('\\', '\\\\').replaceAll('"', '\\"');
  }

  private _status(
    executablePath: string | null,
    version: string | null,
    configState: AiAgentConfigState,
    error: string | null,
  ): AiAgentIntegrationStatus {
    return {
      id: 'codex',
      displayName: 'Codex',
      installed: Boolean(executablePath),
      executablePath,
      version,
      configPath: this._configPath,
      configState,
      requiresRestart: configState === 'configured',
      error,
    };
  }

  private _errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}

export { CodexIntegrationAdapter };
