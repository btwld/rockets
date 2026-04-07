# HTTP surface — `@bitwild/rockets` (`packages/rockets-server`)

Living checklist for **regressão e2e**. O pacote expõe poucas rotas próprias; o resto é guard global + providers que a app de consumo adiciona.

## Rotas do `RocketsModule` (padrão)

| METHOD | Path | Controller | Casos e2e (onde viver) |
|--------|------|------------|-------------------------|
| GET | `/me` | `MeController` | 200 com token; 401 sem/inválido; metadata vazia `{}` |
| PATCH | `/me` | `MeController` | 200 update; **400** validação `userMetadata` (DTO dinâmico); 401 |

## Overrides (`RocketsOptionsExtrasInterface`)

| Opção | Comportamento esperado | Coberto em |
|-------|------------------------|------------|
| `disableController.me: true` | `GET`/`PATCH` `/me` → **404** | `rockets-server-overrides.e2e-spec.ts` |
| `handlers.getUserMetadata` / `handlers.upsertUserMetadata` | Substitui handlers CQRS registados pelo `RocketsModule` | `rockets-user-metadata-handler-overrides.e2e-spec.ts` |
| `controllers: [...]` (substituir lista default) | Mesmo efeito que desligar `MeController` se lista não o incluir | Opcional / app-specific |
| `enableGlobalGuard: false` | Sem `APP_GUARD` `AuthServerGuard`; rotas sem outro guard podem ser anónimas | `rockets-enable-global-guard.e2e-spec.ts` |

## Auth global (`AuthServerGuard`)

Cenários de token (401, mensagens) e `@AuthPublic()` estão em [`rockets.module.e2e-spec.ts`](../rockets.module.e2e-spec.ts) com `TestController`.

## Outros ficheiros e2e existentes

- [`__e2e__/user.e2e-spec.ts`](./user.e2e-spec.ts) — integração `/me` + metadata
- [`__e2e__/user-metadata.e2e-spec.ts`](./user-metadata.e2e-spec.ts)
- [`__e2e__/dynamic-user-metadata.e2e-spec.ts`](./dynamic-user-metadata.e2e-spec.ts)
- [`../rockets-for-root-async.e2e-spec.ts`](../rockets-for-root-async.e2e-spec.ts) — `RocketsModule.forRootAsync`
- [`../rockets-user-metadata-handler-overrides.e2e-spec.ts`](../rockets-user-metadata-handler-overrides.e2e-spec.ts) — `handlers.getUserMetadata` / `handlers.upsertUserMetadata`

## Helper partilhado

- [`helpers/rockets-server-e2e-app.factory.ts`](helpers/rockets-server-e2e-app.factory.ts) — `RocketsServerE2eUserMetadataRepoModule`

## Fora de âmbito

- `examples/*` — não faz parte desta matriz.
