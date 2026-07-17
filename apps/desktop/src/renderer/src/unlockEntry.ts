import { createApp } from 'vue';
import UnlockApp from './unlock-window/UnlockApp.vue';
import { enableAutoTranslate, initializeI18n, installI18n } from './shared/i18n';
import './style.css';

async function bootstrap(): Promise<void> {
  await initializeI18n();
  const app = createApp(UnlockApp);
  installI18n(app);
  app.mount('#app');
  enableAutoTranslate();
}

void bootstrap();
