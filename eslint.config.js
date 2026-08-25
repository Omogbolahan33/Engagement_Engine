import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/coverage/**',
      'backend/src/generated/**',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  // Backend — Node runtime
  {
    files: ['backend/**/*.ts', 'shared/**/*.ts'],
    languageOptions: {
      globals: { ...globals.node },
      parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
    },
  },

  // Frontend — browser runtime, JSX
  {
    files: ['frontend/**/*.{ts,tsx}'],
    languageOptions: {
      globals: { ...globals.browser },
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
    },
  },

  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      // This codebase leans on `any` at I/O boundaries (fetch payloads, Prisma
      // Json columns). Flagging it is noise, not signal — surface it as a hint.
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // Empty catch blocks are used deliberately for optional/best-effort work.
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },

  // Express type augmentation legitimately requires `declare global { namespace Express }`
  {
    files: ['backend/src/middleware/*.ts'],
    rules: { '@typescript-eslint/no-namespace': 'off' },
  },

  // CommonJS tooling configs
  {
    files: ['**/jest.config.js', '**/postcss.config.js', '**/tailwind.config.js'],
    languageOptions: { globals: { ...globals.node }, sourceType: 'commonjs' },
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },

  {
    files: ['**/*.test.ts', '**/*.spec.ts'],
    languageOptions: { globals: { ...globals.node, ...globals.jest } },
    rules: {
      // jest.isolateModules requires a synchronous require() to re-import a
      // module under a changed environment; there is no import equivalent.
      '@typescript-eslint/no-require-imports': 'off',
    },
  }
);
