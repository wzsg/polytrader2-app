import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { AiAgentId, AiAgentIntegrationStatus } from '@polytrader/shared';
import { AgentCommandRunner } from './agentCommandRunner.js';
import { CodexIntegrationAdapter } from './codexIntegrationAdapter.js';
import { JsonAgentAdapter, type JsonAgentDefinition } from './jsonAgentAdapter.js';
import { ManagedConfigWriter } from './managedConfigWriter.js';
import type {
  AiAgentAdapter,
  AiAgentIntegrationServiceOptions,
  ConfigureAgentOptions,
  McpConnectionConfig,
} from './aiAgentIntegrationTypes.js';

class AiAgentIntegrationService {
  private readonly _adapters: Map<AiAgentId, AiAgentAdapter>;

  public constructor(options: AiAgentIntegrationServiceOptions = {}) {
    const environment = options.environment ?? process.env;
    const platform = options.platform ?? process.platform;
    const homeDirectory = options.homeDirectory ?? homedir();
    const commandRunner = new AgentCommandRunner(environment, platform);
    const configWriter = new ManagedConfigWriter();
    const definitions = this._jsonDefinitions(homeDirectory, environment, platform);
    const adapters: AiAgentAdapter[] = [
      new CodexIntegrationAdapter(
        join(homeDirectory, '.codex', 'config.toml'),
        this._knownExecutablePaths('codex', homeDirectory, environment, platform),
        commandRunner,
        configWriter,
      ),
      ...definitions.map(
        (definition) => new JsonAgentAdapter(definition, commandRunner, configWriter),
      ),
    ];
    this._adapters = new Map(adapters.map((adapter) => [adapter.id, adapter]));
  }

  public async detectAll(
    connections: Partial<Record<AiAgentId, McpConnectionConfig>> = {},
  ): Promise<AiAgentIntegrationStatus[]> {
    return Promise.all(
      [...this._adapters.values()].map((adapter) => adapter.detect(connections[adapter.id])),
    );
  }

  public detect(
    agentId: AiAgentId,
    connection?: McpConnectionConfig,
  ): Promise<AiAgentIntegrationStatus> {
    return this._adapter(agentId).detect(connection);
  }

  public configure(
    agentId: AiAgentId,
    options: ConfigureAgentOptions,
  ): Promise<AiAgentIntegrationStatus> {
    return this._adapter(agentId).configure(options);
  }

  public remove(
    agentId: AiAgentId,
    connection?: McpConnectionConfig,
  ): Promise<AiAgentIntegrationStatus> {
    return this._adapter(agentId).remove(connection);
  }

  private _adapter(agentId: AiAgentId): AiAgentAdapter {
    const adapter = this._adapters.get(agentId);
    if (!adapter) throw new Error(`Unsupported AI agent: ${agentId}`);
    return adapter;
  }

  private _jsonDefinitions(
    homeDirectory: string,
    environment: NodeJS.ProcessEnv,
    platform: NodeJS.Platform,
  ): JsonAgentDefinition[] {
    const openCodeJsonc = join(homeDirectory, '.config', 'opencode', 'opencode.jsonc');
    const openCodeJson = join(homeDirectory, '.config', 'opencode', 'opencode.json');
    return [
      {
        id: 'claude-code',
        displayName: 'Claude Code',
        command: 'claude',
        knownExecutablePaths: this._knownExecutablePaths(
          'claude',
          homeDirectory,
          environment,
          platform,
        ),
        configPath: join(homeDirectory, '.claude.json'),
        rootKey: 'mcpServers',
        transportType: 'http',
      },
      {
        id: 'opencode',
        displayName: 'OpenCode',
        command: 'opencode',
        knownExecutablePaths: this._knownExecutablePaths(
          'opencode',
          homeDirectory,
          environment,
          platform,
        ),
        configPath: existsSync(openCodeJsonc) ? openCodeJsonc : openCodeJson,
        rootKey: 'mcp',
        transportType: 'remote',
      },
      {
        id: 'cursor',
        displayName: 'Cursor',
        command: 'cursor',
        knownExecutablePaths: this._knownExecutablePaths(
          'cursor',
          homeDirectory,
          environment,
          platform,
        ),
        configPath: join(homeDirectory, '.cursor', 'mcp.json'),
        rootKey: 'mcpServers',
      },
    ];
  }

  private _knownExecutablePaths(
    command: string,
    homeDirectory: string,
    environment: NodeJS.ProcessEnv,
    platform: NodeJS.Platform,
  ): string[] {
    if (platform === 'win32') {
      const localAppData = environment.LOCALAPPDATA || '';
      const common = [
        join(homeDirectory, '.local', 'bin', `${command}.exe`),
        join(homeDirectory, '.local', 'bin', `${command}.cmd`),
      ];
      if (command === 'cursor' && localAppData) {
        common.unshift(
          join(localAppData, 'Programs', 'cursor', 'resources', 'app', 'bin', 'cursor.cmd'),
          join(localAppData, 'Programs', 'cursor', 'Cursor.exe'),
        );
      }
      return common;
    }
    const common = [join(homeDirectory, '.local', 'bin', command), `/usr/local/bin/${command}`];
    if (command === 'cursor' && platform === 'darwin') {
      common.unshift('/Applications/Cursor.app/Contents/Resources/app/bin/cursor');
    }
    return common;
  }
}

export { AiAgentIntegrationService };
