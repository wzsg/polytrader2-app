import { BrowserWindow, safeStorage, shell } from 'electron';
import { createClient, type Session, type SupabaseClient, type User } from '@supabase/supabase-js';
import type {
  AuthEmailInput,
  AuthProvider,
  AuthProviderStartResult,
  AuthState,
  AuthStatus,
  AuthUserSummary,
  DataSyncResult,
} from '@polytrader/shared';
import { createSqliteMetaRepository } from '@polytrader/sqlite-repository';
import { dataSyncService } from './dataSyncService.js';
import { getMainWindow } from '../windows/mainWindow.js';

const DEEP_LINK_URL = 'polytrader2://auth/callback';
const STORAGE_PREFIX = 'supabase-auth:v1:';
const STORAGE_META_PREFIX = 'supabase_auth_storage:';

interface SupabaseStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

class SupabaseSafeStorage implements SupabaseStorage {
  private readonly _metaRepository = createSqliteMetaRepository();

  public async getItem(key: string): Promise<string | null> {
    const stored = await this._metaRepository.getMetaValue(this._storageKey(key));
    if (!stored) return null;
    if (!stored.startsWith(STORAGE_PREFIX)) return null;
    const encrypted = Buffer.from(stored.slice(STORAGE_PREFIX.length), 'base64');
    return safeStorage.decryptString(encrypted);
  }

  public async setItem(key: string, value: string): Promise<void> {
    const encrypted = safeStorage.encryptString(value);
    await this._metaRepository.setMetaValue(
      this._storageKey(key),
      `${STORAGE_PREFIX}${encrypted.toString('base64')}`,
    );
  }

  public async removeItem(key: string): Promise<void> {
    await this._metaRepository.deleteMetaValue(this._storageKey(key));
  }

  private _storageKey(key: string): string {
    return `${STORAGE_META_PREFIX}${key}`;
  }
}

class SupabaseAuthService {
  private _client: SupabaseClient | null = null;
  private _configured = false;
  private _status: AuthStatus = 'disabled';
  private _user: AuthUserSummary | null = null;
  private _email: string | null = null;
  private _error: string | null = null;
  private _initializing: Promise<void> | null = null;
  private _ready = false;
  private readonly _pendingDeepLinkUrls: string[] = [];

  public constructor() {
    dataSyncService.setDataSyncStateChangeHandler(() => {
      this._broadcastAuthState();
    });
  }

  public initialize(): void {
    if (!__ACCOUNT_DATA_SYNC_ENABLED__) {
      this._ready = true;
      this._disable('Account data sync is disabled');
      return;
    }
    if (this._initializing) return;
    this._initializing = this._initializeClient();
  }

  public getAuthState(): AuthState {
    return {
      configured: this._configured,
      status: this._status,
      user: this._user,
      email: this._email,
      dataSyncState: dataSyncService.getDataSyncState(),
      dataSyncError: dataSyncService.getDataSyncError(),
      error: this._error,
    };
  }

  public async signUpWithEmail(input: AuthEmailInput): Promise<AuthState> {
    const client = this._assertClient();
    const credentials = this._normalizeEmailInput(input);
    const { data, error } = await client.auth.signUp({
      email: credentials.email,
      password: credentials.password,
      options: { emailRedirectTo: DEEP_LINK_URL, captchaToken: credentials.captchaToken },
    });
    if (error) throw new Error(error.message);
    if (data.session) {
      await this._applySession(data.session);
      await this._syncSignedInUser();
      return this.getAuthState();
    }
    this._status = 'signed-out';
    this._email = null;
    this._user = null;
    this._error = null;
    this._broadcastAuthState();
    return this.getAuthState();
  }

  public async signInWithEmail(input: AuthEmailInput): Promise<AuthState> {
    const client = this._assertClient();
    const credentials = this._normalizeEmailInput(input);
    const { data, error } = await client.auth.signInWithPassword(credentials);
    if (error) throw new Error(error.message);
    if (!data.session) throw new Error('Sign in did not return a session');
    await this._applySession(data.session);
    await this._syncSignedInUser();
    return this.getAuthState();
  }

  public async signInWithProvider(provider: AuthProvider): Promise<AuthProviderStartResult> {
    const client = this._assertClient();
    const { data, error } = await client.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: DEEP_LINK_URL,
        skipBrowserRedirect: true,
      },
    });
    if (error) throw new Error(error.message);
    if (!data.url) throw new Error('OAuth provider did not return a sign-in URL');
    await shell.openExternal(data.url);
    return { provider };
  }

  public async resendSignupConfirmation(email: string): Promise<void> {
    const client = this._assertClient();
    const normalized = this._normalizeEmail(email);
    const { error } = await client.auth.resend({
      type: 'signup',
      email: normalized,
      options: { emailRedirectTo: DEEP_LINK_URL },
    });
    if (error) throw new Error(error.message);
    this._error = null;
    this._broadcastAuthState();
  }

  public async signOut(): Promise<AuthState> {
    const client = this._assertClient();
    const { error } = await client.auth.signOut();
    if (error) throw new Error(error.message);
    this._status = 'signed-out';
    this._user = null;
    this._email = null;
    this._error = null;
    this._broadcastAuthState();
    return this.getAuthState();
  }

  public async runDataSync(): Promise<DataSyncResult> {
    if (!__ACCOUNT_DATA_SYNC_ENABLED__) throw new Error('Account data sync is disabled');
    const userId = this._user?.id;
    if (!userId) throw new Error('Sign in before syncing data');
    return dataSyncService.syncDataForUser(userId);
  }

  public runDataSyncInBackground(): void {
    if (!__ACCOUNT_DATA_SYNC_ENABLED__) return;
    dataSyncService.syncDataInBackground(this._user?.id);
  }

  public async handleDeepLinkUrl(input: string): Promise<void> {
    if (!__ACCOUNT_DATA_SYNC_ENABLED__) return;
    const url = this._parseAuthCallbackUrl(input);
    if (!url) return;
    if (!this._ready) {
      this._pendingDeepLinkUrls.push(input);
      return;
    }
    const error = url.searchParams.get('error_description') || url.searchParams.get('error');
    if (error) {
      this._setError(error);
      this._focusMainWindow();
      return;
    }
    const code = url.searchParams.get('code');
    if (!code) return;
    const client = this._assertClient();
    const { data, error: exchangeError } = await client.auth.exchangeCodeForSession(code);
    if (exchangeError) {
      this._setError(exchangeError.message);
      this._focusMainWindow();
      return;
    }
    if (data.session) {
      await this._applySession(data.session);
      await this._syncSignedInUser();
    }
    this._focusMainWindow();
  }

  public maybeHandleDeepLinkArgv(argv: string[]): void {
    const url = argv.find((value) => value.startsWith('polytrader2://'));
    if (url) {
      void this.handleDeepLinkUrl(url).catch((error) => {
        console.warn('Failed to handle auth deep link', error);
      });
    }
  }

  private async _initializeClient(): Promise<void> {
    const url = this._readEnv('SUPABASE_URL', 'VITE_SUPABASE_URL');
    const publishableKey = this._readEnv(
      'SUPABASE_PUBLISHABLE_KEY',
      'VITE_SUPABASE_PUBLISHABLE_KEY',
    );
    if (!url || !publishableKey) {
      this._ready = true;
      this._disable('Supabase URL or publishable key is not configured');
      return;
    }
    if (!safeStorage.isEncryptionAvailable()) {
      this._ready = true;
      this._disable('System secure storage is unavailable');
      return;
    }

    this._configured = true;
    this._client = createClient(url, publishableKey, {
      auth: {
        autoRefreshToken: true,
        detectSessionInUrl: false,
        flowType: 'pkce',
        persistSession: true,
        storage: new SupabaseSafeStorage(),
      },
    });
    dataSyncService.setClient(this._client);
    this._client.auth.onAuthStateChange((_event, session) => {
      void this._handleAuthSession(session).catch((error) => {
        console.warn('Failed to handle Supabase auth session', error);
      });
    });
    const { data, error } = await this._client.auth.getSession();
    if (error) {
      this._ready = true;
      this._setError(error.message);
      return;
    }
    await this._handleAuthSession(data.session);
    if (data.session) {
      await this._syncSignedInUser();
    }
    this._ready = true;
    await this._flushPendingDeepLinks();
  }

  private async _handleAuthSession(session: Session | null): Promise<void> {
    if (!session) {
      this._status = 'signed-out';
      this._user = null;
      this._email = null;
      this._error = null;
      this._broadcastAuthState();
      return;
    }
    await this._applySession(session);
  }

  private async _applySession(session: Session): Promise<void> {
    this._status = 'signed-in';
    this._user = this._summarizeUser(session.user);
    this._email = session.user.email ?? null;
    this._error = null;
    this._broadcastAuthState();
  }

  private async _syncSignedInUser(): Promise<void> {
    if (!__ACCOUNT_DATA_SYNC_ENABLED__) return;
    const userId = this._user?.id;
    if (!userId) return;
    try {
      await dataSyncService.syncDataForUser(userId);
    } catch {
      this._broadcastAuthState();
    }
  }

  private _summarizeUser(user: User): AuthUserSummary {
    return {
      id: user.id,
      email: user.email ?? null,
    };
  }

  private _assertClient(): SupabaseClient {
    if (!this._client || !this._configured) throw new Error('Supabase is not configured');
    return this._client;
  }

  private _normalizeEmailInput(input: AuthEmailInput): AuthEmailInput {
    return {
      email: this._normalizeEmail(input.email),
      password: String(input.password ?? ''),
      captchaToken: this._normalizeCaptchaToken(input.captchaToken),
    };
  }

  private _normalizeEmail(email: string): string {
    const normalized = String(email ?? '')
      .trim()
      .toLowerCase();
    if (!normalized) throw new Error('Email is required');
    return normalized;
  }

  private _normalizeCaptchaToken(token: string | undefined): string | undefined {
    const normalized = String(token ?? '').trim();
    return normalized || undefined;
  }

  private _parseAuthCallbackUrl(input: string): URL | null {
    try {
      const url = new URL(input);
      if (url.protocol !== 'polytrader2:') return null;
      if (url.hostname !== 'auth' || url.pathname !== '/callback') return null;
      return url;
    } catch {
      return null;
    }
  }

  private _readEnv(...names: string[]): string {
    for (const name of names) {
      const value = process.env[name]?.trim();
      if (value) return value;
    }
    return '';
  }

  private _disable(error: string): void {
    this._configured = false;
    this._status = 'disabled';
    this._user = null;
    this._email = null;
    this._error = error;
    dataSyncService.setClient(null);
    this._broadcastAuthState();
  }

  private async _flushPendingDeepLinks(): Promise<void> {
    const urls = this._pendingDeepLinkUrls.splice(0);
    for (const url of urls) {
      await this.handleDeepLinkUrl(url);
    }
  }

  private _setError(error: string): void {
    this._status = this._configured ? 'error' : 'disabled';
    this._error = error;
    this._broadcastAuthState();
  }

  private _broadcastAuthState(): void {
    const state = this.getAuthState();
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) {
        window.webContents.send('auth:changed', state);
      }
    }
  }

  private _focusMainWindow(): void {
    const window = getMainWindow();
    if (!window || window.isDestroyed()) return;
    if (window.isMinimized()) window.restore();
    window.show();
    window.focus();
  }
}

const supabaseAuthService = new SupabaseAuthService();

export { supabaseAuthService };
