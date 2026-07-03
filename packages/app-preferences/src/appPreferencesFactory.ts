import { AppPreferencesServiceImpl } from './appPreferencesService.js';
import type { AppPreferencesService, AppPreferencesServiceOptions } from './types.js';

class AppPreferencesFactory {
  private static _preferencesService: AppPreferencesService | null = null;

  public static createAppPreferencesService(
    options: AppPreferencesServiceOptions,
  ): AppPreferencesService {
    if (!this._preferencesService) {
      this._preferencesService = new AppPreferencesServiceImpl(options);
    }
    return this._preferencesService;
  }
}

function createAppPreferencesService(options: AppPreferencesServiceOptions): AppPreferencesService {
  return AppPreferencesFactory.createAppPreferencesService(options);
}

export { AppPreferencesFactory, createAppPreferencesService };
