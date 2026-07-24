import { cpSync, existsSync, readFileSync, rmSync } from 'fs';
import { defineConfig } from 'electron-vite';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';
import { loadEnv, type Plugin } from 'vite';
import { resolve } from 'path';

const packageJson = JSON.parse(readFileSync(resolve('package.json'), 'utf-8')) as {
  version: string;
};

const viteEnv = loadEnv(
  process.env.NODE_ENV === 'production' ? 'production' : 'development',
  process.cwd(),
  '',
);
const strategyAutomationFlag =
  process.env.P2_ENABLE_STRATEGY_AUTOMATION ?? viteEnv.P2_ENABLE_STRATEGY_AUTOMATION;
const strategyAutomationEnabled =
  strategyAutomationFlag === '1' ||
  (strategyAutomationFlag !== '0' && process.env.npm_lifecycle_event === 'dev');
const accountDataSyncFlag =
  process.env.P2_ENABLE_ACCOUNT_DATA_SYNC ?? viteEnv.P2_ENABLE_ACCOUNT_DATA_SYNC;
const accountDataSyncEnabled =
  accountDataSyncFlag === '1' ||
  (accountDataSyncFlag !== '0' && process.env.npm_lifecycle_event === 'dev');
const turnstileEnabled =
  process.env.P2_ENABLE_TURNSTILE === '1' || viteEnv.P2_ENABLE_TURNSTILE === '1';

const featureDefines = {
  __ACCOUNT_DATA_SYNC_ENABLED__: JSON.stringify(accountDataSyncEnabled),
  __STRATEGY_AUTOMATION_ENABLED__: JSON.stringify(strategyAutomationEnabled),
  __TURNSTILE_ENABLED__: JSON.stringify(turnstileEnabled),
};

const workspacePackageAliases = [
  {
    find: '@polytrader/strategy-ast/ast',
    replacement: resolve('../../packages/strategy-ast/src/ast.ts'),
  },
  {
    find: '@polytrader/sqlite-repository/schema',
    replacement: resolve('../../packages/repositories/sqlite-repository/src/schema/index.ts'),
  },
  {
    find: '@polytrader/polymarket-wallet',
    replacement: resolve('../../packages/polymarket-wallet/src/index.ts'),
  },
  {
    find: '@polytrader/remote-access',
    replacement: resolve('../../packages/remote-access/src/index.ts'),
  },
  {
    find: '@polytrader/orderfilled-activity',
    replacement: resolve('../../packages/orderfilled-activity/src/index.ts'),
  },
  {
    find: '@polytrader/bot-runtime-contract',
    replacement: resolve('../../packages/contracts/bot-runtime-contract/src/index.ts'),
  },
  {
    find: '@polytrader/app-preferences',
    replacement: resolve('../../packages/app-preferences/src/index.ts'),
  },
  {
    find: '@polytrader/duckdb-repository',
    replacement: resolve('../../packages/repositories/duckdb-repository/src/index.ts'),
  },
  {
    find: '@polytrader/event-bus',
    replacement: resolve('../../packages/event-bus/src/index.ts'),
  },
  {
    find: '@polytrader/cache-store',
    replacement: resolve('../../packages/cache-store/src/index.ts'),
  },
  {
    find: '@polytrader/system-performance',
    replacement: resolve('../../packages/system-performance/src/index.ts'),
  },
  {
    find: '@polytrader/polymarket-market',
    replacement: resolve('../../packages/polymarket-market/src/index.ts'),
  },
  {
    find: '@polytrader/polymarket-api',
    replacement: resolve('../../packages/polymarket-api/src/index.ts'),
  },
  {
    find: '@polytrader/repository-contract',
    replacement: resolve('../../packages/contracts/repository-contract/src/index.ts'),
  },
  {
    find: '@polytrader/shared',
    replacement: resolve('../../packages/shared/src/index.ts'),
  },
  {
    find: '@polytrader/sqlite-repository',
    replacement: resolve('../../packages/repositories/sqlite-repository/src/index.ts'),
  },
  {
    find: '@polytrader/strategy-ast',
    replacement: resolve('../../packages/strategy-ast/src/index.ts'),
  },
  {
    find: '@polytrader/strategy-runtime',
    replacement: resolve('../../packages/strategy-runtime/src/index.ts'),
  },
  {
    find: '@polytrader/trading-account',
    replacement: resolve('../../packages/trading-account/src/index.ts'),
  },
  {
    find: '@polytrader/trading-market',
    replacement: resolve('../../packages/trading-market/src/index.ts'),
  },
  {
    find: '@polytrader/trading-strategy',
    replacement: resolve('../../packages/trading-strategy/src/index.ts'),
  },
  {
    find: '@polytrader/workflow',
    replacement: resolve('../../packages/workflow/src/index.ts'),
  },
];

function copyDrizzleMigrations(): Plugin {
  return {
    name: 'copy-drizzle-migrations',
    writeBundle() {
      const src = resolve('drizzle');
      const dest = resolve('out/main/drizzle');
      if (existsSync(dest)) rmSync(dest, { recursive: true });
      cpSync(src, dest, { recursive: true });
    },
  };
}

function copyStrategyWorker(): Plugin {
  return {
    name: 'copy-strategy-worker',
    writeBundle() {
      const files = [
        ['strategyWorker.js', 'strategyWorker.mjs'],
        ['workerProtocol.js', 'workerProtocol.js'],
      ];
      for (const [sourceName, destName] of files) {
        const src = resolve('../bot-vm/dist', sourceName);
        const dest = resolve('out/main', destName);
        if (!existsSync(src)) {
          throw new Error(`Strategy worker build output not found: ${src}`);
        }
        cpSync(src, dest);
      }
    },
  };
}

export default defineConfig({
  main: {
    define: featureDefines,
    resolve: {
      alias: workspacePackageAliases,
    },
    build: {
      commonjsOptions: {
        esmExternals: ['viem', 'viem/accounts', 'viem/chains'],
      },
      externalizeDeps: {
        exclude: [
          '@polytrader/shared',
          '@polytrader/app-preferences',
          '@polytrader/bot-runtime-contract',
          '@polytrader/repository-contract',
          '@polytrader/cache-store',
          '@polytrader/system-performance',
          '@polytrader/sqlite-repository',
          '@polytrader/duckdb-repository',
          '@polytrader/event-bus',
          '@polytrader/polymarket-api',
          '@polytrader/polymarket-market',
          '@polytrader/polymarket-wallet',
          '@polytrader/remote-access',
          '@polytrader/orderfilled-activity',
          '@polytrader/strategy-ast',
          '@polytrader/strategy-runtime',
          '@polytrader/trading-account',
          '@polytrader/trading-market',
          '@polytrader/trading-strategy',
          '@polytrader/workflow',
        ],
      },
      rollupOptions: {
        input: {
          index: resolve('src/main/index.ts'),
          sqliteWorker: resolve(
            '../../packages/repositories/sqlite-repository/src/sqliteWorker.ts',
          ),
        },
        output: {
          entryFileNames: '[name].js',
          chunkFileNames: 'chunks/[name]-[hash].mjs',
        },
        plugins: [copyDrizzleMigrations(), copyStrategyWorker()],
      },
    },
  },
  preload: {
    resolve: {
      alias: workspacePackageAliases,
    },
    build: {
      externalizeDeps: {
        exclude: ['@polytrader/shared'],
      },
      rollupOptions: {
        input: {
          main: resolve('src/preload/main.ts'),
          trading: resolve('src/preload/trading.ts'),
          browserShell: resolve('src/preload/browserShell.ts'),
          browserModal: resolve('src/preload/browserModal.ts'),
          browserProvider: resolve('src/preload/browserProvider.ts'),
          strategyEditor: resolve('src/preload/strategyEditor.ts'),
          publicTrader: resolve('src/preload/publicTrader.ts'),
          setup: resolve('src/preload/setup.ts'),
          unlock: resolve('src/preload/unlock.ts'),
        },
        output: {
          entryFileNames: '[name].cjs',
          chunkFileNames: 'chunks/[name]-[hash].cjs',
          format: 'cjs',
        },
      },
    },
  },
  renderer: {
    define: {
      __APP_VERSION__: JSON.stringify(packageJson.version),
      ...featureDefines,
    },
    resolve: {
      alias: [...workspacePackageAliases, { find: '@', replacement: resolve('src/renderer/src') }],
    },
    plugins: [vue(), tailwindcss()],
    build: {
      rollupOptions: {
        input: {
          index: resolve('src/renderer/index.html'),
          browser: resolve('src/renderer/browser.html'),
          browserModal: resolve('src/renderer/browser-modal.html'),
          strategyEditor: resolve('src/renderer/strategy-editor.html'),
          publicTrader: resolve('src/renderer/public-trader.html'),
          setup: resolve('src/renderer/setup.html'),
          unlock: resolve('src/renderer/unlock.html'),
          trading: resolve('src/renderer/trading.html'),
        },
      },
    },
  },
});
