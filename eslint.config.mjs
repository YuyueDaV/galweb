import js from '@eslint/js'
import ts from 'typescript-eslint'
import vue from 'eslint-plugin-vue'
import globals from 'globals'

export default [
  {
    ignores: [
      '**/node_modules/**',
      '**/.nuxt*/**',
      '**/.output*/**',
      '**/dist/**',
      '.data/**',
      '**/public/**',
      'playwright-report/**',
      'test-results/**',
    ],
  },
  js.configs.recommended,
  ...ts.configs.recommended,
  ...vue.configs['flat/essential'],
  {
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
    rules: {
      'no-unused-vars': 'off',
      'no-empty': ['error', { allowEmptyCatch: true }],
      '@typescript-eslint/no-unused-vars': ['error', { args: 'none', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',
    },
  },
  { files: ['**/*.vue'], languageOptions: { parserOptions: { parser: ts.parser } } },
  // Nuxt composables, Vue APIs and macros are auto-imported and checked by vue-tsc.
  { files: ['apps/web/**/*.ts', 'apps/web/**/*.vue'], rules: { 'no-undef': 'off' } },
  { files: ['apps/web/app/pages/**/*.vue'], rules: { 'vue/multi-word-component-names': 'off' } },
]
