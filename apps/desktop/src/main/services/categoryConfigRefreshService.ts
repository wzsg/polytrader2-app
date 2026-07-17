const CATEGORY_CONFIG_REFRESH_INTERVAL_MS = 10 * 60 * 1000;

interface CategoryConfigRefreshServiceOptions {
  refresh: () => Promise<void>;
  onRefreshed: () => void;
}

class CategoryConfigRefreshService {
  private readonly _refresh: () => Promise<void>;
  private readonly _onRefreshed: () => void;
  private _interval: ReturnType<typeof setInterval> | null = null;
  private _refreshing: Promise<void> | null = null;

  public constructor(options: CategoryConfigRefreshServiceOptions) {
    this._refresh = options.refresh;
    this._onRefreshed = options.onRefreshed;
  }

  public start(): void {
    if (this._interval) return;
    void this.refresh();
    this._interval = setInterval(() => {
      void this.refresh();
    }, CATEGORY_CONFIG_REFRESH_INTERVAL_MS);
  }

  public stop(): void {
    if (!this._interval) return;
    clearInterval(this._interval);
    this._interval = null;
  }

  public async refresh(): Promise<void> {
    if (this._refreshing) return await this._refreshing;

    this._refreshing = this._refreshCategories();
    try {
      await this._refreshing;
    } finally {
      this._refreshing = null;
    }
  }

  private async _refreshCategories(): Promise<void> {
    try {
      await this._refresh();
      this._onRefreshed();
    } catch (error) {
      console.warn('Failed to refresh category configs', error);
    }
  }
}

export { CategoryConfigRefreshService };
