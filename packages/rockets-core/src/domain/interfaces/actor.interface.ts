import type { PlainLiteralObject } from '@nestjs/common';

/**
 * Transport-agnostic identity of "who is performing the current operation".
 *
 * `Actor` is the contract that hooks, stamping logic, and audit/event code
 * should consume. It deliberately omits HTTP-specific concerns (claims,
 * roles, raw JWT payload) so the same hook compiles in non-HTTP contexts
 * (background jobs, CLI commands, test harnesses) where there is no
 * `request.user` to read.
 *
 * For role / claim checks, consumers read the v8 `AuthUserCtx` overlay
 * (or use the `@AuthUser()` decorator). For "who did this", everything
 * else uses `Actor`.
 *
 * `metadata` is a free-form bag for callers that need to carry extra data
 * with the actor (tenant id, impersonation chain, source channel) without
 * forcing a new field into every call site.
 */
export interface Actor {
  readonly id: string;
  readonly type: ActorType;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/**
 * Where the actor came from. `user` is the typical authenticated request
 * actor; `system` is the framework itself (e.g. seed scripts, scheduled
 * jobs running with elevated privileges); `service` is a service-to-service
 * call where the caller is another upstream service rather than an end user.
 */
export type ActorType = 'user' | 'system' | 'service';

/**
 * Marker that a context carries an `actor` field. CRUD context types from
 * `@concepta/nestjs-crud` are open shapes (`extends PlainLiteralObject`),
 * so this intersection lets hooks type their `ctx?` parameter as
 * `CrudContextLike & WithActor` and read `ctx.actor` without casts.
 */
export interface WithActor {
  readonly actor?: Actor;
}

export type ActorContext = PlainLiteralObject & WithActor;
