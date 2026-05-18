# `sample-server`

**Canonical `@bitwild/rockets` application** — copy this project when wiring a
new external-auth API. Final configuration is documented in
[`CONFIGURATION.md`](./CONFIGURATION.md).

End-to-end NestJS with declarative resources, dynamic repositories, and **three
orchestration styles** side by side (CRUD, service + controller, CQRS).

> Read this as a *menu* of patterns, not a mandatory template. Different
> resources intentionally use different styles so you can compare them.

## Run it

```bash
# from repo root
yarn workspace sample-server install
yarn workspace sample-server start:dev
```

- HTTP: `http://localhost:3000`
- Swagger: `http://localhost:3000/api`

```bash
yarn workspace sample-server build
yarn workspace sample-server test:e2e
```

E2E: `test/sample-server.e2e-spec.ts` (primary behaviour spec). Firebase mode:
`test/sample-server-firebase.e2e-spec.ts`. QA plan: [`QA_TEST_CASES.md`](./QA_TEST_CASES.md).

## How this app is wired

`AppModule` has **one** import: `RocketsModule.forRoot({ ... })`. No separate
`AuthModule`, no hand-listed `TypeOrmModule.forRoot({ entities })`.

| Piece | Where |
|---|---|
| Composition root | [`src/app.module.ts`](./src/app.module.ts) |
| Auth (JWT) | [`src/auth/define-sample-auth.ts`](./src/auth/define-sample-auth.ts) |
| Auth (Firebase) | [`src/auth-firebase/define-firebase-sample-auth.ts`](./src/auth-firebase/define-firebase-sample-auth.ts) |
| DB bootstrap | [`src/repository/define-typeorm-repository.ts`](./src/repository/define-typeorm-repository.ts) |
| Features | `resources[]` in `app.module.ts` — see [CONFIGURATION.md](./CONFIGURATION.md) |

Full field-by-field reference: **[`CONFIGURATION.md`](./CONFIGURATION.md)**.

### Swapping auth (`AUTH_PROVIDER`)

| Value | Adapter | Routes |
|---|---|---|
| `jwt` (default) | `defineSampleAuth()` | `POST /auth/signup`, `POST /auth/login` |
| `firebase` | `defineFirebaseSampleAuth()` | None — client SDK issues tokens |

```bash
yarn workspace sample-server start:dev
AUTH_PROVIDER=firebase yarn workspace sample-server start:dev
curl http://localhost:3000/me -H 'Authorization: Bearer fb-user-token'
```

Fake Firebase tokens: [`src/auth-firebase/sample-fake-firebase-verifier.ts`](./src/auth-firebase/sample-fake-firebase-verifier.ts).

## The three patterns

Deep dive: [`src/resources/PATTERNS.md`](./src/resources/PATTERNS.md).

| | **C — `defineResource`** | **A — Service + controller** | **B — CQRS** |
|---|---|---|---|
| **Used by** | `pet/`, `pet-vaccination/`, `tag/`, `appointment/` | `pet-share/`, `admin/`, `audit/` | `pet-transfer/` |
| **Routes** | Auto-generated | Hand-written `@Controller` | Controller → `commandBus` |
| **Best for** | Standard CRUD | Small custom HTTP | Business verbs + events |

```
Standard CRUD on one entity?  → Pattern C
Business verb with invariants? → Pattern B
Otherwise                      → Pattern A
```

## Module / resource map

| Area | Location | Pattern |
|---|---|---|
| Auth | `src/auth/` | `defineAuthFeature()` via `defineSampleAuth()` |
| Pet | `src/resources/pet/` | C — hooks, sub-resources, soft-delete |
| Pet vaccination | `src/resources/pet-vaccination/` | C |
| Tag | `src/resources/tag/` | C |
| Appointment + reminder | `src/resources/appointment/` | C ×2 |
| Pet share | `src/resources/pet-share/` | A — `pet-share.feature.ts` |
| Pet transfer | `src/resources/pet-transfer/` | B — `pet-transfer.feature.ts`, no entities |
| Admin | `src/admin/` | A — exports `AdminGuard` |
| Audit | `src/audit/` | A — hook factories on pet resource |
| Events | `src/events/` | infrastructure |

## Layout (current)

```text
resources/pet/
  pet.entity.ts
  pet.dto.ts
  pet.resource.ts              ← defineResource()
  pet-create.handler.ts
  pet-unique-ref.hook.ts
  pet-tag.entity.ts
  index.ts

resources/pet-share/
  pet-share.feature.ts         ← defineModuleResource()
  pet-share.controller.ts
  pet-share.service.ts
  pet-owner-or-shared.hook.ts
  index.ts

resources/pet-transfer/
  pet-transfer.feature.ts      ← defineModuleResource(), CQRS only
  pet-transfer.controller.ts
  commands/...
  index.ts
```

## Documentation

- **Final configuration:** [`CONFIGURATION.md`](./CONFIGURATION.md)
- **Pattern deep-dive:** [`src/resources/PATTERNS.md`](./src/resources/PATTERNS.md)
- **`@bitwild/rockets` package README:** [`packages/rockets-server/README.md`](../../packages/rockets-server/README.md)
- **Built-in auth variant:** [`examples/sample-server-auth/`](../sample-server-auth/)
- **Repo conventions:** [`AGENTS.md`](../../AGENTS.md)

## License

MIT — demo app; harden before production.
