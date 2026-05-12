/**
 * Discriminator for the three resource shapes accepted by
 * `RocketsCoreModule`'s `resources[]`.
 *
 * Set as a `kind: ResourceKind.X` field by the corresponding `define*`
 * factories (`defineResource`, `defineModuleResource`, `defineSubResource`).
 * The `is*` type guards check this field — JSON-friendly, debuggable in
 * `console.log`, and unambiguous in mixed inputs.
 */
export enum ResourceKind {
  Crud = 'crud',
  Module = 'module',
  Sub = 'sub',
}
