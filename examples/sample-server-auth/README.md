# `sample-server-auth`

End-to-end NestJS app using **[@bitwild/rockets-auth](../../packages/rockets-server-auth/)**.
Demonstrates the full self-hosted auth story: signup, login, JWT, OTP,
password recovery, role-based access control, and the invitation flow.

## Run it

```bash
# from repo root
yarn install
yarn build

yarn workspace sample-server-auth start
# → http://localhost:3000
```

```bash
# e2e tests
yarn workspace sample-server-auth test:e2e
```

## What this example shows

| Feature | Where to look |
|---|---|
| Signup + login + JWT | `src/app.module.ts` (RocketsAuthModule wiring) |
| Role-based access control | `src/app.acl.ts` + `src/access-control.service.ts` |
| Invitation flow with OTP | E2E spec: `test/role-based-access.e2e-spec.ts` |
| User metadata DTOs | `src/modules/user/dto/user-metadata.dto.ts` |
| Custom resource (`pet`) protected by RBAC | `src/modules/pet/` |
| Email templates (Handlebars) | `assets/*.hbs` |

## Walkthrough — three flows you can try

### 1. Signup + login

```bash
curl -X POST http://localhost:3000/signup \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "username": "user@example.com",
    "password": "SecureP@ss123",
    "userMetadata": { "firstName": "John" }
  }'

curl -X POST http://localhost:3000/token/password \
  -H "Content-Type: application/json" \
  -d '{ "username": "user@example.com", "password": "SecureP@ss123" }'
# → { "accessToken": "...", "refreshToken": "..." }
```

### 2. Admin invites a user

```bash
# Admin creates invitation (with role assignment)
curl -X POST http://localhost:3000/admin/invitations \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "newuser@example.com",
    "constraints": { "roleId": "<USER_ROLE_ID>" }
  }'

# Recipient accepts (passcode came via email)
curl -X PATCH http://localhost:3000/invitation-acceptance/<CODE> \
  -H "Content-Type: application/json" \
  -d '{
    "passcode": "<PASSCODE>",
    "payload": {
      "password": "NewUserP@ss",
      "userMetadata": { "firstName": "Jane" }
    }
  }'
```

### 3. RBAC-protected route

`@Auth({ resource: 'pet', action: 'create' })` consults the rules in
`src/app.acl.ts`. A user without the `pet.create` grant gets 403; an
admin (extending `user`) can create any pet.

## Project layout

```
src/
├── app.module.ts              # RocketsAuthModule wiring
├── app.acl.ts                 # AccessControl rules
├── access-control.service.ts  # CanAccess query implementation
├── main.ts                    # bootstrap + Swagger
└── modules/
    ├── user/                  # user / metadata / federated entities
    ├── role/                  # role + user-role entities
    └── pet/                   # example RBAC-protected resource
assets/                        # invitation / OTP email templates
test/                          # e2e specs
```

## Documentation

- **`@bitwild/rockets-auth` reference:**
  [`packages/rockets-server-auth/README.md`](../../packages/rockets-server-auth/README.md)
- **Tutorial — first auth server:**
  [`docs/tutorials/01-first-auth-server.md`](../../docs/tutorials/01-first-auth-server.md)
- **How-to — invite a user:**
  [`docs/how-to/auth/invite-user.md`](../../docs/how-to/auth/invite-user.md)
- **How-to — RBAC rules:**
  [`docs/how-to/access-control/add-an-acl-rule.md`](../../docs/how-to/access-control/add-an-acl-rule.md)
- **Local guide — RBAC patterns used here:**
  [`ROLE_ACCESS_CONTROL_GUIDE.md`](./ROLE_ACCESS_CONTROL_GUIDE.md)

## Production checklist (before deploying any of this)

1. Replace SQLite with PostgreSQL/MySQL.
2. Replace the mock email service with SendGrid / SES / Postmark.
3. Move secrets to env vars (`JWT_SECRET`, `JWT_REFRESH_SECRET`).
4. Enable HTTPS, configure CORS for your frontend.
5. Add structured logging and health checks.
6. Review the [security model](../../docs/explanation/security-model.md).

## License

MIT — see [`../../LICENSE.txt`](../../LICENSE.txt). Sample app, not for
production without hardening.
