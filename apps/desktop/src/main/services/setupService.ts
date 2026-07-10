import { app } from 'electron';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import { dirname, join } from 'path';
import type {
  ApiResult,
  AppLocalePreference,
  CacheStats,
  SetupState,
  SyncStatus,
} from '@polytrader/shared';
import { createSqliteEventRepository } from '@polytrader/sqlite-repository';
import { initializeAppStorage } from '../app/bootstrap.js';
import { appPreferencesService } from './appPreferencesService.js';
import { polymarketMarketService } from './polymarketMarketService.js';
import { walletEncryptionService, type WalletEncryptionMethod } from './walletEncryptionService.js';

const BOOTSTRAP_CONFIG_DIR = 'Polytrader2';
const BOOTSTRAP_CONFIG_FILE = 'bootstrap.json';
const SETTINGS_FILE = 'settings.json';
const DATABASE_FILE = 'polytrader2.db';
const DEFAULT_DATA_DIR = 'data';
const MINIMUM_AVAILABLE_SPACE_BYTES = 2 * 1024 ** 3;
const PASSWORD_VERIFIER = 'polytrader2-password-verifier-v1';

interface BootstrapConfig {
  dataDirectory: string;
}

interface SetupSettings {
  version: 1;
  setupCompleted: boolean;
  localePreference: AppLocalePreference;
  keyMaterialEncryption: {
    method: WalletEncryptionMethod;
    passwordVerifier?: string;
  };
}

interface SetupStartInput {
  dataDirectory: string;
  localePreference: AppLocalePreference;
  encryptionMethod: WalletEncryptionMethod;
  password?: string;
  confirmPassword?: string;
}

class SetupService {
  private readonly _eventRepository = createSqliteEventRepository();
  private _running = false;
  private _lastStatus: SyncStatus = { state: 'idle' };
  private _initializedDataDirectory: string | null = null;

  public getBootstrapConfigPath(): string {
    return join(app.getPath('appData'), BOOTSTRAP_CONFIG_DIR, BOOTSTRAP_CONFIG_FILE);
  }

  public getDefaultDataDirectory(): string {
    return join(app.getPath('appData'), BOOTSTRAP_CONFIG_DIR, DEFAULT_DATA_DIR);
  }

  public async resolveStartupState(): Promise<SetupState> {
    const bootstrap = await this._readBootstrapConfig();
    if (!bootstrap) return this._emptyState();
    const directory = await this._inspectDataDirectory(bootstrap.dataDirectory);
    if (!directory.ok || !directory.data.settings?.setupCompleted) return this._emptyState();
    const settings = directory.data.settings;
    return this._state({
      dataDirectory: directory.data.dataDirectory,
      settings,
      availableSpaceBytes: directory.data.availableSpaceBytes,
      hasExistingDatabase: directory.data.hasExistingDatabase,
      setupCompleted: true,
      requiresPassword: settings.keyMaterialEncryption.method === 'aes-256-gcm',
      encryptionLocked: directory.data.hasExistingDatabase,
    });
  }

  public async getCurrentSetupState(): Promise<SetupState> {
    return await this.resolveStartupState();
  }

  public async validateDataDirectory(dataDirectory: string): Promise<ApiResult<SetupState>> {
    const inspected = await this._inspectDataDirectory(dataDirectory);
    if (!inspected.ok) return inspected;
    const settings = inspected.data.settings;
    return {
      ok: true,
      data: this._state({
        dataDirectory: inspected.data.dataDirectory,
        settings,
        availableSpaceBytes: inspected.data.availableSpaceBytes,
        hasExistingDatabase: inspected.data.hasExistingDatabase,
        setupCompleted: Boolean(settings?.setupCompleted),
        requiresPassword: false,
        encryptionLocked: inspected.data.hasExistingDatabase,
      }),
    };
  }

  public async startInitialSetup(input: SetupStartInput): Promise<ApiResult<SetupState>> {
    if (this._running) return { ok: false, error: 'Initial setup is already running' };
    const validated = await this._inspectDataDirectory(input.dataDirectory);
    if (!validated.ok) return validated;
    if (validated.data.availableSpaceBytes <= MINIMUM_AVAILABLE_SPACE_BYTES) {
      return { ok: false, error: 'The selected data directory must have more than 2 GB available' };
    }
    const existingMethod = validated.data.settings?.keyMaterialEncryption.method;
    if (validated.data.hasExistingDatabase && !existingMethod) {
      return {
        ok: false,
        error: 'Existing data requires a valid settings.json encryption configuration',
      };
    }
    if (existingMethod && existingMethod !== input.encryptionMethod) {
      return {
        ok: false,
        error: 'The encryption method cannot be changed for an existing database',
      };
    }
    if (
      this._initializedDataDirectory &&
      this._initializedDataDirectory.toLowerCase() !== validated.data.dataDirectory.toLowerCase()
    ) {
      return {
        ok: false,
        error: 'Restart the app to choose a different data directory after storage is initialized',
      };
    }

    try {
      const settings = this._createSettings(input, existingMethod ? validated.data.settings : null);
      this._configureEncryption(settings, input.password);
      await this._writeSettings(validated.data.dataDirectory, settings);
      this._running = true;
      this._lastStatus = { state: 'idle' };
      await initializeAppStorage(validated.data.dataDirectory);
      this._initializedDataDirectory = validated.data.dataDirectory;
      await appPreferencesService.setLocalePreference(settings.localePreference);
      const preferences = await appPreferencesService.getAppPreferences();
      polymarketMarketService.setEventSyncLocale(preferences.locale);
      polymarketMarketService.setEventSyncBatchSize(preferences.eventSyncBatchSize);
      await polymarketMarketService.runEventSyncWorkflow(
        { locale: preferences.locale, trigger: 'startup' },
        new AbortController().signal,
      );
      const cacheStats = await this._eventRepository.getCacheStats();
      if (cacheStats.eventCount <= 0) {
        return { ok: false, error: 'Event data download completed without cached events' };
      }
      const completedSettings = { ...settings, setupCompleted: true as const };
      await this._writeSettings(validated.data.dataDirectory, completedSettings);
      await this._writeBootstrapConfig({ dataDirectory: validated.data.dataDirectory });
      return {
        ok: true,
        data: this._state({
          dataDirectory: validated.data.dataDirectory,
          settings: completedSettings,
          availableSpaceBytes: validated.data.availableSpaceBytes,
          hasExistingDatabase: validated.data.hasExistingDatabase,
          setupCompleted: true,
          requiresPassword: false,
          encryptionLocked: validated.data.hasExistingDatabase,
          cacheStats,
          syncStatus: {
            state: 'done',
            completedEvents: cacheStats.eventCount,
            totalEvents: cacheStats.eventCount,
            progressPercent: 100,
          },
        }),
      };
    } catch (error) {
      return { ok: false, error: this._errorMessage(error) };
    } finally {
      this._running = false;
    }
  }

  public async unlockInitialSetup(password: string): Promise<ApiResult<SetupState>> {
    const state = await this.resolveStartupState();
    if (!state.setupCompleted || !state.dataDirectory || state.encryptionMethod !== 'aes-256-gcm') {
      return { ok: false, error: 'AES password unlock is not required' };
    }
    try {
      const settings = await this._readSettings(state.dataDirectory);
      if (!settings?.keyMaterialEncryption.passwordVerifier)
        throw new Error('AES password verifier is missing');
      walletEncryptionService.configure('aes-256-gcm', password);
      const verifier = walletEncryptionService.decryptWalletKeyMaterial(
        settings.keyMaterialEncryption.passwordVerifier,
      );
      if (verifier !== PASSWORD_VERIFIER) throw new Error('Incorrect password');
      return { ok: true, data: { ...state, requiresPassword: false } };
    } catch {
      return { ok: false, error: 'Incorrect password' };
    }
  }

  public async configureStartupEncryption(): Promise<void> {
    const state = await this.resolveStartupState();
    if (!state.setupCompleted || !state.dataDirectory || !state.encryptionMethod) {
      throw new Error('Initial setup is incomplete');
    }
    if (state.encryptionMethod === 'aes-256-gcm')
      throw new Error('AES password unlock is required');
    walletEncryptionService.verifySystemMethod(state.encryptionMethod);
  }

  public setLastSyncStatus(status: SyncStatus): void {
    this._lastStatus = status;
  }

  private _createSettings(input: SetupStartInput, existing: SetupSettings | null): SetupSettings {
    if (input.encryptionMethod === 'aes-256-gcm') {
      if (existing) {
        if (!input.password?.trim())
          throw new Error('Password is required to open the existing database');
        walletEncryptionService.configure('aes-256-gcm', input.password);
        if (
          !existing.keyMaterialEncryption.passwordVerifier ||
          walletEncryptionService.decryptWalletKeyMaterial(
            existing.keyMaterialEncryption.passwordVerifier,
          ) !== PASSWORD_VERIFIER
        ) {
          throw new Error('Incorrect password');
        }
        return { ...existing, setupCompleted: false, localePreference: input.localePreference };
      }
      if (!input.password?.trim() || input.password !== input.confirmPassword) {
        throw new Error('AES passwords must be non-empty and match');
      }
      walletEncryptionService.configure('aes-256-gcm', input.password);
      return {
        version: 1,
        setupCompleted: false,
        localePreference: input.localePreference,
        keyMaterialEncryption: {
          method: 'aes-256-gcm',
          passwordVerifier: walletEncryptionService.encryptWalletKeyMaterial(PASSWORD_VERIFIER),
        },
      };
    }
    return {
      version: 1,
      setupCompleted: false,
      localePreference: input.localePreference,
      keyMaterialEncryption: { method: input.encryptionMethod },
    };
  }

  private _configureEncryption(settings: SetupSettings, password?: string): void {
    if (settings.keyMaterialEncryption.method === 'aes-256-gcm') {
      walletEncryptionService.configure('aes-256-gcm', password);
      return;
    }
    walletEncryptionService.verifySystemMethod(settings.keyMaterialEncryption.method);
  }

  private async _inspectDataDirectory(dataDirectory: string): Promise<
    ApiResult<{
      dataDirectory: string;
      availableSpaceBytes: number;
      hasExistingDatabase: boolean;
      settings: SetupSettings | null;
    }>
  > {
    const normalized = String(dataDirectory || '').trim();
    if (!normalized) return { ok: false, error: 'Data directory is required' };
    try {
      await fs.mkdir(normalized, { recursive: true });
      const probePath = join(normalized, `.polytrader2-write-test-${process.pid}`);
      await fs.writeFile(probePath, 'ok', 'utf-8');
      await fs.unlink(probePath);
      const stats = await fs.statfs(normalized);
      return {
        ok: true,
        data: {
          dataDirectory: normalized,
          availableSpaceBytes: Number(stats.bavail) * Number(stats.bsize),
          hasExistingDatabase: existsSync(join(normalized, DATABASE_FILE)),
          settings: await this._readSettings(normalized),
        },
      };
    } catch (error) {
      return { ok: false, error: this._errorMessage(error) };
    }
  }

  private _emptyState(): SetupState {
    return this._state({
      dataDirectory: null,
      settings: null,
      availableSpaceBytes: null,
      hasExistingDatabase: false,
      setupCompleted: false,
      requiresPassword: false,
      encryptionLocked: false,
    });
  }

  private _state(input: {
    dataDirectory: string | null;
    settings: SetupSettings | null;
    availableSpaceBytes: number | null;
    hasExistingDatabase: boolean;
    setupCompleted: boolean;
    requiresPassword: boolean;
    encryptionLocked: boolean;
    cacheStats?: CacheStats;
    syncStatus?: SyncStatus;
  }): SetupState {
    return {
      setupCompleted: input.setupCompleted,
      dataDirectory: input.dataDirectory,
      defaultDataDirectory: this.getDefaultDataDirectory(),
      localePreference: input.settings?.localePreference ?? 'system',
      systemLocale: app.getLocale(),
      encryptionMethod: input.settings?.keyMaterialEncryption.method ?? null,
      encryptionLocked: input.encryptionLocked,
      requiresPassword: input.requiresPassword,
      availableSpaceBytes: input.availableSpaceBytes,
      hasExistingDatabase: input.hasExistingDatabase,
      cacheStats: input.cacheStats,
      syncStatus: input.syncStatus,
    };
  }

  private async _readBootstrapConfig(): Promise<BootstrapConfig | null> {
    try {
      const parsed = JSON.parse(
        await fs.readFile(this.getBootstrapConfigPath(), 'utf-8'),
      ) as Partial<BootstrapConfig>;
      return typeof parsed.dataDirectory === 'string' && parsed.dataDirectory.trim()
        ? { dataDirectory: parsed.dataDirectory }
        : null;
    } catch {
      return null;
    }
  }

  private async _readSettings(dataDirectory: string): Promise<SetupSettings | null> {
    try {
      const parsed = JSON.parse(
        await fs.readFile(join(dataDirectory, SETTINGS_FILE), 'utf-8'),
      ) as Partial<SetupSettings>;
      const method = parsed.keyMaterialEncryption?.method;
      if (
        parsed.version !== 1 ||
        typeof parsed.setupCompleted !== 'boolean' ||
        (parsed.localePreference !== 'system' &&
          parsed.localePreference !== 'en-US' &&
          parsed.localePreference !== 'zh-CN') ||
        (method !== 'keychain' && method !== 'dpapi' && method !== 'aes-256-gcm')
      )
        return null;
      return parsed as SetupSettings;
    } catch {
      return null;
    }
  }

  private async _writeBootstrapConfig(config: BootstrapConfig): Promise<void> {
    const path = this.getBootstrapConfigPath();
    await fs.mkdir(dirname(path), { recursive: true });
    await fs.writeFile(path, `${JSON.stringify(config, null, 2)}\n`, 'utf-8');
  }

  private async _writeSettings(dataDirectory: string, settings: SetupSettings): Promise<void> {
    await fs.writeFile(
      join(dataDirectory, SETTINGS_FILE),
      `${JSON.stringify(settings, null, 2)}\n`,
      'utf-8',
    );
  }

  private _errorMessage(error: unknown): string {
    if (error instanceof Error && error.message.trim()) return error.message.trim();
    if (typeof error === 'string' && error.trim()) return error.trim();
    return 'Unknown setup error';
  }
}

const setupService = new SetupService();

export { setupService };
export type { SetupStartInput, WalletEncryptionMethod };
