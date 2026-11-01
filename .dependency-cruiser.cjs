/** Dependency boundary rules — PRD v2 section 8.1.
 * A violation fails CI, so the web app can never reach the provider or the database.
 */
module.exports = {
  forbidden: [
    {
      name: 'web-no-db-or-provider',
      severity: 'error',
      comment:
        'apps/web may import shared, domain and ui-tokens only (section 8.1). It talks to our API over HTTP.',
      from: { path: '^apps/web' },
      to: { path: '^(apps/api|packages/db|packages/provider-railradar)' },
    },
    {
      name: 'api-no-web',
      severity: 'error',
      comment: 'The API never imports the web app.',
      from: { path: '^apps/api' },
      to: { path: '^apps/web' },
    },
    {
      name: 'domain-pure',
      severity: 'error',
      comment: 'packages/domain is pure: no I/O, no db, no provider, no apps (section 9.1).',
      from: { path: '^packages/domain' },
      to: {
        path: '^(packages/(db|provider-railradar|ui-tokens)|apps)',
      },
    },
    {
      name: 'shared-has-no-internal-deps',
      severity: 'error',
      comment: 'packages/shared imports nothing internal.',
      from: { path: '^packages/shared' },
      to: { path: '^(packages/(?!shared)|apps)' },
    },
    {
      name: 'ui-tokens-has-no-internal-deps',
      severity: 'error',
      comment: 'packages/ui-tokens imports nothing internal.',
      from: { path: '^packages/ui-tokens' },
      to: { path: '^(packages/(?!ui-tokens)|apps)' },
    },
    {
      name: 'provider-does-not-import-db',
      severity: 'error',
      comment: 'provider-railradar knows nothing about our database.',
      from: { path: '^packages/provider-railradar' },
      to: { path: '^packages/db' },
    },
    {
      name: 'db-does-not-import-provider',
      severity: 'error',
      comment: 'packages/db stores provider payloads it is given; it does not call them.',
      from: { path: '^packages/db' },
      to: { path: '^packages/provider-railradar' },
    },
    {
      name: 'no-circular',
      severity: 'error',
      comment: 'Circular imports make the packages untestable alone.',
      from: {},
      to: { circular: true },
    },
    {
      name: 'not-to-dev-dep',
      severity: 'error',
      comment: 'Production code must not import a devDependency.',
      from: { pathNot: '(\\.test\\.tsx?$|^tools/|^apps/web/vite\\.config\\.ts$)' },
      to: { dependencyTypes: ['npm-dev'] },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '(\\.test\\.tsx?$|node_modules|\\.jscpd)' },
    tsConfig: { fileName: 'tsconfig.base.json' },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default'],
      extensions: ['.ts', '.tsx', '.js', '.mjs', '.json'],
    },
    reporterOptions: { text: { highlightFocused: true } },
  },
};
