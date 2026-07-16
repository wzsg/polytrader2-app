type AiAgentId = 'codex' | 'claude-desktop' | 'opencode' | 'cursor';

type AiAgentConfigState =
  'not-configured' | 'configured' | 'update-required' | 'conflict' | 'error';

interface AiAgentIntegrationStatus {
  id: AiAgentId;
  displayName: string;
  installed: boolean;
  executablePath: string | null;
  version: string | null;
  configPath: string;
  configState: AiAgentConfigState;
  requiresRestart: boolean;
  error: string | null;
}

export type { AiAgentConfigState, AiAgentId, AiAgentIntegrationStatus };
