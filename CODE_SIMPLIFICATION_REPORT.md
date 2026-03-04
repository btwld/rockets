# Code Simplification Report

**Date:** 2026-03-03
**Scope:** Full codebase (`packages/rockets-server` + `packages/rockets-server-auth`)
**Result:** Build OK, 171/171 tests passing, lint clean
**Net change:** -240 lines (489 added, 729 removed across 39 files)

---

## Bug Fixes

### 1. String literal instead of constant (rockets-server)

**File:** `packages/rockets-server/src/filter/exceptions.filter.ts`

The fallback error message used the string `'ERROR_MESSAGE_FALLBACK'` (the literal name) instead of the imported constant value (`'Internal Server Error'`). Users would see the wrong message on unhandled errors.

```typescript
// Before (bug)
message: 'ERROR_MESSAGE_FALLBACK',

// After (correct)
message: ERROR_MESSAGE_FALLBACK,
```

### 2. Typo in Swagger description (rockets-server-auth)

**File:** `packages/rockets-server-auth/src/domains/user/modules/rockets-auth-admin.module.ts`

```typescript
// Before
description: 'Array of Orgs'

// After
description: 'Array of Users'
```

---

## Duplicated Logic Eliminated

### 3. Error details extraction (rockets-server)

**File:** `packages/rockets-server/src/utils/error-logging.helper.ts`

`logAndGetErrorDetails` and `getErrorDetails` had identical `error instanceof Error` extraction logic. Now `logAndGetErrorDetails` delegates to `getErrorDetails`.

```typescript
// Before: duplicated extraction in both functions
export function logAndGetErrorDetails(error, logger, customMessage, context) {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorStack = error instanceof Error ? error.stack : undefined;
  logger.error(...);
  return { errorMessage, errorStack };
}

// After: single source of truth
export function logAndGetErrorDetails(error, logger, customMessage, context) {
  const details = getErrorDetails(error);
  logger.error(`${customMessage}: ${details.errorMessage}`, details.errorStack, context);
  return details;
}
```

### 4. Error details extraction (rockets-server-auth)

**File:** `packages/rockets-server-auth/src/shared/utils/error-logging.helper.ts`

Same fix as above — identical duplication existed in the auth package's copy.

### 5. Shared error handler extracted (rockets-server)

**File:** `packages/rockets-server/src/modules/user-metadata/services/user-metadata.model.service.ts`

Three methods (`getUserMetadataById`, `getUserMetadataByUserId`, `update`) had identical catch blocks. Extracted into a single `rethrowKnownOrLog` private method:

```typescript
private rethrowKnownOrLog(
  error: unknown,
  message: string,
  context: Record<string, unknown>,
): never {
  if (error instanceof RuntimeException || error instanceof HttpException) {
    throw error;
  }
  logAndGetErrorDetails(error, this.logger, message, context);
  throw new InternalServerErrorException(message);
}
```

---

## Code Simplifications

### 6. IIFE replaced with early return (rockets-server)

**File:** `packages/rockets-server/src/rockets.module-definition.ts`

```typescript
// Before: obscure IIFE pattern
return options?.controllers !== undefined
  ? options.controllers
  : (() => {
      const disableController = options?.extras?.disableController || {};
      const list = [];
      if (!disableController.me) list.push(MeController);
      return list;
    })();

// After: clear control flow
if (options.controllers !== undefined) {
  return options.controllers;
}
const disableController = options.extras?.disableController ?? {};
const controllers = [];
if (!disableController.me) controllers.push(MeController);
return controllers;
```

### 7. IIFE replaced with early return (rockets-server-auth)

**File:** `packages/rockets-server-auth/src/rockets-auth.module-definition.ts`

Same IIFE pattern replaced with early return in `createRocketsAuthControllers`.

### 8. Guard logic simplified (rockets-server-auth)

**File:** `packages/rockets-server-auth/src/guards/admin.guard.ts`

```typescript
// Before: nested with intermediate variable
if (roles.length > 0) {
  const admin = roles[0];
  const isAdmin = await this.roleService.isAssignedRole({...});
  return isAdmin;
} else throw new ForbiddenException();

// After: early throw, direct return
if (roles.length === 0) {
  throw new ForbiddenException();
}
return this.roleService.isAssignedRole({...});
```

### 9. Unnecessary `else` after `throw`/`return` removed (rockets-server-auth)

**Files:**
- `src/domains/otp/services/rockets-auth-otp.service.ts`
- `src/domains/otp/services/rockets-auth-notification.service.ts`
- `src/domains/user/services/rockets-auth-user-metadata.model.service.ts`

```typescript
// Before
if (existing) {
  return this.update({ id: existing.id, ...data });
} else {
  return this.create({ userId, ...data });
}

// After
if (existing) {
  return this.update({ id: existing.id, ...data });
}
return this.create({ userId, ...data });
```

### 10. Conditional spread replaced with explicit push (rockets-server-auth)

**File:** `packages/rockets-server-auth/src/rockets-auth.module-definition.ts`

```typescript
// Before: hard-to-read conditional spreads
baseModule.imports = [
  ...(baseModule.imports ?? []),
  ...(userCrud.userMetadataConfig
    ? [RocketsAuthUserMetadataModule.forRoot(userCrud.userMetadataConfig)]
    : []),
  ...(!disableController.admin
    ? [RocketsAuthAdminModule.register(userCrud)]
    : []),
];

// After: readable if + push
const additionalImports = [];
if (userCrud.userMetadataConfig) {
  additionalImports.push(RocketsAuthUserMetadataModule.forRoot(userCrud.userMetadataConfig));
}
if (!disableController.admin) {
  additionalImports.push(RocketsAuthAdminModule.register(userCrud));
}
baseModule.imports = [...(baseModule.imports ?? []), ...additionalImports];
```

### 11. `||` replaced with `??` (rockets-server)

**File:** `packages/rockets-server/src/modules/user/me.controller.ts`

```typescript
// Before: || treats falsy values (0, '', false) as empty
updateData.userMetadata || {}

// After: ?? only triggers on null/undefined
updateData.userMetadata ?? {}
```

### 12. Null check simplified (rockets-server-auth)

**File:** `packages/rockets-server-auth/src/provider/rockets-jwt-auth.provider.ts`

```typescript
// Before
!payload || !payload.sub

// After
!payload?.sub
```

### 13. Intermediate variable removed (rockets-server-auth)

**File:** `packages/rockets-server-auth/src/provider/rockets-jwt-auth.provider.ts`

```typescript
// Before
const roleIds = assignedRoleIds.map((role) => role.id);
const roles = await this.roleModelService.find({
  where: roleIds.map((id) => ({ id })),
});

// After
const roles = await this.roleModelService.find({
  where: assignedRoleIds.map((role) => ({ id: role.id })),
});
```

### 14. ~15 factory functions simplified (rockets-server-auth)

**File:** `packages/rockets-server-auth/src/rockets-auth.module-definition.ts`

```typescript
// Before
useFactory: () => { return { ... }; }

// After
useFactory: () => ({ ... })
```

### 15. Factory function simplified (rockets-server)

**File:** `packages/rockets-server/src/config/rockets-options-default.config.ts`

```typescript
// Before
(): RocketsSettingsInterface => { return {}; }

// After
(): RocketsSettingsInterface => ({})
```

### 16. Unnecessary variable alias removed (rockets-server-auth)

**File:** `packages/rockets-server-auth/src/domains/user/modules/rockets-auth-signup.module.ts`

```typescript
// Before
const typedDto = dto;
// ... used typedDto everywhere

// After: uses dto directly
```

### 17. Unnecessary intermediate variable removed (rockets-server-auth)

**File:** `packages/rockets-server-auth/src/domains/user/modules/rockets-auth-admin.module.ts`

```typescript
// Before
const updatedUser = await super.getOne(req);
return updatedUser;

// After
return super.getOne(req);
```

### 18. Duplicate variable declaration consolidated (rockets-server-auth)

**File:** `packages/rockets-server-auth/src/rockets-auth.module-definition.ts`

`disableController` was declared twice (outer scope + inside `if (roleCrud)`). Consolidated to use the single outer declaration.

### 19. Simplified conditionals in exceptions filter (rockets-server)

**File:** `packages/rockets-server/src/filter/exceptions.filter.ts`

Collapsed `if/else` for HttpException message extraction into a single ternary. Removed redundant optional chaining on `exception?.safeMessage` where `exception` was already narrowed.

### 20. Inlined temporary variables (rockets-server)

**File:** `packages/rockets-server/src/guards/auth-server.guard.ts`

`contextHandler` and `contextClass` were used once each — inlined to `context.getHandler()` and `context.getClass()`.

---

## Dead Code Removed

### 21. Unused constant (rockets-server)

**File:** `packages/rockets-server/src/rockets.constants.ts`

`ROCKETS_MODULE_OPTIONS_TOKEN` was declared but never referenced. The module definition uses `RAW_OPTIONS_TOKEN` from `rockets.tokens.ts`.

### 22. Unused interface (rockets-server)

**File:** `packages/rockets-server/src/modules/user-metadata/user-metadata.module.ts`

`UserMetadataModuleOptionsInterface` was defined locally but never referenced. The equivalent `UserMetadataConfigInterface` in `rockets-options.interface.ts` serves this purpose.

### 23. Unused parameters (rockets-server)

**File:** `packages/rockets-server/src/rockets.module-definition.ts`

`extras` parameter removed from `createRocketsImports` and `createRocketsExports` signatures (declared but never read).

### 24. Redundant decorator (rockets-server)

**File:** `packages/rockets-server/src/modules/user/user.dto.ts`

Removed redundant `@Allow()` from `claims` property — already covered by `@IsOptional()` + `@IsObject()`.

### 25. Empty exports array (rockets-server)

**File:** `packages/rockets-server/src/modules/user/user.module.ts`

Removed `exports: []` — empty array is the default behavior.

### 26. Empty route strings cleaned up (rockets-server-auth)

**Files:**
- `src/domains/role/controllers/admin-user-roles.controller.ts`
- `src/domains/otp/controllers/rockets-auth-otp.controller.ts`

```typescript
// Before
@Get('')  @Post('')  @Patch('')

// After
@Get()  @Post()  @Patch()
```

---

## Import Consolidation

### 27. Duplicate imports merged (rockets-server)

**File:** `packages/rockets-server/src/rockets.module-definition.ts`

Two separate import blocks from `@concepta/nestjs-common` merged into one.

### 28. Duplicate imports merged (rockets-server-auth)

**File:** `packages/rockets-server-auth/src/rockets-auth.module-definition.ts`

Split imports from 7+ packages consolidated into single statements (`nestjs-auth-apple`, `nestjs-auth-github`, `nestjs-auth-google`, `nestjs-auth-jwt`, `nestjs-auth-local`, `nestjs-auth-recovery`, `nestjs-auth-refresh`, `nestjs-auth-verify`, `nestjs-jwt`).

**File:** `packages/rockets-server-auth/src/domains/auth/controllers/me-password.controller.ts`

`Patch` imported separately from `@nestjs/common` — merged into existing import.

### 29. Duplicate exports merged (rockets-server-auth)

**File:** `packages/rockets-server-auth/src/index.ts`

Two separate `export { ... } from './shared/constants/rockets-auth.constants'` merged into one.

---

## Comments & Documentation Cleanup

### 30. Stale/redundant comments removed

Across both packages, removed:
- Placeholder "extend here" comments in 6 DTOs and 1 interface
- Obsolete "Note: ... is now provided by ..." comments (4 instances)
- Duplicate JSDoc block in invitation acceptance module definition
- Obvious code-describing comments ("Find user by email", "Generate OTP", etc.)
- "Follows SDK patterns for X" boilerplate JSDoc
- `// error code is UNKNOWN unless it gets overridden` and similar restating comments

### 31. Logger level upgraded (rockets-server-auth)

**File:** `packages/rockets-server-auth/src/domains/user/modules/rockets-auth-signup.module.ts`

`this.logger.log` upgraded to `this.logger.warn` for the signup metadata id/userId mismatch warning — this is an abnormal condition that should stand out in logs.

### 32. Missing return type added (rockets-server-auth)

**File:** `packages/rockets-server-auth/src/provider/rockets-jwt-auth.provider.ts`

Added explicit return type to `validateToken` for better IDE support and type safety.
