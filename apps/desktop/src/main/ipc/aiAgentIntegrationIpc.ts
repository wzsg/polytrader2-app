import type { IpcMain } from 'electron';
import type { AiAgentId } from '@polytrader/shared';
import { aiAgentIntegrationService } from '../services/aiAgentIntegrationService.js';

function registerAiAgentIntegrationHandlers(ipcMain: IpcMain): void {
  ipcMain.handle('ai-agent-integrations:detect', () => aiAgentIntegrationService.detectAll());
  ipcMain.handle(
    'ai-agent-integrations:configure',
    (_event, agentId: AiAgentId, options?: { replaceExisting?: boolean }) =>
      aiAgentIntegrationService.configure(agentId, options),
  );
  ipcMain.handle('ai-agent-integrations:remove', (_event, agentId: AiAgentId) =>
    aiAgentIntegrationService.remove(agentId),
  );
}

export { registerAiAgentIntegrationHandlers };
