import { app } from 'electron';
import fs from 'fs/promises';
import { dirname, join } from 'path';
import type { ApiResult, CacheStats, SetupState, SyncStatus } from '@polytrader/shared';
import {
  createSqliteEventRepository,
} from '@polytrader/sqlite-repository';
import { initializeAppStorage } from '../app/bootstrap.js';
import { appPreferencesService } from './appPreferencesService.js';
import { polymarketMarketService } from './polymarketMarketService.js';

const BOOTSTRAP_CONFIG_DIR = 'Polytrader2';
const BOOTSTRAP_CONFIG_FILE = 'bootstrap.json';
const DEFAULT_DATA_DIR = 'data';

interface SetupBootstrapConfig {
  dataDirectory: string;
  setupCompleted: boolean;
}

interface SetupStartInput {
  dataDirectory: string;
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
    const config = await this._readBootstrapConfig();
    if (config?.setupCompleted && config.dataDirectory.trim()) {
      const validation = await this.validateDataDirectory(config.dataDirectory);
      if (!validation.ok) {
        return {
          setupCompleted: false,
          dataDirectory: config.dataDirectory,
          defaultDataDirectory: this.getDefaultDataDirectory(),
        };
      }
      return {
        setupCompleted: true,
        dataDirectory: validation.data,
        defaultDataDirectory: this.getDefaultDataDirectory(),
      };
    }

    return {
      setupCompleted: false,
      dataDirectory: null,
      defaultDataDirectory: this.getDefaultDataDirectory(),
    };
  }

  public async getCurrentSetupState(): Promise<SetupState> {
    const state = await this.resolveStartupState();
    if (!state.setupCompleted || !state.dataDirectory) return state;

    return {
      ...state,
      cacheStats: await this._safeCacheStats(),
      syncStatus: this._lastStatus,
    };
  }

  public async validateDataDirectory(dataDirectory: string): Promise<ApiResult<string>> {
    const normalized = this._normalizeDataDirectory(dataDirectory);
    if (!normalized) return { ok: false, error: 'Data directory is required' };

    try {
      await fs.mkdir(normalized, { recursive: true });
      const probePath = join(normalized, `.polytrader2-write-test-${process.pid}`);
      await fs.writeFile(probePath, 'ok', 'utf-8');
      await fs.unlink(probePath);
      return { ok: true, data: normalized };
    } catch (error) {
      return { ok: false, error: this._errorMessage(error) };
    }
  }

  public async startInitialSetup(input: SetupStartInput): Promise<ApiResult<SetupState>> {
    if (this._running) return { ok: false, error: 'Initial setup is already running' };

    const validated = await this.validateDataDirectory(input.dataDirectory);
    if (!validated.ok) return { ok: false, error: validated.error };
    if (
      this._initializedDataDirectory &&
      this._initializedDataDirectory.toLowerCase() !== validated.data.toLowerCase()
    ) {
      return {
        ok: false,
        error: 'Restart the app to choose a different data directory after storage is initialized',
      };
    }

    this._running = true;
    this._lastStatus = { state: 'idle' };
    try {
      await initializeAppStorage(validated.data);
      this._initializedDataDirectory = validated.data;
      const preferences = await appPreferencesService.getAppPreferences();
      polymarketMarketService.setEventSyncLocale(preferences.locale);
      await polymarketMarketService.runEventSyncWorkflow(
        {
          locale: preferences.locale,
          trigger: 'startup',
        },
        new AbortController().signal,
      );

      const cacheStats = await this._eventRepository.getCacheStats();
      if (cacheStats.eventCount <= 0) {
        return { ok: false, error: 'Event data download completed without cached events' };
      }

      await this._writeBootstrapConfig({
        dataDirectory: validated.data,
        setupCompleted: true,
      });
      return {
        ok: true,
        data: {
          setupCompleted: true,
          dataDirectory: validated.data,
          defaultDataDirectory: this.getDefaultDataDirectory(),
          cacheStats,
          syncStatus: { state: 'done', total: cacheStats.eventCount },
        },
      };
    } catch (error) {
      return { ok: false, error: this._errorMessage(error) };
    } finally {
      this._running = false;
    }
  }

  public setLastSyncStatus(status: SyncStatus): void {
    this._lastStatus = status;
  }

  private async _readBootstrapConfig(): Promise<SetupBootstrapConfig | null> {
    try {
      const raw = await fs.readFile(this.getBootstrapConfigPath(), 'utf-8');
      const parsed = JSON.parse(raw) as Partial<SetupBootstrapConfig>;
      if (typeof parsed.dataDirectory !== 'string') return null;
      return {
        dataDirectory: parsed.dataDirectory,
        setupCompleted: parsed.setupCompleted === true,
      };
    } catch {
      return null;
    }
  }

  private async _writeBootstrapConfig(config: SetupBootstrapConfig): Promise<void> {
    const configPath = this.getBootstrapConfigPath();
    await fs.mkdir(dirname(configPath), { recursive: true });
    await fs.writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf-8');
  }

  private async _safeCacheStats(): Promise<CacheStats | undefined> {
    try {
      return await this._eventRepository.getCacheStats();
    } catch {
      return undefined;
    }
  }

  private _normalizeDataDirectory(dataDirectory: string): string {
    return String(dataDirectory || '').trim();
  }

  private _errorMessage(error: unknown): string {
    if (error instanceof Error && error.message.trim()) return error.message.trim();
    if (typeof error === 'string' && error.trim()) return error.trim();
    return 'Unknown setup error';
  }
}

const setupService = new SetupService();

export { setupService };
export type { SetupStartInput };
