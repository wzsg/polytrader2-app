import type { IpcMain } from 'electron';
import type { AuthEmailInput, AuthProvider } from '@polytrader/shared';
import { wrap } from './result.js';
import { supabaseAuthService } from '../services/supabaseAuthService.js';

function registerAuthHandlers(ipcMain: IpcMain): void {
  ipcMain.handle('auth:getState', () => supabaseAuthService.getAuthState());
  ipcMain.handle(
    'auth:signUpWithEmail',
    wrap((input: AuthEmailInput) => supabaseAuthService.signUpWithEmail(input)),
  );
  ipcMain.handle(
    'auth:signInWithEmail',
    wrap((input: AuthEmailInput) => supabaseAuthService.signInWithEmail(input)),
  );
  ipcMain.handle(
    'auth:signInWithProvider',
    wrap((provider: AuthProvider) => supabaseAuthService.signInWithProvider(provider)),
  );
  ipcMain.handle(
    'auth:resendSignupConfirmation',
    wrap((email: string) => supabaseAuthService.resendSignupConfirmation(email)),
  );
  ipcMain.handle(
    'auth:signOut',
    wrap(() => supabaseAuthService.signOut()),
  );
  ipcMain.handle(
    'auth:syncUserData',
    wrap(() => supabaseAuthService.syncUserData()),
  );
}

export { registerAuthHandlers };
