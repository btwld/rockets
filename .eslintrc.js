module.exports = {
  parser: '@typescript-eslint/parser',
  parserOptions: {
    sourceType: 'module',
    tsconfigRootDir: __dirname,
    project: ['./tsconfig.eslint.json'],
  },
  plugins: [
    'import',
    'tsdoc',
  ],
  extends: [
    '@concepta/eslint-config/nest',
    'plugin:jsdoc/recommended-typescript',
  ],
  ignorePatterns: [
    'packages/*/dist/**',
    '**/node_modules/**',
    '**/.eslintrc.js',
    '**/.eslintrc.spec.js',
    '**/tsconfig.json',
    '**/tsconfig.eslint.json',
    '**/commitlint.config.js',
  ],
  settings: {
    jsdoc: {
      mode: 'typescript',
    },
  },
  rules: {
    'import/no-extraneous-dependencies': 'error',
    '@darraghor/nestjs-typed/param-decorator-name-matches-route-param': 'off',
    'jsdoc/tag-lines': ['error', 'any', { startLines: 1 }],
    'tsdoc/syntax': 'error',
    '@typescript-eslint/no-unused-vars': [
      'error',
      {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
        destructuredArrayIgnorePattern: '^_',
        ignoreRestSiblings: true,
      },
    ],
  },
  overrides: [
    {
      files: ['*.json'],
      parser: 'jsonc-eslint-parser',
      parserOptions: {
        jsonSyntax: 'JSON',
      },
    },
    {
      files: ['*.ts'],
      rules: {
        'jsdoc/require-jsdoc': 'off',
        'jsdoc/require-param': 'off',
        'jsdoc/require-returns': 'off',
      },
    },
    {
      files: ['*.spec.ts', '*.fixture.ts'],
      rules: {
        '@darraghor/nestjs-typed/controllers-should-supply-api-tags': 'off',
        '@darraghor/nestjs-typed/api-method-should-specify-api-response': 'off',
        'plugin:jsdoc/recommended-typescript': 'off',
        'jsdoc/tag-lines': 'off',
        'tsdoc/syntax': 'off',
      },
    },
    {
      files: [
        '**/patch-concepta-common.ts',
        'packages/rockets-server-auth/src/__fixtures__/stubs/nestjs-federated-stub.ts',
        'packages/rockets-server-auth/src/__fixtures__/stubs/nestjs-invitation-stub.ts',
      ],
      rules: {
        'tsdoc/syntax': 'off',
      },
    },
    {
      files: [
        'packages/rockets-core/src/infrastructure/resource/aggregate-resources.ts',
        'packages/rockets-server/src/infrastructure/resource/aggregate-resources.ts',
      ],
      rules: {
        // `args.resources` trips tsdoc/syntax (no dotted @param names); prose stays on @param args.
        'jsdoc/check-param-names': 'off',
      },
    },
    {
      files: ['examples/sample-server-auth/**/*.ts'],
      rules: {
        '@darraghor/nestjs-typed/api-property-matches-property-optionality': 'off',
        '@darraghor/nestjs-typed/api-property-returning-array-should-set-array': 'off',
        '@darraghor/nestjs-typed/api-enum-property-best-practices': 'off',
        '@darraghor/nestjs-typed/all-properties-are-whitelisted': 'off',
        '@darraghor/nestjs-typed/all-properties-have-explicit-defined': 'off',
        '@darraghor/nestjs-typed/should-specify-forbid-unknown-values': 'off',
      },
    },
  ],
};
