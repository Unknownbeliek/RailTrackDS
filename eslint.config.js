import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      '**/.jscpd/**',
      '**/migrations/**',
      'apps/web/public/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'always'],
      'prefer-const': 'error',
    },
  },
  {
    files: ['tools/**/*.{mjs,ts}', '**/*.config.{js,ts}', 'scripts/**', '**/*.test.ts', 'apps/api/src/jobs/**'],
    languageOptions: { globals: { ...globals.node } },
    rules: { 'no-console': 'off' },
  },
  {
    // The dependency-cruiser config is CommonJS by design.
    files: ['**/*.cjs'],
    languageOptions: { globals: { ...globals.node }, sourceType: 'commonjs' },
    rules: { 'no-undef': 'off' },
  },
);
