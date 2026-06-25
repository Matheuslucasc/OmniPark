import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  // Arquivos/pastas ignorados
  { ignores: ['dist', 'node_modules', 'python'] },

  // Frontend (src) — roda no navegador
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // shadcn/ui gera componentes com exports utilitários (variants etc.);
      // não tratamos isso como erro de qualidade.
      'react-refresh/only-export-components': 'off',
      // shadcn/ui usa interfaces "vazias" (extends sem membros) de propósito.
      '@typescript-eslint/no-empty-object-type': 'off',
      // Permite args/vars iniciados com _ (placeholders deliberados).
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
    },
  },

  // Edge Functions (api) e configs — rodam no Node/edge
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['api/**/*.ts', '*.config.{js,ts}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      '@typescript-eslint/no-empty-object-type': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
    },
  },
);
