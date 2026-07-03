import type { IpcMain } from 'electron';
import type { McpServerConfig } from '@polytrader/shared';
import { mcpServerManager } from '../mcp/mcpServerManager.js';

function registerMcpHandlers(ipcMain: IpcMain): void {
  ipcMain.handle('mcp:getConfig', () => mcpServerManager.readConfig());
  ipcMain.handle('mcp:setConfig', (_event, config: Partial<McpServerConfig>) =>
    mcpServerManager.writeConfig(config),
  );
  ipcMain.handle('mcp:resetToken', () => mcpServerManager.resetToken());
  ipcMain.handle('mcp:getStatus', () => mcpServerManager.getStatus());
}

export { registerMcpHandlers };
