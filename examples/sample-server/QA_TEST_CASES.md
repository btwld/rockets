# Sample Server — Playwright QA Test Cases

End-to-end QA plan for the `examples/sample-server` API, written to be executed with Playwright's `request` fixture (or the MCP Playwright browser driver if you want to walk the UI through Swagger).

## 0. Orientation

| Item | Value |
|---|---|
| App base URL | `http://localhost:3000` |
| Swagger UI | `http://localhost:3000/api` |
| Swagger JSON | `http://localhost:3000/api-json` (if enabled by `SwaggerUiService`) |
| Global prefix | **none** — `/api` is only the docs path. All endpoints below are root-level. |
| Validation | global `ValidationPipe({ transform: true, whitelist: true })` → unknown body fields stripped, 400 on invalid input |
| Auth | Global `AuthServerGuard` (JWT Bearer). Public endpoints opt out via `@AuthPublic()`. |
| JWT expiry | 1 hour |
| Admin role | user with `role = 'admin'` (settable during signup in this dev sample only) |

### Launching the app locally

```bash
yarn workspace sample-server start:dev
# wait for: "Sample server listening on http://localhost:3000"
```

### Playwright setup (one-time)

```bash
# at repo root or inside a new qa/ folder
yarn add -D @playwright/test
npx playwright install chromium
```

Recommended `playwright.config.ts`:

```ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  use: {
    baseURL: 'http://localhost:3000',
    extraHTTPHeaders: { 'Content-Type': 'application/json' },
  },
  workers: 1, // sample server uses SQLite in-process; avoid write races
});
```

---

## 1. Shared Test Fixtures

Create these once per test file (or in a `beforeAll`) — most test cases depend on them.

| Fixture | How to obtain | Used for |
|---|---|---|
| `adminToken` | `POST /auth/signup { email: 'admin+<ts>@qa.test', password: 'Pa55word!', role: 'admin' }` | Admin endpoints, audit |
| `aliceToken` | `POST /auth/signup { email: 'alice+<ts>@qa.test', password: 'Pa55word!' }` | Owner of pet, appointment |
| `bobToken`   | `POST /auth/signup { email: 'bob+<ts>@qa.test',   password: 'Pa55word!' }` | Non-owner, share recipient |
| `aliceId`, `bobId`, `adminId` | Returned from signup | Path params for share/transfer, `userId` comparisons |
| `tagId` | `POST /tags { name: 'qa-tag-<ts>' }` with any token | Attach to pets |
| `petId` | `POST /pets { … userId: aliceId, tagIds: [tagId] }` with `aliceToken` | Pet-centric tests |
| `appointmentId` | `POST /appointments { petId, date, reminderSendAt, … }` | Reminder tests |

Always use unique emails (suffix timestamp or uuid) — signup is idempotent per-email and repeats fail with 400.

---

## 2. Endpoint Map (cheat sheet)

| Group | Method + Path | Auth |
|---|---|---|
| Auth | POST `/auth/signup` | public |
| Auth | POST `/auth/login` | public |
| Pet | POST `/pets` | bearer (owner-stamped) |
| Pet | GET `/pets` | bearer (owner + shared) |
| Pet | GET `/pets/:id` | bearer (owner + shared) |
| Pet | PATCH `/pets/:id` | bearer (**owner only**) |
| Pet | DELETE `/pets/:id` (soft) | bearer (**owner only**) |
| Pet | PATCH `/pets/:id/restore` | bearer (**owner only**) |
| Tag | POST `/tags` | bearer (no scope) |
| Tag | GET `/tags` | bearer |
| Tag | GET `/tags/:id` | bearer |
| Tag | PATCH `/tags/:id` | bearer |
| Tag | DELETE `/tags/:id` | bearer |
| PetVaccination | POST `/pet-vaccinations` | bearer |
| PetVaccination | GET `/pet-vaccinations` | bearer |
| PetVaccination | GET `/pet-vaccinations/:id` | bearer |
| PetVaccination | DELETE `/pet-vaccinations/:id` | bearer |
| Appointment | POST `/appointments` | bearer (owner-stamped, txn) |
| Appointment | GET `/appointments` | bearer (owner-scoped) |
| Appointment | GET `/appointments/:id` | bearer (owner-scoped) |
| Appointment | DELETE `/appointments/:id` | bearer (owner-scoped) |
| Reminder | GET `/reminders` | bearer (transitive owner) |
| Reminder | GET `/reminders/:id` | bearer (transitive owner) |
| PetShare | POST `/pets/:petId/share` | bearer (**pet owner**) |
| PetShare | GET `/pets/:petId/share` | bearer (**pet owner**) |
| PetShare | DELETE `/pets/:petId/share/:userId` | bearer (**pet owner**) |
| PetTransfer | POST `/pets/:petId/transfer` | bearer (**pet owner**) |
| Admin | GET `/admin/pets` | admin |
| Admin | GET `/admin/pets/:id` | admin |
| Admin | PATCH `/admin/pets/:id/force-restore` | admin |
| Admin | DELETE `/admin/pets/:id/hard` | admin |
| Audit | GET `/admin/audit-logs` | admin |

> Assume every bearer-protected endpoint **must** return `401` when the `Authorization` header is absent or malformed, and `401` when the token is expired or signed with the wrong secret. These "every endpoint" checks are consolidated in section **13. Cross-cutting**.

---

## 3. Auth (`/auth/*`)

### 3.1 Signup — happy path

- Request: `POST /auth/signup` with `{ email, password: 'Pa55word!', name: 'Alice' }`.
- Expect `201` (or `200`) and body `{ id, email, role: 'user', accessToken }`.
- Decode `accessToken` and assert `sub === id`.

### 3.2 Signup — validation

| Case | Body | Expected |
|---|---|---|
| Missing email | `{ password: 'x' }` | 400 |
| Invalid email | `{ email: 'not-an-email', password: 'x' }` | 400 |
| Duplicate email | signup twice | 400 on second call |
| Unknown field | `{ email, password, hacker: true }` | 201 — `whitelist` strips the field; assert response has no `hacker` |
| Role enum out of range | `{ email, password, role: 'superuser' }` | 400 |

### 3.3 Signup — role elevation guardrail (intent check)

- A regular signup with `role: 'admin'` **is currently accepted** in this dev sample. Document this in the QA report as an **intentional dev shortcut**, not a bug. Production code must remove the admin option from the public DTO.
- Test: signup `{ role: 'admin' }`, then call `GET /admin/pets` with the returned token → 200. If the product team has since locked this down, this test should flip to expect `400` on signup.

### 3.4 Login — happy path

- `POST /auth/login { email, password }` → 200 with `{ accessToken }`.
- Reuse the same email used in 3.1.

### 3.5 Login — negative

| Case | Expected | Notes |
|---|---|---|
| Wrong password | 401 | message must **not** say "user not found" — avoid user enumeration |
| Unknown email | 401 | same generic error as wrong password |
| Missing body | 400 | |

---

## 4. Pet CRUD (`/pets`)

### 4.1 Create — owner stamping

- `POST /pets` with `aliceToken`, body omits `userId`.
- Expect 201, response `userId === aliceId`.
- Verify in DB via `GET /pets/:id` that `userId === aliceId`.

### 4.2 Create — cannot hijack ownership

- `POST /pets` with `aliceToken`, body `{ … userId: bobId }`.
- Expect **400/403** (`userId` mismatch rejected). If it succeeds and stamps `userId=aliceId` silently, open a bug — silent stripping of `userId` is acceptable, silent acceptance of `bobId` is not.

### 4.3 Create — tag attachment

- `POST /pets` with valid `tagIds: [tagId]` → 201, response `tags[0].id === tagId`.
- `POST /pets` with `tagIds: ['00000000-0000-0000-0000-000000000000']` → 404.

### 4.4 Create — body validation

| Case | Expected |
|---|---|
| Missing `name` | 400 |
| `age: -1` | 400 |
| `age: 999` | 400 |
| `status: 'weird'` | 400 |
| `name` length > 255 | 400 |

### 4.5 List — owner + shared visibility

1. Alice creates `petA`.
2. Bob creates `petB`.
3. `GET /pets` as Alice → contains `petA`, **does not** contain `petB`.
4. `GET /pets` as Bob  → contains `petB`, **does not** contain `petA`.
5. Alice shares `petA` with Bob (see 7.1).
6. `GET /pets` as Bob → now contains both `petA` and `petB`.

### 4.6 Read by id — owner, shared, stranger

| Caller | Pet owned by | Shared with caller? | Expected |
|---|---|---|---|
| Alice | Alice | — | 200 |
| Bob | Alice | no | 404 |
| Bob | Alice | yes | 200 |
| Alice | Bob | no | 404 |
| anyone | invalid uuid | — | 400 |

### 4.7 Update — owner-only

- Alice updates her pet (`PATCH /pets/:id`) → 200.
- Bob updates a pet shared *read-only* with him → **404** (writeOnly scope strips share).
- Bob updates Alice's pet without a share → 404.
- Path id vs body id mismatch → 400.
- `tagIds: []` → pet now has 0 tags (verify via GET).

### 4.8 Soft delete + restore

1. Alice `DELETE /pets/:id` → 200 with `dateDeleted` set (response mode `returnDeleted: true`).
2. `GET /pets` as Alice → does **not** contain the pet.
3. `GET /pets/:id` as Alice → 404.
4. `PATCH /pets/:id/restore` as Alice → 200, `dateDeleted === null`.
5. Restore a non-deleted pet → 400.
6. Bob attempts `DELETE /pets/:id` on Alice's pet → 404.

---

## 5. Tag CRUD (`/tags`)

> Tags are a global catalog — no ownership. These tests confirm that unscoped is intentional.

### 5.1 Create + list + read

- Alice creates `tag-alice`; Bob creates `tag-bob`.
- `GET /tags` as Alice contains **both**.
- `GET /tags/:id` works for any authenticated user.

### 5.2 Update

- `PATCH /tags/:id` as Bob on Alice-created tag → 200 (intentional: global catalog). If product intent changes, flip this expectation to 403.

### 5.3 Delete — cascade to pets

- Attach `tag-alice` to a pet, then `DELETE /tags/:tagId`.
- `GET /pets/:petId` → pet still exists, `tags` array no longer contains the deleted tag.

### 5.4 Validation

- `name` missing → 400; `name` > 100 chars → 400; `color` > 20 chars → 400.

---

## 6. Pet Vaccination (`/pet-vaccinations`)

> Known caveat from the catalog: **no ownership scope** is enforced on this resource. Tests should codify the **current behavior** and tag the ownership gaps as **known issues** so QA reports them, not so tests fail falsely.

### 6.1 Create — happy path

- Bob creates a vaccination with `petId` = Alice's pet.
  - Current behavior: **200/201 succeeds** (no scope).
  - Playwright assertion: record the response; annotate `test.fail` or `test.info().annotations.push({ type: 'known-issue', description: 'pet-vaccination not ownership-scoped' })`.

### 6.2 Validation

| Case | Expected |
|---|---|
| missing `petId` | 400 |
| `petId` not uuid | 400 |
| `petId` not found | 404 |
| `dateAdministered` not a date | 400 |
| `dateExpires < dateAdministered` | product decision — document what the API actually does |

### 6.3 List / read / delete

- Bob GETs vaccinations he created on Alice's pet → visible (confirms no scoping).
- Delete returns 200/204.

---

## 7. Pet Share (`/pets/:petId/share`)

### 7.1 Share — happy path

- Alice `POST /pets/:petId/share { userId: bobId, permission: 'read' }` → 201.
- `GET /pets/:petId/share` as Alice lists one share with `userId: bobId`.
- `GET /pets` as Bob now lists `petA` (see 4.5 step 6).
- `GET /pets/:id` as Bob → 200 read-only view.

### 7.2 Share — owner guard

| Case | Expected |
|---|---|
| Non-owner shares | 404 (Bob tries to share Alice's pet) |
| Share with self (`userId === authUser`) | 400 |
| Share twice (same pet + user) | 409 (unique constraint) |
| Invalid `userId` uuid | 400 |
| `permission: 'write'` | 400 (only `'read'` allowed in DTO enum) |

### 7.3 Revoke

- Alice `DELETE /pets/:petId/share/:userId` → 204.
- `GET /pets` as Bob → `petA` gone again.
- `GET /pets/:id` as Bob → 404.
- Revoke a non-existent share → 404.
- Bob tries to revoke a share on Alice's pet → 404.

### 7.4 Shared user cannot mutate or re-share

- Bob (shared read) `PATCH /pets/:id` → 404.
- Bob (shared read) `DELETE /pets/:id` → 404.
- Bob (shared read) `POST /pets/:petId/share { userId: charlieId }` → 404.

---

## 8. Pet Transfer (`/pets/:petId/transfer`)

### 8.1 Transfer — happy path

1. Alice owns `petA`.
2. Alice `POST /pets/:petId/transfer { newOwnerId: bobId }` → 200, response `userId === bobId`.
3. `GET /pets/:id` as Alice → 404 (no longer owner or shared).
4. `GET /pets/:id` as Bob → 200.
5. Bob can now transfer `petA` further; Alice cannot.

### 8.2 Transfer — negative

| Case | Expected |
|---|---|
| Non-owner attempts transfer | 404 |
| `newOwnerId` does not exist | 404 |
| `newOwnerId === authUser` | 400 |
| `newOwnerId` not a uuid | 400 |
| Invalid `petId` uuid | 400 |
| `petId` does not exist | 404 |

### 8.3 Transfer — side effects

- After transfer, existing shares on the pet: verify whether they persist or are wiped (document actual behavior; either is a valid product choice, but test should lock current behavior so regressions surface).

---

## 9. Appointment + Reminder (`/appointments`, `/reminders`)

### 9.1 Create — transaction

- Alice `POST /appointments` with `{ petId, date: '2030-01-01T10:00:00Z', reminderSendAt: '2030-01-01T09:00:00Z', notes: 'checkup' }`.
- Expect 201. Response includes `reminders: [{ id, sendAt, sent: false }]`.
- `GET /reminders` as Alice contains the new reminder.

### 9.2 Create — reminder must precede appointment

- `reminderSendAt = date` → 400.
- `reminderSendAt > date` → 400.

### 9.3 Create — pet ownership required

- Alice tries to create an appointment with Bob's `petId` → 404.
- Appointment + reminder must be created atomically: force a failure in the reminder creation (if possible via invalid reminder data that sneaks past DTO) and verify no appointment row exists. Otherwise document that unit of work is covered in existing e2e.

### 9.4 Scope — owner-only list/read/delete

- Bob `GET /appointments` → empty (or only his own).
- Bob `GET /appointments/:aliceApptId` → 404.
- Bob `DELETE /appointments/:aliceApptId` → 404.

### 9.5 Cascade delete of reminders

- Alice creates appointment + captures `reminderId`.
- Alice `DELETE /appointments/:id` → 204.
- `GET /reminders/:reminderId` as Alice → 404.
- `GET /reminders` as Alice → reminder gone.

### 9.6 Reminder transitive scoping

- Bob `GET /reminders/:aliceReminderId` → 404.

---

## 10. Admin (`/admin/*`)

Use `adminToken` from 1.

### 10.1 Authz

| Caller | Endpoint | Expected |
|---|---|---|
| no token | any `/admin/*` | 401 |
| `aliceToken` (role=user) | `GET /admin/pets` | 403 |
| `adminToken` | `GET /admin/pets` | 200 |

### 10.2 Admin can see all pets

- Alice creates `petA`, Bob creates `petB`.
- `GET /admin/pets` as admin → list contains both.
- `limit=1` returns exactly 1; `total` reflects real count.
- `limit=9999` should be clamped to 200 (confirm via `limit` in response echoed back).

### 10.3 Admin read with `withDeleted`

- Alice soft-deletes `petA`.
- `GET /admin/pets?withDeleted=true` → contains `petA`.
- `GET /admin/pets` (no flag) → does **not** contain `petA`.
- `GET /admin/pets/:petA` (no flag) → 404.
- `GET /admin/pets/:petA?withDeleted=true` → 200.

### 10.4 Force restore

- `PATCH /admin/pets/:petA/force-restore` → 200, `dateDeleted: null`.
- Calling it on a non-deleted pet → 400.
- Calling it on unknown id → 404.

### 10.5 Hard delete

- `DELETE /admin/pets/:id/hard` → 204.
- Subsequent `GET /admin/pets/:id?withDeleted=true` → 404.
- `GET /admin/pets/:id/force-restore` impossible (gone forever).

---

## 11. Audit (`/admin/audit-logs`)

### 11.1 Authz

Same matrix as 10.1.

### 11.2 Every write produces an audit row

Run this cluster of writes, then assert the audit contains one row per action:

| Action | Triggered by |
|---|---|
| `create` resource=pet | Alice `POST /pets` |
| `update` resource=pet | Alice `PATCH /pets/:id` |
| `soft_delete` resource=pet | Alice `DELETE /pets/:id` |
| `restore` resource=pet | Alice `PATCH /pets/:id/restore` |

Query `GET /admin/audit-logs?resource=pet&resourceId=:petId` as admin → array length 4, actions in order (or at least the set matches).

### 11.3 Snapshot integrity

- Parse `snapshot` JSON for each row.
- Assert it is the **post-write** state (e.g., the update snapshot contains the new `name`).
- Assert `actorId === aliceId` for Alice's actions and `null` (or admin id) for admin actions.

### 11.4 Filter correctness

- `resource=nonexistent` → 200 with empty data.
- `action=soft_delete` only → all rows have that action.
- Admin hard-delete: confirm whether an audit row is written (document current behavior).

---

## 12. Access-Control Decision Matrix (cross-cutting)

One Playwright suite that loops over every (caller, endpoint) pair and checks the expected status. This protects against regressions where an ACL hook is removed.

```
callers: [anon, alice, bob, admin]
endpoints: [listed in section 2]

For each pair, the expected status is derived from:
  - anon  → 401 on every non-public endpoint
  - alice → 200 on her own resources, 404 on bob's non-shared, 403 on admin/*
  - bob   → symmetric to alice
  - admin → 200 on admin/*, same as a normal user on /pets (unless admin is also owner)
```

The goal is not exhaustive data assertions — just status codes — so the suite is fast and catches "oops, I removed `OwnerScopeHook`" regressions.

---

## 13. Cross-cutting checks

These should be implemented once and run against every protected endpoint via a data-driven loop:

1. **Missing bearer** → 401.
2. **Malformed bearer** (`Authorization: Bearer not-a-jwt`) → 401.
3. **Expired bearer** — pre-generate one with `exp` in the past (or wait; rate-limited) → 401.
4. **Wrong-signature bearer** (sign with a different secret) → 401.
5. **`whitelist: true` enforcement** — send a body with an extra unknown field on any POST/PATCH; expect 2xx and response lacks that field.
6. **`transform: true`** — send `age: "7"` (string) on `POST /pets`; expect 201 and response `age` is the number `7`.
7. **Content-Type** — send a POST with `Content-Type: text/plain` and JSON body → expect 400/415.
8. **CORS** — preflight `OPTIONS /pets` with `Origin: http://evil.test` → confirm headers align with `ALLOWED_ORIGINS`.
9. **Helmet** — assert response headers include `X-DNS-Prefetch-Control`, `X-Frame-Options`, etc.
10. **Swagger** — `GET /api` returns the Swagger HTML; `GET /api-json` (if configured) returns a valid OpenAPI doc listing the endpoints in section 2.

---

## 14. Playwright skeletons

### 14.1 Auth helper

```ts
// tests/helpers/auth.ts
import { APIRequestContext } from '@playwright/test';

export async function signup(req: APIRequestContext, opts: { email: string; password?: string; role?: 'user' | 'admin' }) {
  const res = await req.post('/auth/signup', {
    data: { password: 'Pa55word!', ...opts },
  });
  if (!res.ok()) throw new Error(`signup failed: ${res.status()} ${await res.text()}`);
  return res.json() as Promise<{ id: string; email: string; role: 'user' | 'admin'; accessToken: string }>;
}

export const authHeader = (token: string) => ({ Authorization: `Bearer ${token}` });
```

### 14.2 Pet ownership test

```ts
// tests/pet-ownership.spec.ts
import { test, expect, request } from '@playwright/test';
import { signup, authHeader } from './helpers/auth';

test.describe('Pet ownership & sharing', () => {
  test('non-owner gets 404, shared user gets 200 read-only', async () => {
    const api = await request.newContext({ baseURL: 'http://localhost:3000' });
    const ts = Date.now();
    const alice = await signup(api, { email: `alice+${ts}@qa.test` });
    const bob   = await signup(api, { email: `bob+${ts}@qa.test` });

    // Alice creates a pet
    const create = await api.post('/pets', {
      headers: authHeader(alice.accessToken),
      data: { name: 'Rex', species: 'dog', age: 3, status: 'active' },
    });
    expect(create.status()).toBe(201);
    const pet = await create.json();
    expect(pet.userId).toBe(alice.id);

    // Bob cannot see it
    const bobRead = await api.get(`/pets/${pet.id}`, { headers: authHeader(bob.accessToken) });
    expect(bobRead.status()).toBe(404);

    // Alice shares read with Bob
    const share = await api.post(`/pets/${pet.id}/share`, {
      headers: authHeader(alice.accessToken),
      data: { userId: bob.id, permission: 'read' },
    });
    expect(share.status()).toBe(201);

    // Bob can read now
    const bobRead2 = await api.get(`/pets/${pet.id}`, { headers: authHeader(bob.accessToken) });
    expect(bobRead2.status()).toBe(200);

    // Bob still cannot mutate
    const bobPatch = await api.patch(`/pets/${pet.id}`, {
      headers: authHeader(bob.accessToken),
      data: { id: pet.id, name: 'Hacked' },
    });
    expect(bobPatch.status()).toBe(404);
  });
});
```

### 14.3 Unauthorized cross-cutting loop

```ts
// tests/unauthorized.spec.ts
import { test, expect, request } from '@playwright/test';

const protectedEndpoints: Array<{ method: 'get' | 'post' | 'patch' | 'delete'; path: string }> = [
  { method: 'get',    path: '/pets' },
  { method: 'post',   path: '/pets' },
  { method: 'get',    path: '/appointments' },
  { method: 'post',   path: '/appointments' },
  { method: 'get',    path: '/reminders' },
  { method: 'get',    path: '/admin/pets' },
  { method: 'get',    path: '/admin/audit-logs' },
  // ...add the full list from section 2
];

for (const { method, path } of protectedEndpoints) {
  test(`${method.toUpperCase()} ${path} without token → 401`, async () => {
    const api = await request.newContext({ baseURL: 'http://localhost:3000' });
    const res = await api[method](path, { data: {} });
    expect(res.status()).toBe(401);
  });
}
```

### 14.4 Audit snapshot assertion

```ts
test('each pet mutation produces one audit row with correct snapshot', async ({ }) => {
  // ... create admin + alice, create pet, update, delete, restore
  const logs = await api.get(`/admin/audit-logs?resource=pet&resourceId=${petId}`, {
    headers: authHeader(admin.accessToken),
  });
  const body = await logs.json();
  const actions = body.data.map((r: { action: string }) => r.action).sort();
  expect(actions).toEqual(['create', 'restore', 'soft_delete', 'update']);

  const updateRow = body.data.find((r: { action: string }) => r.action === 'update');
  expect(JSON.parse(updateRow.snapshot).name).toBe('new-name');
  expect(updateRow.actorId).toBe(alice.id);
});
```

---

## 15. QA Execution Checklist

Use this as the per-build QA run:

- [ ] App boots cleanly (`yarn workspace sample-server start:dev`)
- [ ] Swagger UI reachable at `/api`
- [ ] Section 3 (Auth) — all green
- [ ] Section 4 (Pet CRUD) — all green, including ownership matrix in 4.6
- [ ] Section 5 (Tag CRUD)
- [ ] Section 6 (PetVaccination) — known ownership gap annotated
- [ ] Section 7 (Pet Share) including revoke + cannot-mutate
- [ ] Section 8 (Pet Transfer) including side effects on shares
- [ ] Section 9 (Appointment + Reminder) including cascade and transitive scoping
- [ ] Section 10 (Admin)
- [ ] Section 11 (Audit) including snapshot integrity
- [ ] Section 12 decision matrix green
- [ ] Section 13 cross-cutting green
- [ ] No 5xx anywhere (all failures are 4xx with structured error bodies)

---

## 16. Known Issues to Re-check Each Run

Tests should **not** silently pass over these — annotate them as `known-issue` so the QA report surfaces them:

1. **`/auth/signup` accepts `role: 'admin'` from any unauthenticated caller** (dev shortcut). Should be removed in prod DTO.
2. **`/pet-vaccinations` has no ownership scope** — any authenticated user can create/list/read/delete any pet's vaccinations.
3. **`/tags` is a global catalog** — any user can rename/delete another user's tag. Confirm whether this is intentional.

If any of these are fixed, flip the test expectation from `.fail` to the new correct status — don't delete the test.
