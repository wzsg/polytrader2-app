import { createApp } from 'vue';
import BrowserModalApp from './browser-window/BrowserModalApp.vue';
import { enableAutoTranslate, initializeI18n, installI18n } from './shared/i18n';
import './style.css';

async function bootstrap(): Promise<void> {
  await initializeI18n();
  const app = createApp(BrowserModalApp);
  installI18n(app);
  app.mount('#app');
  enableAutoTranslate();
}

void bootstrap();
