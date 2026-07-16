import type { IpcMain } from 'electron';
import { wrap } from './result.js';
import { supabaseAuthService } from '../services/supabaseAuthService.js';

function registerDataSyncHandlers(ipcMain: IpcMain): void {
  ipcMain.handle(
    'data-sync:run',
    wrap(() => supabaseAuthService.runDataSync()),
  );
}

export { registerDataSyncHandlers };
