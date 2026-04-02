---
globs: "**/*.ts"
description: TypeScript strict rules enforced across the entire codebase
---

# TypeScript Strict Rules

- **NEVER use `any`**. No `: any`, no `as any`, no `<any>`, no `any[]`.
  - Use proper types, interfaces, or generics.
  - If a type is unknown, use `unknown` and narrow it.
  - If a type is complex, define an interface.
- **NEVER use `[unknown type]`** placeholders. Every type must resolve to a concrete interface or generic.
- Prefer `interface` over `type` for object shapes.
- Use `readonly` for injected dependencies and immutable data.
- **No type workarounds**: Never use `as Type` or similar casts as workarounds — fix types properly.
