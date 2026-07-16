import type { SupabaseClient } from '@supabase/supabase-js';
import type { DataSyncResult, DataSyncState } from '@polytrader/shared';
import { createSqliteWatchlistRepository } from '@polytrader/sqlite-repository';
import { appPreferencesService } from './appPreferencesService.js';

interface RemoteWatchlistRow {
  event_id: string;
  deleted_at: string | null;
}

class DataSyncService {
  private readonly _watchlistRepository = createSqliteWatchlistRepository();
  private _client: SupabaseClient | null = null;
  private _dataSyncState: DataSyncState = 'idle';
  private _dataSyncError: string | null = null;
  private _onDataSyncStateChange: (() => void) | null = null;

  public setClient(client: SupabaseClient | null): void {
    this._client = client;
  }

  public setDataSyncStateChangeHandler(handler: (() => void) | null): void {
    this._onDataSyncStateChange = handler;
  }

  public getDataSyncState(): DataSyncState {
    return this._dataSyncState;
  }

  public getDataSyncError(): string | null {
    return this._dataSyncError;
  }

  public syncDataInBackground(userId: string | null | undefined): void {
    if (!userId) return;
    void this.syncDataForUser(userId).catch((error) => {
      console.warn('Failed to sync data in background', error);
    });
  }

  public async syncDataForUser(userId: string): Promise<DataSyncResult> {
    const client = this._assertClient();
    this._setDataSyncState('syncing', null);
    try {
      const result = await this._syncDataToCloud(client, userId);
      this._setDataSyncState('synced', null);
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this._setDataSyncState('error', message);
      throw err;
    }
  }

  private async _syncDataToCloud(client: SupabaseClient, userId: string): Promise<DataSyncResult> {
    await this._syncPreference(client, userId);
    const watchlistResult = await this._syncWatchlist(client, userId);
    return {
      preferenceSynced: true,
      watchlistSynced: true,
      watchlistActiveCount: watchlistResult.activeCount,
      watchlistDeletedCount: watchlistResult.deletedCount,
    };
  }

  private async _syncPreference(client: SupabaseClient, userId: string): Promise<void> {
    const preferences = await appPreferencesService.getAppPreferences();
    const { error } = await client.from('user_preferences').upsert(
      {
        user_id: userId,
        locale_preference: preferences.localePreference,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    );
    if (error) throw new Error(`Failed to sync user preferences: ${error.message}`);
  }

  private async _syncWatchlist(
    client: SupabaseClient,
    userId: string,
  ): Promise<{ activeCount: number; deletedCount: number }> {
    const localIds = new Set(await this._watchlistRepository.getWatchlistEventIds());
    const { data, error } = await client
      .from('user_watchlist')
      .select('event_id, deleted_at')
      .eq('user_id', userId);
    if (error) throw new Error(`Failed to load remote watchlist: ${error.message}`);

    const remoteRows = (data ?? []) as RemoteWatchlistRow[];
    const now = new Date().toISOString();
    const activeRows = Array.from(localIds).map((eventId) => ({
      user_id: userId,
      event_id: eventId,
      updated_at: now,
      deleted_at: null,
    }));
    const deleteRows = remoteRows
      .filter((row) => !localIds.has(row.event_id) && row.deleted_at === null)
      .map((row) => ({
        user_id: userId,
        event_id: row.event_id,
        updated_at: now,
        deleted_at: now,
      }));
    const rows = [...activeRows, ...deleteRows];

    if (rows.length) {
      const { error: upsertError } = await client
        .from('user_watchlist')
        .upsert(rows, { onConflict: 'user_id,event_id' });
      if (upsertError) throw new Error(`Failed to sync watchlist: ${upsertError.message}`);
    }

    return {
      activeCount: localIds.size,
      deletedCount: remoteRows.filter((row) => !localIds.has(row.event_id)).length,
    };
  }

  private _assertClient(): SupabaseClient {
    if (!this._client) throw new Error('Supabase is not configured');
    return this._client;
  }

  private _setDataSyncState(dataSyncState: DataSyncState, error: string | null): void {
    this._dataSyncState = dataSyncState;
    this._dataSyncError = error;
    this._onDataSyncStateChange?.();
  }
}

const dataSyncService = new DataSyncService();

export { dataSyncService };
