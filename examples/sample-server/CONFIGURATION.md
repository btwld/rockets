# Final Rockets configuration (`sample-server`)

> **Source of truth** for how a `@bitwild/rockets` app should be wired. Copy this
> layout when starting a new project; use [`src/resources/PATTERNS.md`](./src/resources/PATTERNS.md)
> when choosing CRUD vs service vs CQRS per feature.

---

## The rule

**One Nest import at the app root:** `RocketsModule.forRoot({ ... })`.

Everything else — auth, database, CRUD, custom controllers, CQRS — is declared
inside that call via `auth`, `repository`, `userMetadata`, and `resources[]`.
There is no parallel `TypeOrmModule.forRoot({ entities: [...] })` hand-list,
no sibling `AuthModule`, and no `TypeOrmModule.forFeature` on entities Rockets
already owns.

---

## `AppModule` (canonical)

```typescript
// src/app.module.ts — see repo file for full imports
const AUTH_PROVIDER = (process.env.AUTH_PROVIDER ?? 'jwt').toLowerCase();
const auth =
  AUTH_PROVIDER === 'firebase' ? defineFirebaseSampleAuth() : defineSampleAuth();

@Module({
  imports: [
    RocketsModule.forRoot({
      auth,
      userMetadata: {
        entity: UserMetadataEntity,
        createDto: UserMetadataCreateDto,
        updateDto: UserMetadataUpdateDto,
      },
      repository: defineTypeOrmRepository({
        type: 'sqlite',
        database: ':memory:',
        synchronize: true,
        dropSchema: true,
      }),
      resources: [
        petResource,
        petVaccinationResource,
        tagResource,
        appointmentResource,
        reminderResource,
        petShareFeature,
        petTransferFeature,
        adminFeature,   // before auditFeature (exports AdminGuard)
        auditFeature,
        eventsFeature,
      ],
    }),
  ],
})
export class AppModule {}
```

| Field | Sample file | Role |
|---|---|---|
| `auth` | `src/auth/define-sample-auth.ts`, `src/auth-firebase/` | `AuthFeatureBundle` or `RocketsAuthIntegration` |
| `userMetadata` | `src/entities/user-metadata.entity.ts`, `src/dto/user-metadata.dto.ts` | Drives `GET/PATCH /me` |
| `repository` | `src/repository/define-typeorm-repository.ts` | `RepositoryBootstrap`: `forRoot(entities)` + `forFeature` |
| `resources[]` | `src/resources/*`, `src/admin/`, `src/audit/`, `src/events/` | All features |

Use `forRootAsync` when options need `ConfigService` — same fields, async factory.

---

## Application layout

```text
src/
├── app.module.ts                 ← only RocketsModule.forRoot
├── main.ts
├── repository/
│   └── define-typeorm-repository.ts
├── entities/
│   └── user-metadata.entity.ts
├── dto/
│   └── user-metadata.dto.ts
├── auth/
│   ├── define-sample-auth.ts     ← defineAuthFeature() entry
│   ├── auth.adapter.ts
│   ├── auth.controller.ts
│   └── user.entity.ts
├── auth-firebase/                ← AUTH_PROVIDER=firebase
│   └── define-firebase-sample-auth.ts
├── resources/
│   ├── pet/                      ← Pattern C (defineResource)
│   ├── pet-vaccination/
│   ├── tag/
│   ├── appointment/
│   ├── pet-share/                ← Pattern A (defineModuleResource)
│   └── pet-transfer/             ← Pattern B (defineModuleResource, entities: [])
├── admin/                        ← Pattern A
├── audit/                        ← Pattern A + hooks consumed by pet
└── events/                       ← infrastructure (defineModuleResource)
```

Adding a feature = new folder + export bundle + append one line to `resources[]`.

---

## Auth

### JWT demo (`AUTH_PROVIDER=jwt`, default)

`defineSampleAuth()` returns `defineAuthFeature({ entities, adapter, controllers })`:

- Registers `UserEntity` under dynamic key `'user'`.
- Exposes `POST /auth/signup` and `POST /auth/login`.
- `SampleAuthAdapter` implements `AuthAdapterInterface.validateToken`.

### External IdP (`AUTH_PROVIDER=firebase`)

`defineFirebaseSampleAuth()` returns a `RocketsAuthIntegration` from
`@bitwild/rockets-adapter-firebase`. No `/auth/*` routes — tokens come from the
client SDK. Same `resources[]`, same handlers.

---

## Repository bootstrap

`defineTypeOrmRepository(connection)` implements `RepositoryBootstrap`:

1. Core builds the entity list from `resources[]` + `userMetadata`.
2. Calls `forRoot({ ...connection, entities })` once.
3. Groups `forFeature` imports per adapter.

Swap TypeORM for another adapter by changing the bootstrap / root
`repository` field — domain code stays on `RepositoryInterface`.

---

## `resources[]` in this app

| Bundle | Type | Entities owned |
|---|---|---|
| `petResource` | `defineResource` | `PetEntity`, sub `PetTagEntity` |
| `petVaccinationResource` | `defineResource` | `PetVaccinationEntity` |
| `tagResource` | `defineResource` | `TagEntity` |
| `appointmentResource`, `reminderResource` | `defineResource` | appointment + reminder |
| `petShareFeature` | `defineModuleResource` | `PetShareEntity` |
| `petTransferFeature` | `defineModuleResource` | none (`entities` omitted) |
| `adminFeature` | `defineModuleResource` | none (uses `pet` repo) |
| `auditFeature` | `defineModuleResource` | `AuditLogEntity` |
| `eventsFeature` | `defineModuleResource` | none |

Auth user table is **not** in `resources[]` — it is contributed by `auth:
defineSampleAuth()` (prepended to the planner).

---

## Production checklist

1. Replace SQLite bootstrap with your driver + env-based `forRootAsync`.
2. Set `synchronize: false`; use migrations.
3. For real Firebase, replace `SampleFakeFirebaseVerifier` with production verifier.
4. Add e2e for every user-facing flow (`yarn workspace sample-server test:e2e`).
5. Every public DTO field: `@ApiProperty()` / `@ApiPropertyOptional()`.
6. Export only cross-bundle symbols from `defineModuleResource` (`exports: [...]`).

---

## Related docs

- [`README.md`](./README.md) — run, patterns menu, module map
- [`src/resources/PATTERNS.md`](./src/resources/PATTERNS.md) — C / A / B decision tree
- [`packages/rockets-server/README.md`](../../packages/rockets-server/README.md) — package API reference
- [`development-guides/CONFIGURATION_GUIDE.md`](../../development-guides/CONFIGURATION_GUIDE.md) — env, database, built-in auth variant
- [`examples/sample-server-auth/`](../sample-server-auth/) — `defineRocketsAuth()` instead of `defineAuthFeature()`
