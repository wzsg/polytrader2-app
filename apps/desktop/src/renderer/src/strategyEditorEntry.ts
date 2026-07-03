import { createApp } from 'vue';
import StrategyEditorApp from './strategy-editor-window/StrategyEditorApp.vue';
import { enableAutoTranslate, initializeI18n, installI18n } from './shared/i18n';
import './style.css';

async function bootstrap(): Promise<void> {
  await initializeI18n();
  const app = createApp(StrategyEditorApp);
  installI18n(app);
  app.mount('#app');
  enableAutoTranslate();
}

void bootstrap();
