import type { IpcMain } from 'electron';
import {
  createSqliteDeveloperDiagnosticsRepository,
  createSqliteMetaRepository,
  createSqliteWorkflowTaskRepository,
} from '@polytrader/sqlite-repository';
import type { DeveloperModeConfig } from '@polytrader/shared';

const DEVELOPER_MODE_CONFIG_KEY = 'developer_mode_config';
const metaRepository = createSqliteMetaRepository();
const diagnosticsRepository = createSqliteDeveloperDiagnosticsRepository();
const workflowTaskRepository = createSqliteWorkflowTaskRepository();

async function readDeveloperModeConfig(): Promise<DeveloperModeConfig> {
  const value = await metaRepository.getMetaValue(DEVELOPER_MODE_CONFIG_KEY);
  if (!value) return { enabled: false };
  try {
    const parsed = JSON.parse(value) as Partial<DeveloperModeConfig>;
    return { enabled: Boolean(parsed.enabled) };
  } catch {
    return { enabled: false };
  }
}

async function writeDeveloperModeConfig(
  input: Partial<DeveloperModeConfig>,
): Promise<DeveloperModeConfig> {
  const current = await readDeveloperModeConfig();
  const next = { enabled: input.enabled ?? current.enabled };
  await metaRepository.setMetaValue(DEVELOPER_MODE_CONFIG_KEY, JSON.stringify(next));
  return next;
}

function registerDeveloperHandlers(ipcMain: IpcMain): void {
  ipcMain.handle('developer:getModeConfig', () => readDeveloperModeConfig());
  ipcMain.handle('developer:setModeConfig', (_event, config: Partial<DeveloperModeConfig>) =>
    writeDeveloperModeConfig(config),
  );
  ipcMain.handle('developer:listMcpAccessLogs', (_event, limit?: number) =>
    diagnosticsRepository.listMcpAccessLogs(limit),
  );
  ipcMain.handle('developer:listOrderRecords', (_event, limit?: number) =>
    diagnosticsRepository.listOrderRecords(limit),
  );
  ipcMain.handle('developer:listWorkflowTasks', (_event, limit?: number) =>
    workflowTaskRepository.listRecent(limit),
  );
}

export { registerDeveloperHandlers };
