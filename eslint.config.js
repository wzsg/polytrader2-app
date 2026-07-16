import js from '@eslint/js';
import eslintConfigPrettier from 'eslint-config-prettier';
import pluginVue from 'eslint-plugin-vue';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import vueParser from 'vue-eslint-parser';

export default tseslint.config(
  {
    ignores: [
      '**/out/**',
      '**/dist/**',
      '**/node_modules/**',
      '**/cache/**',
      '**/scripts/**/*.mjs',
      '**/*.db',
      'package-lock.json',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...pluginVue.configs['flat/recommended'],
  eslintConfigPrettier,
  {
    files: ['**/*.{js,mjs,cjs,ts,vue}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'vue/multi-word-component-names': 'off',
      'vue/no-mutating-props': 'off',
      'vue/block-order': ['error', { order: ['script', 'template', 'style'] }],
    },
  },
  {
    files: ['**/*.{ts,vue}'],
    languageOptions: {
      parserOptions: {
        projectService: {
          maximumDefaultProjectFileMatchCount_THIS_WILL_SLOW_DOWN_LINTING: 20,
          allowDefaultProject: [
            'apps/bot-vm/tsup.config.ts',
            'packages/contracts/bot-runtime-contract/tsup.config.ts',
            'packages/contracts/repository-contract/tsup.config.ts',
            'packages/event-bus/tsup.config.ts',
            'packages/app-preferences/tsup.config.ts',
            'packages/mcp-server/tsup.config.ts',
            'packages/polymarket-account/tsup.config.ts',
            'packages/cache-store/tsup.config.ts',
            'packages/polymarket-market/tsup.config.ts',
            'packages/polymarket-api/tsup.config.ts',
            'packages/polymarket-wallet/tsup.config.ts',
            'packages/trading-account/tsup.config.ts',
            'packages/trading-strategy/tsup.config.ts',
            'packages/strategy-runtime/tsup.config.ts',
            'packages/trading-market/tsup.config.ts',
            'packages/repositories/duckdb-repository/tsup.config.ts',
            'packages/repositories/sqlite-repository/tsup.config.ts',
            'packages/shared/tsup.config.ts',
          ],
        },
        tsconfigRootDir: import.meta.dirname,
        extraFileExtensions: ['.vue'],
      },
    },
  },
  {
    files: ['**/*.vue'],
    languageOptions: {
      parser: vueParser,
      parserOptions: {
        parser: tseslint.parser,
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
        extraFileExtensions: ['.vue'],
      },
    },
  },
  {
    files: [
      'apps/desktop/src/main/**/*.{ts,js}',
      'apps/desktop/src/preload/**/*.{ts,js}',
      'apps/desktop/scripts/**/*.{js,mjs,cjs}',
      'apps/desktop/electron.vite.config.ts',
      'apps/bot-vm/tsup.config.ts',
      'apps/bot-vm/src/**/*.{ts,js}',
      'packages/contracts/bot-runtime-contract/tsup.config.ts',
      'packages/contracts/bot-runtime-contract/src/**/*.{ts,js}',
      'packages/contracts/repository-contract/tsup.config.ts',
      'packages/contracts/repository-contract/src/**/*.{ts,js}',
      'packages/event-bus/tsup.config.ts',
      'packages/event-bus/src/**/*.{ts,js}',
      'packages/app-preferences/tsup.config.ts',
      'packages/app-preferences/src/**/*.{ts,js}',
      'packages/mcp-server/tsup.config.ts',
      'packages/mcp-server/src/**/*.{ts,js}',
      'packages/polymarket-account/tsup.config.ts',
      'packages/polymarket-account/src/**/*.{ts,js}',
      'packages/cache-store/tsup.config.ts',
      'packages/cache-store/src/**/*.{ts,js}',
      'packages/polymarket-market/tsup.config.ts',
      'packages/polymarket-market/src/**/*.{ts,js}',
      'packages/polymarket-api/tsup.config.ts',
      'packages/polymarket-api/src/**/*.{ts,js}',
      'packages/polymarket-wallet/tsup.config.ts',
      'packages/polymarket-wallet/src/**/*.{ts,js}',
      'packages/trading-account/tsup.config.ts',
      'packages/trading-account/src/**/*.{ts,js}',
      'packages/trading-strategy/tsup.config.ts',
      'packages/trading-strategy/src/**/*.{ts,js}',
      'packages/strategy-runtime/tsup.config.ts',
      'packages/strategy-runtime/src/**/*.{ts,js}',
      'packages/trading-market/tsup.config.ts',
      'packages/trading-market/src/**/*.{ts,js}',
      'packages/repositories/duckdb-repository/tsup.config.ts',
      'packages/repositories/duckdb-repository/src/**/*.{ts,js}',
      'packages/repositories/sqlite-repository/tsup.config.ts',
      'packages/repositories/sqlite-repository/src/**/*.{ts,js}',
      'packages/shared/tsup.config.ts',
    ],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    files: ['apps/desktop/src/renderer/**/*.{ts,vue,js}', 'packages/shared/src/**/*.{ts,js}'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.es2021,
        __ACCOUNT_DATA_SYNC_ENABLED__: 'readonly',
        __APP_VERSION__: 'readonly',
        __STRATEGY_AUTOMATION_ENABLED__: 'readonly',
        __TURNSTILE_ENABLED__: 'readonly',
      },
    },
  },
);
