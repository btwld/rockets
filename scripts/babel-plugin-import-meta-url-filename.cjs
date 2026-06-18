'use strict';

// Replaces `import.meta.url` with `__filename` so the CommonJS transform can
// compile the ESM-only @nestjs v12 dist for Jest. Every occurrence in those
// packages is `createRequire(import.meta.url)`, and `createRequire` accepts a
// file path as well as a file URL. We cannot use
// babel-plugin-transform-import-meta here: it injects a bare `require('url')`
// call, which collides with the local `const require = createRequire(...)`
// binding in @nestjs/swagger and triggers a TDZ ReferenceError after renaming.
module.exports = function importMetaUrlToFilename({ types: t }) {
  return {
    name: 'import-meta-url-to-filename',
    visitor: {
      MemberExpression(path) {
        const { object, property } = path.node;
        if (
          t.isMetaProperty(object) &&
          object.meta.name === 'import' &&
          object.property.name === 'meta' &&
          t.isIdentifier(property, { name: 'url' })
        ) {
          path.replaceWith(t.identifier('__filename'));
        }
      },
    },
  };
};
