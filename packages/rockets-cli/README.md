# Rockets CLI

CLI tool for generating Rockets SDK module patterns (entity, DTOs, services, controller, module) following the Development Guide.

## Install & Build

```bash
# From monorepo root
yarn install
yarn cli:build
```

## Usage

```bash
# General
node packages/rockets-cli/dist/cli.js --help

# Generate a full module structure
node packages/rockets-cli/dist/cli.js generate:module \
  -n Book \
  -f "title:string!,subtitle:string?,category:string!" \
  -o src/modules
```

- **-n, --name**: Entity name in PascalCase (e.g., Book)
- **-f, --fields**: Comma-separated fields in the format `name:type` with optional requiredness marker:
  - `name:string!` required (default if omitted)
  - `name:string?` optional
- Supported types: `string`, `number`, `boolean`, `date`, `json` (mapped to TS types and TypeORM columns)
- **-o, --outDir**: Output directory (default: `src/modules`)

## Field Requiredness Propagation

- Entity columns: `nullable` reflects optional vs required
- Interfaces: `field` vs `field?`
- DTOs:
  - `ApiProperty.required` set correctly
  - Optional fields include `@IsOptional()`
  - CreateDto picks only required fields (plus name/status), UpdateDto picks all

## Example

```bash
yarn cli:build
yarn cli:sample  # generates Book sample into packages/rockets-cli/samples/src/modules/book
```

Generated structure (example):

```
{entity}/
├─ {entity}.entity.ts
├─ {entity}.interface.ts
├─ {entity}.dto.ts
├─ {entity}.exception.ts
├─ {entity}-model.service.ts
├─ {entity}-typeorm-crud.adapter.ts
├─ {entity}.crud.service.ts
├─ {entity}.crud.controller.ts
├─ {entity}-access-query.service.ts
├─ {entity}.types.ts
├─ {entity}.module.ts
└─ index.ts
```

## Notes

- Templates live in `src/templates`
- The generator can be extended with additional per-pattern commands in future (entity-only, dto-only, etc.)
