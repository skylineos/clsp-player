import { defineConfig, globalIgnores } from 'eslint/config';
import babelEslintPlugin from '@babel/eslint-plugin';
import globals from 'globals';
import babelParser from '@babel/eslint-parser';
import parser from 'esprima';
import jest from 'eslint-plugin-jest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import js from '@eslint/js';
import { FlatCompat } from '@eslint/eslintrc';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
  allConfig: js.configs.all,
});

export default defineConfig([
  globalIgnores([
    '!**/.eslintrc.js',
    'node_modules/*',
    'dist/*',
    '**/mp4-inspect.js',
    'test/wdio/*',
  ]),
  {
    extends: compat.extends('standard', 'eslint:recommended'),

    plugins: {
      '@babel': babelEslintPlugin,
    },

    languageOptions: {
      globals: {
        ...globals.browser,
      },

      parser: babelParser,
      ecmaVersion: 2020,
      sourceType: 'module',

      parserOptions: {
        ecmaFeatures: {
          impliedStrict: true,
        },

        babelOptions: {
          configFile: path.join(__dirname, 'babel.config.js'),
        },
      },
    },

    rules: {
      'max-len': [
        'error',
        {
          code: 120,
          ignoreTrailingComments: true,
          ignoreUrls: true,
          ignoreStrings: true,
          ignoreTemplateLiterals: true,
          ignoreRegExpLiterals: true,
        },
      ],

      indent: [
        'error',
        2,
        {
          SwitchCase: 1,
        },
      ],

      'multiline-ternary': [
        'error',
        'always',
      ],
      'no-trailing-spaces': 'error',

      'object-curly-newline': [
        'error',
        {
          minProperties: 3,
          consistent: true,
        },
      ],

      'object-property-newline': 'error',
      'object-curly-spacing': [
        'error',
        'always',
      ],
      'array-bracket-spacing': [
        'error',
        'always',
      ],

      'array-bracket-newline': [
        'error',
        {
          minItems: 1,
        },
      ],

      'array-element-newline': [
        'error',
        'always',
      ],
      'comma-dangle': [
        'error',
        'always-multiline',
      ],
      'comma-style': [
        'error',
        'last',
      ],
      semi: [
        'error',
        'always',
      ],
      'padded-blocks': [
        'error',
        'never',
      ],
      'brace-style': [
        'error',
        'stroustrup',
      ],
      'prefer-promise-reject-errors': 'error',

      quotes: [
        'error',
        'single',
        {
          avoidEscape: true,
        },
      ],

      'arrow-parens': [
        'error',
        'always',
      ],
      'no-cond-assign': [
        'error',
        'always',
      ],
      'no-extra-boolean-cast': 'error',
      'no-multiple-empty-lines': 'error',
      'no-multi-spaces': 'error',
      'space-before-function-paren': [
        'error',
        'always',
      ],
      'no-async-promise-executor': 'warn',
    },
  },
  {
    files: [
      'src/js/ClspClient/Router/Router.js',
      'src/js/ClspClient/Router/iframeEventHandlers.js',
    ],

    languageOptions: {
      parser,
    },
  },
  {
    files: [
      '**/__tests__/**/*.js',
    ],
    extends: compat.extends('plugin:jest/recommended', 'plugin:jest/style'),

    plugins: {
      jest,
    },

    languageOptions: {
      globals: {
        ...jest.environments.globals.globals,
      },
    },

    rules: {
      'no-new': 'off',
      'jest/no-export': 'off',
    },
  },
  {
    files: [
      '**/__tests__/**/*.test.js',
      '**/__mocks__/**/*.js',
    ],
    extends: compat.extends('plugin:jest/recommended', 'plugin:jest/style'),

    plugins: {
      jest,
    },

    languageOptions: {
      globals: {
        ...jest.environments.globals.globals,
      },
    },

    rules: {
      'no-new': 'off',
    },
  },
]);
