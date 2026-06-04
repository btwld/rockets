import { CanAccess } from '@concepta/nestjs-access-control';
import type {
  AuthenticationOptionsInterface,
  AuthenticationPortsInterface,
} from '@concepta/nestjs-authentication';
import {
  EmailOptionsInterface,
  EmailServiceInterface,
} from '@concepta/nestjs-email';
import { OtpOptionsInterface } from '@concepta/nestjs-otp';
import { PasswordOptionsInterface } from '@concepta/nestjs-password';
import { SwaggerUiOptionsInterface } from '@concepta/nestjs-swagger-ui';
import type {
  FederatedOptionsInterface,
  FederatedUserPortSettings,
} from '@concepta/nestjs-federated';
import type {
  InvitationNotificationPortSettings,
  InvitationOtpPortSettings,
  InvitationSettingsInterface,
  InvitationUserPortSettings,
} from '@concepta/nestjs-invitation';

import { CrudModule } from '@bitwild/rockets-crud';
import { RoleOptionsInterface } from '@concepta/nestjs-role';
import type {
  UserOptionsInterface,
  UserPasswordPortSettings,
  UserSettingsInterface,
} from '@concepta/nestjs-user';
import { RocketsAuthSettingsInterface } from './rockets-auth-settings.interface';

/**
 * Options accepted by `CrudModule.forRoot()` (the upstream interface
 * `CrudModuleOptionsInterface` is not exported publicly in
 * `@bitwild/rockets-crud@v8.0.0-alpha.5`, so we extract it via TS
 * inference instead of deep-importing).
 */
type CrudModuleOptions = Parameters<typeof CrudModule.forRoot>[0];

/**
 * Options for `RocketsAuthModule.forRoot(Async)`.
 *
 * v8 collapse: the seven v7 auth packages (`auth-jwt`, `auth-local`,
 * `auth-refresh`, `auth-recovery`, `auth-verify`, `auth-router`, plus the
 * standalone `nestjs-jwt`) are folded into `@concepta/nestjs-authentication`
 * v8. The unified module accepts a single `authentication` block that nests
 * `settings.{jwt, strategies, mfa, guards}` and a `ports` block whose values
 * are CQRS Command/Query class types (NOT service instances).
 *
 * The OAuth provider modules (`auth-apple`, `auth-github`, `auth-google`) are
 * intentionally absent here — they have not been ported to v8 yet upstream.
 * See `domains/oauth/` for the deferred wiring with `TODO(upstream:)` markers.
 */
export interface RocketsAuthOptionsInterface {
  /**
   * Global Rockets-specific settings (role names, OTP defaults, email
   * templates). Drives downstream module factories that combine
   * Rockets-defined defaults with upstream module options.
   */
  settings: RocketsAuthSettingsInterface;

  /**
   * Swagger UI configuration. Forwarded to `SwaggerUiModule`.
   */
  swagger?: SwaggerUiOptionsInterface;

  /**
   * Authentication module configuration. Maps directly onto
   * `@concepta/nestjs-authentication@v8`'s public options shape, except
   * `ports` is relaxed to `Partial<AuthenticationPortsInterface>` so the
   * consumer can supply only the ports they care about — `buildRockets`
   * `AuthenticationPorts()` fills in `user`, `password`, `otp`, `jwt`,
   * and `token` with rockets-provided defaults. The consumer MUST provide
   * `recoveryNotification.*` and `verifyNotification.*` Command classes
   * (no silent no-op default).
   *
   * **`settings.*` fields (all forwarded as-is to upstream):**
   * - `jwt` — access/refresh secrets, sign options. Resolved via
   *   `resolveJwtSettings()` (env-var fallback + dev-mode random secret).
   * - `strategies` — `local` / `jwt` / `refresh` strategy toggles.
   *   Defaulted to all-enabled; pass `{ jwt: {} }` etc. to override.
   * - `mfa` — `recovery` / `verify` MFA policy overrides
   *   (`RecoveryPolicySettingsInterface` / `VerifyPolicySettingsInterface`).
   *   Typed-reachable; no rockets default — upstream supplies defaults
   *   when omitted.
   * - `guards` — guard enable/disable policy
   *   (`GuardsPolicySettingsInterface`). Typed-reachable; no rockets
   *   default.
   *
   * **`ports.*` overrides (all individually overridable):**
   * - `user`, `password`, `otp` — defaulted by `buildRocketsAuthenticationPorts`.
   * - `recoveryNotification`, `verifyNotification` — required; fail-fast at boot.
   * - `jwt`, `token` — optional; upstream supplies defaults
   *   (`SignAccessTokenCommand`, `IssueAccessTokenCommand`, etc.) when
   *   omitted. Override to plug in KMS-backed signers, custom claim
   *   transforms, key rotation, or alternate verify strategies.
   *
   * **Extras (`appGuard`, `guards`) live on `extras.auth`**, not here —
   * upstream resolves them at module-init time, not via the async factory.
   */
  authentication?: Omit<AuthenticationOptionsInterface, 'ports'> & {
    ports?: Partial<AuthenticationPortsInterface>;
  };

  /**
   * Federated authentication module options.
   * Forwarded to `FederatedModule.forRootAsync`. Consumer can override
   * `userPort.{getByIdQuery, getByEmailQuery, createCommand}` individually;
   * Rockets defaults to upstream `@concepta/nestjs-user` queries/commands.
   */
  federated?: Omit<FederatedOptionsInterface, 'userPort'> & {
    userPort?: Partial<FederatedUserPortSettings>;
  };

  /**
   * User module options. Forwarded to `UserModule.forRootAsync`.
   *
   * **`settings.password.*` fields (all forwarded as-is):**
   * - `requireCurrent` — default `true`. Setting `false` triggers a
   *   security warning (dev) or fail-fast (production).
   * - `reuseAfterDays` — password history window (upstream
   *   `PasswordPolicySettings`). Defaults from upstream when omitted.
   *   Requires `ports.password.validateHistoryCommand` to be wired
   *   (rockets wires `ValidatePasswordHistoryCommand` by default; the
   *   feature is on out of the box).
   *
   * **`ports.password.*` overrides:**
   * - `createCommand` — defaults to upstream `CreatePasswordCommand`.
   * - `validateCurrentCommand` — defaults to upstream
   *   `ValidateCurrentPasswordCommand`.
   * - `validateHistoryCommand` — defaults to upstream
   *   `ValidatePasswordHistoryCommand` (rockets-on-by-default; upstream
   *   itself leaves this `undefined`).
   */
  user?: {
    settings?: UserSettingsInterface;
    ports?: {
      password?: Partial<UserPasswordPortSettings>;
    };
  } & Omit<UserOptionsInterface, 'settings' | 'ports'>;

  /** Password module options. Forwarded to `PasswordModule.forRootAsync`. */
  password?: PasswordOptionsInterface;

  /** OTP module options. Forwarded to `OtpModule.forRootAsync`. */
  otp?: OtpOptionsInterface;

  /** Email module options. Forwarded to `EmailModule.forRootAsync`. */
  email?: Partial<EmailOptionsInterface>;

  /** CRUD module options. Forwarded to `CrudModule.forRootAsync`. */
  crud?: CrudModuleOptions;

  /** Role module options. Forwarded to `RoleModule.forRootAsync`. */
  role?: Partial<RoleOptionsInterface>;

  /**
   * Invitation module options. Forwarded to `InvitationModule.forRootAsync`.
   *
   * - `settings`: merged with Rockets defaults (consumer wins per field).
   * - `ports`: each port (otp, user, notification) is deep-partial — consumer
   *   can override individual Command/Query classes; Rockets fills in
   *   defaults wired to `@concepta/nestjs-{user,otp}` and the bundled
   *   `SendInvitationEmailCommand` / `SendAcceptedEmailCommand`.
   */
  invitation?: {
    settings?: InvitationSettingsInterface;
    ports?: {
      otp?: Partial<InvitationOtpPortSettings>;
      user?: Partial<InvitationUserPortSettings>;
      notification?: Partial<InvitationNotificationPortSettings>;
    };
  };

  /** Cross-cutting services injected into module factories. */
  services: {
    /**
     * Mailer service implementation. REQUIRED — `EmailModule` needs a real
     * mailer adapter (or the in-process logger fallback).
     */
    mailerService: EmailServiceInterface;

    /**
     * Optional access-control query service. Forwarded to
     * `AccessControlModule.forRoot` when `accessControl` extras are set.
     */
    userAccessQueryService?: CanAccess;
  };
}
