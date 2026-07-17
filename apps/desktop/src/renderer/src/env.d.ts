/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<object, object, unknown>;
  export default component;
}

import type { IpcApi } from '@polytrader/shared';

interface TurnstileRenderOptions {
  sitekey: string;
  action?: string;
  callback?: (token: string) => void;
  'expired-callback'?: () => void;
  'error-callback'?: () => void;
}

interface TurnstileApi {
  render: (container: HTMLElement, options: TurnstileRenderOptions) => string;
  reset: (widgetId: string) => void;
  remove?: (widgetId: string) => void;
}

declare global {
  const __ACCOUNT_DATA_SYNC_ENABLED__: boolean;
  const __APP_VERSION__: string;
  const __STRATEGY_AUTOMATION_ENABLED__: boolean;
  const __TURNSTILE_ENABLED__: boolean;

  interface ImportMetaEnv {
    readonly VITE_TURNSTILE_SITE_KEY?: string;
  }

  interface Window {
    api: IpcApi;
    turnstile?: TurnstileApi;
  }
}

export {};
