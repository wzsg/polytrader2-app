import { homedir } from 'node:os';
import { AiAgentIntegrationService } from '@polytrader/app-preferences';
import type { McpConnectionConfig } from '@polytrader/app-preferences';
import type { AiAgentId, AiAgentIntegrationStatus } from '@polytrader/shared';
import { mcpServerManager } from './mcpServerService.js';

const AGENT_IDS: AiAgentId[] = ['codex', 'claude-code', 'opencode', 'cursor'];

class DesktopAiAgentIntegrationService {
  private readonly _service: AiAgentIntegrationService;

  public constructor() {
    this._service = new AiAgentIntegrationService({ homeDirectory: homedir() });
  }

  public async detectAll(): Promise<AiAgentIntegrationStatus[]> {
    return this._service.detectAll(await this._connections());
  }

  public async configure(
    agentId: AiAgentId,
    options: { replaceExisting?: boolean } = {},
  ): Promise<AiAgentIntegrationStatus> {
    const config = await mcpServerManager.readConfig();
    if (!config.enabled) await mcpServerManager.writeConfig({ enabled: true });
    const status = await mcpServerManager.getStatus();
    if (!status.running) throw new Error(status.error || 'Local MCP server is not running');

    const credential = await mcpServerManager.issueClientToken(agentId);
    const connection: McpConnectionConfig = {
      endpoint: status.endpoint,
      bearerToken: credential.token,
    };
    try {
      const result = await this._service.configure(agentId, {
        ...connection,
        replaceExisting: options.replaceExisting,
      });
      if (result.configState !== 'configured') {
        if (credential.created) await mcpServerManager.revokeClientToken(agentId);
        return result;
      }
      await this._verifyConnection(connection);
      return result;
    } catch (error) {
      if (credential.created) {
        await this._service.remove(agentId, connection).catch(() => undefined);
        await mcpServerManager.revokeClientToken(agentId).catch(() => undefined);
      }
      throw error;
    }
  }

  public async remove(agentId: AiAgentId): Promise<AiAgentIntegrationStatus> {
    const token = await mcpServerManager.getClientToken(agentId);
    const status = await mcpServerManager.getStatus();
    const connection = token ? { endpoint: status.endpoint, bearerToken: token } : undefined;
    const result = await this._service.remove(agentId, connection);
    if (result.configState === 'not-configured') {
      await mcpServerManager.revokeClientToken(agentId);
    }
    return result;
  }

  private async _connections(): Promise<Partial<Record<AiAgentId, McpConnectionConfig>>> {
    const status = await mcpServerManager.getStatus();
    const entries = await Promise.all(
      AGENT_IDS.map(async (agentId) => {
        const token = await mcpServerManager.getClientToken(agentId);
        return token
          ? ([agentId, { endpoint: status.endpoint, bearerToken: token }] as const)
          : null;
      }),
    );
    return Object.fromEntries(entries.filter((entry) => entry !== null));
  }

  private async _verifyConnection(connection: McpConnectionConfig): Promise<void> {
    const response = await fetch(connection.endpoint, {
      method: 'POST',
      headers: {
        Accept: 'application/json, text/event-stream',
        Authorization: `Bearer ${connection.bearerToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-03-26',
          capabilities: {},
          clientInfo: { name: 'polytrader2-integration-check', version: '1.0.0' },
        },
      }),
    });
    if (!response.ok) throw new Error(`MCP connection verification failed (${response.status})`);
    const sessionId = response.headers.get('mcp-session-id');
    if (sessionId) {
      await fetch(connection.endpoint, {
        method: 'DELETE',
        headers: {
          Accept: 'application/json, text/event-stream',
          Authorization: `Bearer ${connection.bearerToken}`,
          'Mcp-Session-Id': sessionId,
        },
      }).catch(() => undefined);
    }
  }
}

const aiAgentIntegrationService = new DesktopAiAgentIntegrationService();

export { aiAgentIntegrationService, DesktopAiAgentIntegrationService };
