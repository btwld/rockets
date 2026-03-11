# Why Rockets

A developer experience story — what Rockets gives you today, and where the SDK is headed.

---

## The Pitch

**Auth in one import. CRUD in three files. Ownership in one decorator.**

Rockets is a NestJS SDK that eliminates the two most painful parts of building a backend: authentication infrastructure and CRUD boilerplate. It does this by composing 22+ battle-tested NestJS modules into two packages that work together seamlessly — while keeping every piece replaceable.

---

## Part 1: Auth — Already Solved

### One import, 27 endpoints

Add `RocketsAuthModule` to a NestJS app. Immediately get:

| Category | Endpoints | What you'd otherwise build by hand |
|----------|-----------|-------------------------------------|
| **Login** | `POST /token/password`, `POST /token/refresh` | JWT issuance, refresh rotation, token verification |
| **Recovery** | `POST /recovery/login`, `GET /recovery/passcode/:code`, `POST /recovery/password`, `PATCH /recovery/password` | Email flow, passcode generation, expiration, password reset |
| **OTP** | `POST /otp`, `PATCH /otp` | One-time password generation, delivery, validation |
| **OAuth** | `GET /oauth/authorize`, `GET+POST /oauth/callback` | Google, GitHub, Apple — strategy routing, token exchange, federated identity |
| **Signup** | `POST /signup` | Registration, validation, auto role assignment |
| **Self-Service** | `GET /me`, `PATCH /me`, `PATCH /me/password` | Profile retrieval, metadata updates, password changes |
| **Admin Users** | `GET /admin/users`, `GET /admin/users/:id`, `PATCH /admin/users/:id` | User listing, search, management |
| **Admin Roles** | Full CRUD on `/admin/roles` + `GET+POST /admin/users/:userId/roles` | Role creation, assignment, revocation |
| **Invitations** | `POST /admin/invitations`, revoke, reattempt, `PATCH /invitation-acceptance/:code` | Email invites, OTP verification, account creation, role assignment, confirmation |

**Zero controllers written.** The developer provides one config object and a mailer service. Rockets handles the rest.

### What's wired under the hood

```
RocketsAuthModule.forRootAsync(config)
├── AuthenticationModule     — core auth pipeline
├── JwtModule                — token signing/verification
├── AuthJwtModule            — JWT strategy + guard
├── AuthLocalModule          — username/password strategy
├── AuthRefreshModule        — refresh token rotation
├── AuthRecoveryModule       — password recovery flow
├── AuthVerifyModule         — email verification
├── AuthRouterModule         — OAuth provider routing
├── AuthAppleModule          — Apple OAuth
├── AuthGithubModule         — GitHub OAuth
├── AuthGoogleModule         — Google OAuth
├── FederatedModule          — external identity tracking
├── UserModule               — user management
├── PasswordModule           — hashing + validation
├── OtpModule                — one-time passwords
├── EmailModule              — templated email sending
├── RoleModule               — role management
├── InvitationModule         — invitation workflows
├── CrudModule               — CRUD infrastructure
├── AccessControlModule      — RBAC (conditional)
├── SwaggerUiModule          — API documentation
└── 4 conditional submodules — admin, signup, role admin, invitation acceptance
```

22+ modules. One `useFactory`. The developer never touches the dependency graph.

### Start full, subtract what you don't need

Every endpoint group has a disable flag:

```typescript
disableController: {
  otp: true,           // don't need OTP? gone
  oAuth: true,         // no OAuth? gone
  invitation: true,    // no invitations? gone
  // ... 14 flags total
}
```

Most frameworks make you add features. Rockets makes you remove what you don't need. The advantage: you never realize at month 3 that you forgot to build password recovery.

### The invitation system

This is the feature that proves Rockets has been used in real products. Most auth libraries stop at login/signup. Rockets ships a complete admin-driven onboarding flow:

```
Admin → POST /admin/invitations → email sent with OTP
User  → clicks link → PATCH /invitation-acceptance/:code
          → OTP validated → account created → role assigned → confirmation email sent
Admin → can revoke or reattempt at any time
```

Five endpoints. Email templates. OTP validation. User creation. Role assignment. Error recovery. All pre-wired.

### Everything is replaceable

```typescript
services: {
  userModelService?,     // swap user lookup
  issueTokenService?,    // swap token issuance
  verifyTokenService?,   // swap token verification
  mailerService,         // bring your own email sender
  notificationService?,  // swap notification delivery
  // ... 10 override points
}
```

Sensible defaults. Total escape hatches.

---

## Part 2: CRUD — Where the DX Leap Happens

Auth is solved. The real developer experience question is: **how fast can you build your domain?**

### Where we are: explicit and layered

Today, Rockets CRUD uses a 4-layer architecture:

```
Controller    → HTTP routing + access control
CrudService   → error handling
ModelService  → business logic
CrudAdapter   → database abstraction
```

A domain entity like Pet requires these files:

```
pet.entity.ts                 — TypeORM entity
pet.interface.ts              — 5 interfaces (entity, creatable, updatable, ...)
pet.dto.ts                    — 7 DTO classes (create, update, response, paginated, ...)
pet.types.ts                  — resource name constant
pet.crud.controller.ts        — 6 route handlers with 8 class decorators
pet.crud.service.ts           — try/catch wrappers around super.*
pet-model.service.ts          — business logic
pet-typeorm-crud.adapter.ts   — wraps InjectRepository
pet-access-query.service.ts   — ownership verification
pet.exception.ts              — custom exceptions
```

**10 files. ~1,175 lines per entity.** Every layer is explicit. Nothing is hidden. You can debug any behavior by reading the file that owns it.

This is powerful — but most of those files are structural boilerplate. The field `name: string` appears in 6 places across 5 files. The adapter is always the same 16-line class. The CRUD service is always the same try/catch pattern.

### Where we're going: entity as single source of truth

The vision is **3 files for the common case**, with full escape hatches for custom logic.

#### File 1 — Entity (defines fields once, derives everything)

```typescript
@Entity('pets')
export class PetEntity extends CrudEntity {
  @CrudField({ required: true, maxLength: 255 })
  name!: string;

  @CrudField({ required: true, maxLength: 100 })
  species!: string;

  @CrudField({ optional: true, maxLength: 255 })
  breed?: string;

  @CrudField({ type: 'int', min: 0, max: 50 })
  age!: number;

  @CrudField({ enum: PetStatus, default: PetStatus.ACTIVE })
  status!: PetStatus;

  @OwnerField()
  userId!: string;

  @HasMany(() => PetVaccinationEntity, 'petId')
  vaccinations?: PetVaccinationEntity[];
}
```

`@CrudField()` generates:
- DTO properties with validation decorators (`@IsString`, `@MaxLength`, `@IsNotEmpty`)
- Swagger `@ApiProperty` metadata
- Interface types for creatable/updatable shapes
- Distinction between required-on-create vs optional-on-update

`@OwnerField()` generates:
- Auto-assignment on create (`dto.userId = user.id`)
- Auto-filtering on readMany for `Own` possession
- Ownership verification on readOne/update/delete
- No separate `AccessQueryService` file needed

One file. One declaration per field. Everything derived.

#### File 2 — Controller (pure declaration)

```typescript
@RocketsCrud({
  path: 'pets',
  entity: PetEntity,
  resource: 'pet',
  operations: ['readMany', 'readOne', 'createOne', 'updateOne', 'deleteOne', 'recoverOne'],
  relations: ['vaccinations', 'appointments'],
})
export class PetController {}
```

`@RocketsCrud()` composes:
- `@CrudController()` with model types
- `@CrudRelations()` with join configuration
- `@AccessControlQuery()` with auto-generated ownership service
- `@UseGuards(AccessControlGuard)`
- `@ApiTags()` + `@ApiBearerAuth()`
- All `@CrudReadMany()` + `@AccessControlReadMany()` pairings

One decorator replaces 8 class decorators + 6 method decorator pairs + manual controller body.

#### File 3 — Module (just wiring)

```typescript
@Module({
  imports: [RocketsCrudModule.forFeature([PetEntity, PetVaccinationEntity])],
  controllers: [PetController],
})
export class PetModule {}
```

`RocketsCrudModule.forFeature()` handles:
- `TypeOrmModule.forFeature()` registration
- `TypeOrmExtModule.forFeature()` registration
- CrudAdapter creation (no manual adapter class)
- CrudService creation (with default error wrapping)
- ModelService creation (with extensible hooks)

#### Business logic — only when you need it

```typescript
// Optional. Only create this file if you have real business rules.
@Injectable()
export class PetModelService extends AutoModelService(PetEntity) {
  async beforeCreate(data: CreateDto<PetEntity>) {
    data.status ??= PetStatus.ACTIVE;
  }

  async isPetOwnedByUser(petId: string, userId: string): Promise<boolean> {
    return !!(await this.repo.findOne({ where: { id: petId, userId } }));
  }
}
```

Hook-based extension: `beforeCreate`, `afterCreate`, `beforeUpdate`, `afterUpdate`, `beforeDelete`. Override only what matters.

### The ACL stays as-is

The access control rules are already clean. No changes needed:

```typescript
acRules.grant([AppRole.Admin]).resource(allResources)
  .createAny().readAny().updateAny().deleteAny();

acRules.grant([AppRole.Manager]).resource(allResources)
  .createAny().readAny().updateAny();

acRules.grant([AppRole.User]).resource(allResources)
  .createOwn().readOwn().updateOwn().deleteOwn();
```

Declarative. Role-first. A PM can read it.

### What this eliminates

| Today (per entity) | Target (per entity) | Eliminated |
|---------------------|---------------------|------------|
| `pet.interface.ts` — 5 interfaces, 117 lines | Derived from entity | `@CrudField` generates types |
| `pet.dto.ts` — 7 classes, 383 lines | Derived from entity | `@CrudField` generates DTOs + validation |
| `pet.types.ts` — resource constant, 7 lines | Inline in `@RocketsCrud` | Absorbed by decorator |
| `pet-typeorm-crud.adapter.ts` — 16 lines | Auto-created by `forFeature` | Same pattern every time |
| `pet.crud.service.ts` — 74 lines | Default with error wrapping | Override only if custom logic |
| `pet-access-query.service.ts` — 59 lines | Generated by `@OwnerField` | Same ownership pattern every time |
| `pet.crud.controller.ts` — 172 lines | 10-line `@RocketsCrud` class | Decorator composition |
| **10 files, ~1,175 lines** | **2-3 files, ~80 lines** | **~93% reduction** |

The building blocks already exist in the codebase (`ConfigurableCrudBuilder`, `CrudService`, `AccessControlGuard`, the decorator system). The target is a higher-level composition layer that makes the common case trivial while preserving every escape hatch.

### Quick wins, ranked by impact

| # | Change | What it kills | Effort |
|---|--------|---------------|--------|
| 1 | `@CrudField()` decorator — generates DTO classes + validation + Swagger from entity | `pet.dto.ts` (383 lines), `pet.interface.ts` (117 lines) | Medium |
| 2 | Auto-adapter from entity — `RocketsCrudModule.forFeature([Entity])` creates the adapter internally | `pet-typeorm-crud.adapter.ts` per domain | Low |
| 3 | `@OwnerField()` decorator — auto-assigns on create, auto-filters readMany, auto-checks ownership | `pet-access-query.service.ts` per domain + manual controller filter logic | Medium |
| 4 | Default error wrapping in CrudService — the try/catch pattern becomes base behavior | `pet.crud.service.ts` overrides when there's no custom logic | Low |
| 5 | `@RocketsCrud()` class decorator — merges 8 decorators + 6 method pairs into one | Controller from 172 lines to ~10 | Medium-High |
| 6 | `RocketsCrudModule.forFeature()` — replaces TypeOrmModule + TypeOrmExtModule + provider array | Module wiring boilerplate | Medium |

---

## Part 3: The Full Picture

### What a developer gets today

**Auth (0 code):**
- 27 API endpoints: login, signup, recovery, OTP, OAuth, admin, roles, invitations
- JWT with refresh rotation
- 3 OAuth providers (Google, GitHub, Apple)
- Role-based access control with ownership
- Email templates for OTP, invitations, recovery
- Swagger docs auto-generated
- Every service overridable

**CRUD (explicit, layered):**
- 4-layer architecture: Controller → CrudService → ModelService → Adapter
- Relation loading with `@CrudRelations`
- Access control with decorators
- Paginated responses
- Soft delete + recovery
- Full TypeScript safety

**Infrastructure:**
- Global auth guard with `@AuthPublic()` opt-out
- Exception filter for consistent error responses
- Helmet, CORS, validation pipe in sample apps
- DevContainer support
- 13 AI-native development guides (13,900 lines)

### What a developer writes

**For the auth system** — ~100 lines of config in `app.module.ts`:
- Entity declarations (User, Role, UserRole, UserOtp, Federated, Invitation)
- `RocketsAuthModule.forRootAsync()` with settings, services, CRUD config, access control
- `RocketsModule.forRootAsync()` with auth provider

**For each domain entity** — currently ~1,175 lines across 10 files, headed toward ~80 lines across 3 files:
- Entity with field decorators (source of truth)
- Controller with `@RocketsCrud` (pure declaration)
- Module with `forFeature` (just wiring)
- Optional model service (only for real business logic)

### The sample apps prove it

**`sample-server` (minimal, external auth):** 12 files, 1,004 lines. Working auth guard + `/me` endpoints.

**`sample-server-auth` (full system):** 56 files, 3,512 lines. Complete auth + 3 domain entities (Pet, Vaccination, Appointment) with roles, ownership, and relations. The developer wrote ~230 lines for auth infrastructure. Everything else is domain code or provided by Rockets.

---

## Part 4: Why Rockets Over Alternatives

**Over rolling your own auth:** Because you'll spend 2-4 weeks building what Rockets gives you in an afternoon — and you'll miss edge cases (token rotation, OTP expiry, invitation revocation, role assignment on signup, OAuth callback handling, password recovery flows) that Rockets has already solved.

**Over Firebase/Auth0/Supabase Auth:** Because your auth logic runs in your own infrastructure. No vendor API calls on the hot path. No external dashboard to manage roles. Full TypeScript control over every behavior. And you can swap the provider later without changing your domain code.

**Over Passport.js alone:** Because Passport gives you strategies, not a system. You still need to build token management, user CRUD, role assignment, email flows, admin panels, and invitation workflows. Rockets does all of that and uses Passport internally.

**Over other NestJS auth libraries:** Because Rockets ships the invitation system, the selective controller disabling, the access control integration, and the CRUD layer — not just login and signup. And every piece is a standard NestJS module you can eject and replace.

---

## Part 5: For Each Audience

**Solo dev:** "I added two imports. I have login, signup, recovery, OAuth, OTP, admin panels, roles, invitations, and Swagger docs. I wrote 100 lines of config. Now I'm building my actual product."

**Team lead:** "Our auth system is a maintained open-source package with TypeScript interfaces at every boundary. We override what we need. We test against the same e2e suite the package uses. Our domain code is cleanly separated from infrastructure."

**Architect:** "It's NestJS modules all the way down. No vendor lock-in beyond NestJS itself. The `@concepta/nestjs-*` packages are independent. Rockets is the composition layer. We can eject any component and replace it without touching the rest."

**AI-assisted developer:** "The guides are written for AI tools. Decision trees, copy-paste templates, token-budgeted sections. 13 guides, 13,900 lines. The entity becomes the single source of truth — define fields once, derive DTOs, validation, Swagger, and access control automatically."
