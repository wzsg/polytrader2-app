import { app } from 'electron';
import { createAppPreferencesService } from '@polytrader/app-preferences';
import { createSqlitePreferenceRepository } from '@polytrader/sqlite-repository';
import { applicationEventBus } from './applicationEventBus.js';

const appPreferencesService = createAppPreferencesService({
  repository: createSqlitePreferenceRepository(),
  eventBus: applicationEventBus,
  getSystemLocale: () => app.getLocale(),
});

export { appPreferencesService };
