'use strict';

// Rewrites dynamic `import(x)` to `Promise.resolve(require(x))` so the
// CommonJS transform can compile the ESM-only @nestjs v12 dist for Jest.
// `@babel/plugin-transform-modules-commonjs` intentionally leaves `import()`
// untouched, and Jest's CJS runtime cannot load the real ESM files that
// `import('@nestjs/platform-express')` (in `loadPackage`) resolves to —
// `require()` routes the load back through the Jest transform pipeline,
// where these packages are already converted to CJS.
//
// Companion of babel-plugin-import-meta-url-filename.cjs; we cannot use
// @babel/plugin-transform-dynamic-import for the same local-`require`
// rebinding reason documented there (files like @nestjs/swagger declare
// `const require = createRequire(...)`, which is exactly the binding we
// want `require(x)` to hit).
module.exports = function dynamicImportToRequire({ types: t }) {
  return {
    name: 'dynamic-import-to-require',
    visitor: {
      CallExpression(path) {
        if (!t.isImport(path.node.callee)) {
          return;
        }
        const [source] = path.node.arguments;
        if (!source) {
          return;
        }
        path.replaceWith(
          t.callExpression(
            t.memberExpression(t.identifier('Promise'), t.identifier('resolve')),
            [t.callExpression(t.identifier('require'), [source])],
          ),
        );
      },
    },
  };
};
