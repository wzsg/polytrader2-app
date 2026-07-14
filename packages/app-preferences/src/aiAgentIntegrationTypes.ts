import type { AiAgentId, AiAgentIntegrationStatus } from '@polytrader/shared';

interface McpConnectionConfig {
  endpoint: string;
  bearerToken: string;
}

interface ConfigureAgentOptions extends McpConnectionConfig {
  replaceExisting?: boolean;
}

interface ClaudeDesktopBridgeConfig {
  command: string;
  scriptPath: string;
}

interface AiAgentIntegrationServiceOptions {
  homeDirectory?: string;
  environment?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  claudeDesktopBridge?: ClaudeDesktopBridgeConfig;
}

interface AiAgentAdapter {
  readonly id: AiAgentId;
  detect(connection?: McpConnectionConfig): Promise<AiAgentIntegrationStatus>;
  configure(options: ConfigureAgentOptions): Promise<AiAgentIntegrationStatus>;
  remove(connection?: McpConnectionConfig): Promise<AiAgentIntegrationStatus>;
}

export type {
  AiAgentAdapter,
  AiAgentIntegrationServiceOptions,
  ClaudeDesktopBridgeConfig,
  ConfigureAgentOptions,
  McpConnectionConfig,
};
