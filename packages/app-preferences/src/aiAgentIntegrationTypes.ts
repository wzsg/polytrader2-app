import type { AiAgentId, AiAgentIntegrationStatus } from '@polytrader/shared';

interface McpConnectionConfig {
  endpoint: string;
  bearerToken: string;
}

interface ConfigureAgentOptions extends McpConnectionConfig {
  replaceExisting?: boolean;
}

interface AiAgentIntegrationServiceOptions {
  homeDirectory?: string;
  environment?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
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
  ConfigureAgentOptions,
  McpConnectionConfig,
};
