# Sample Server — Postman Collection

`sample-server.postman_collection.json` covers every HTTP route exposed
by the sample server, with auto-extraction of tokens and resource IDs
between requests.

## Setup

1. Boot the sample server:

   ```bash
   yarn workspace sample-server start:dev
   ```

   Default URL: `http://localhost:3000`.

2. Import the JSON file in Postman:
   *File → Import → upload `sample-server.postman_collection.json`*.

3. (Optional) Adjust the `baseUrl` collection variable if you run on a
   different host/port. Defaults to `http://localhost:3000`.

## How variables auto-fill

The collection uses Postman test scripts to push response data into
collection variables, so subsequent requests pick them up automatically:

| Endpoint | Sets |
|---|---|
| `POST /auth/signup` | `accessToken`, `userId` |
| `POST /auth/login` | `accessToken` |
| `GET /me` | `userId` |
| `POST /pets` | `petId` |
| `POST /pets/:petId/tags` | `petTagId` |
| `POST /tags` | `tagId` |
| `POST /pet-vaccinations` | `vaccinationId` |
| `POST /appointments` | `appointmentId` |
| `POST /reminders` | `reminderId` |
| `POST /pets/:petId/share` | `shareUserId` |

The collection-level Bearer auth uses `{{accessToken}}`. Public routes
(`/auth/signup`, `/auth/login`) override this with `noauth` so they
work before you have a token.

## Recommended order on a fresh DB

1. `Auth → POST /auth/signup` (or `POST /auth/login` if the user already exists).
2. `Tags → POST /tags` (so `tagId` is set before attaching to a pet).
3. `Pets → POST /pets`.
4. `Pet Tags → POST /pets/:petId/tags` (uses both `petId` and `tagId`).
5. Anything else — `petId` and `tagId` are already populated.

## Troubleshooting

### `401 Invalid token` after signup/login

Open Postman's console (`View → Show Postman Console` or `Ctrl/Cmd+Alt+C`)
and re-run the request. The collection logs:

```
→ accessToken (first 30): eyJhbGciOiJIUzI1NiIsInR5cCI6...
signup status: 201
signup body: { "id": "...", "accessToken": "..." }
✓ accessToken stored: eyJhbGciOiJIUzI1NiIsInR5cCI6...
```

Diagnose by checking each line:

| Symptom | Cause | Fix |
|---|---|---|
| `accessToken is EMPTY` on a protected request | The signup/login script never ran or the response had no token. | Run signup again. Check the response body in Postman to see what was returned. |
| `accessToken stored:` shows a value but `/me` still 401s | **Wrong port.** Sample server defaults to `3000`; the older build hardcoded `3001`. | Confirm the running server prints `listening on http://localhost:3000`. Update the `baseUrl` collection variable to match. |
| 401 even with a valid-looking token | Server was restarted (in-memory SQLite, `dropSchema: true`) — the user from signup is gone. | Re-run signup; the previous token is for a user that no longer exists. |
| Signup returned 409 | Email already exists from a previous run. | Use `POST /auth/login` instead, or change the email in the body. |

### Variable scope precedence (Postman)

Postman resolves `{{accessToken}}` in order:
**data → environment → collection → global**.

If you have an *environment* selected with an empty `accessToken`, it
overrides the collection variable. Either deselect the environment, or
also set the variable in the active environment (the test scripts now
write to **both** scopes when one is active).

### `404` on sub-resource routes

Confirm `petId` is populated (run `POST /pets` first) and the parent
pet still exists. Soft-delete is reversible via
`POST /pets/:petId/restore`.

### `400` validation errors

Adjust the request body to match the DTO. Field shapes match Swagger
UI at `{{baseUrl}}/api`.

## Swagger UI

The sample server also serves Swagger UI at `/api`. Use Postman for
flow testing (auto-token, chained IDs); use Swagger for browsing the
generated API reference.
