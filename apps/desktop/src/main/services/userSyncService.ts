import type { SupabaseClient } from '@supabase/supabase-js';
import type { UserSyncResult, UserSyncState } from '@polytrader/shared';
import { createSqliteWatchlistRepository } from '@polytrader/sqlite-repository';
import { appPreferencesService } from './appPreferencesService.js';

interface RemoteWatchlistRow {
  event_id: string;
  deleted_at: string | null;
}

class UserSyncService {
  private readonly _watchlistRepository = createSqliteWatchlistRepository();
  private _client: SupabaseClient | null = null;
  private _syncState: UserSyncState = 'idle';
  private _lastError: string | null = null;
  private _onStateChange: (() => void) | null = null;

  public setClient(client: SupabaseClient | null): void {
    this._client = client;
  }

  public setStateChangeHandler(handler: (() => void) | null): void {
    this._onStateChange = handler;
  }

  public getSyncState(): UserSyncState {
    return this._syncState;
  }

  public getLastError(): string | null {
    return this._lastError;
  }

  public syncInBackground(userId: string | null | undefined): void {
    if (!userId) return;
    void this.syncCurrentUser(userId).catch((error) => {
      console.warn('Failed to sync user data in background', error);
    });
  }

  public async syncCurrentUser(userId: string): Promise<UserSyncResult> {
    const client = this._assertClient();
    this._setSyncState('syncing', null);
    try {
      const result = await this._syncLocalStateToCloud(client, userId);
      this._setSyncState('synced', null);
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this._setSyncState('error', message);
      throw err;
    }
  }

  private async _syncLocalStateToCloud(
    client: SupabaseClient,
    userId: string,
  ): Promise<UserSyncResult> {
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

  private _setSyncState(syncState: UserSyncState, error: string | null): void {
    this._syncState = syncState;
    this._lastError = error;
    this._onStateChange?.();
  }
}

const userSyncService = new UserSyncService();

export { userSyncService };
