import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'data/**', 'src/db/migrations/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // Every model call must go through src/llm/ (CLAUDE.md).
      'no-restricted-imports': [
        'error',
        { patterns: [{ group: ['@anthropic-ai/sdk', '@anthropic-ai/sdk/*'], message: 'Call models through src/llm/ only.' }] },
      ],
    },
  },
  {
    files: ['src/llm/**'],
    rules: { 'no-restricted-imports': 'off' },
  },
);
