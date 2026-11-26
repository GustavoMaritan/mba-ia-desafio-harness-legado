import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'

// G2 (lint) e G5 (env so na pasta de config). As mensagens de G5 trazem "G5:"
// para o scripts/gates.mjs separar das de G2.
const envNaApi = [
  {
    selector: "MemberExpression[object.name='process'][property.name='env']",
    message: 'G5: process.env só em api/src/config/',
  },
  {
    selector: "MemberExpression[object.name='process'][computed=true][property.value='env']",
    message: 'G5: process.env só em api/src/config/',
  },
  {
    selector: "MemberExpression[property.name='env'][object.property.name='process']",
    message: 'G5: process.env só em api/src/config/',
  },
  {
    selector: "VariableDeclarator[init.name='process'] > ObjectPattern > Property[key.name='env']",
    message: 'G5: process.env só em api/src/config/',
  },
]

const envNoFront = [
  {
    selector: "MemberExpression[object.type='MetaProperty'][property.name='env']",
    message: 'G5: import.meta.env só em web/src/config/',
  },
  {
    selector: "MemberExpression[object.type='MetaProperty'][computed=true][property.value='env']",
    message: 'G5: import.meta.env só em web/src/config/',
  },
  {
    selector: "VariableDeclarator[init.type='MetaProperty'] > ObjectPattern > Property[key.name='env']",
    message: 'G5: import.meta.env só em web/src/config/',
  },
]

export default tseslint.config(
  { ignores: ['**/node_modules/**', '**/dist/**'] },
  {
    linterOptions: { noInlineConfig: true, reportUnusedDisableDirectives: 'error' },
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'all' }],
      '@typescript-eslint/ban-ts-comment': 'error',
    },
  },
  {
    files: ['api/**/*.{ts,mts}'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['web/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ['api/src/**/*.ts'],
    ignores: ['api/src/config/**'],
    rules: {
      'no-restricted-syntax': ['error', ...envNaApi],
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: 'process', message: 'G5: process.env só em api/src/config/' },
            { name: 'node:process', message: 'G5: process.env só em api/src/config/' },
          ],
        },
      ],
    },
  },
  {
    files: ['web/src/**/*.{ts,tsx}'],
    ignores: ['web/src/config/**'],
    rules: {
      'no-restricted-syntax': ['error', ...envNoFront],
    },
  },
)
