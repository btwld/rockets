import { UseGuards } from '@nestjs/common';
import { defineResource } from '@bitwild/rockets';
import { ApiParam } from '@nestjs/swagger';
import { Operation } from '@concepta/nestjs-common';
import { PetTagEntity } from './pet-tag.entity';
import { PetEntity } from './pet.entity';
import { TagEntity } from '../tag/tag.entity';
import { PetTagCreateDto, PetTagResponseDto } from './pet-tag.dto';
import { PET_TAG_ENTITY_KEY } from './pet-tag.constants';
import { PetTagPathScopeHook } from './pet-tag-path-scope.hook';
import { PetTagPathScopeGuard } from './pet-tag-path-scope.guard';

const petIdParam = ApiParam({
  name: 'petId',
  type: 'string',
  format: 'uuid',
  required: true,
  description: 'Pet id (from the URL path).',
});

const junctionIdParam = ApiParam({
  name: 'id',
  type: 'string',
  format: 'uuid',
  required: true,
  description: 'Junction row id (pet–tag link).',
});

/**
 * Junction CRUD between {@link PetEntity} and {@link TagEntity}.
 *
 * Exposes:
 *
 * - `GET    /pets/:petId/tags`        — list tags attached to a pet
 * - `POST   /pets/:petId/tags`        — attach a tag (`{ tagId }`)
 * - `DELETE /pets/:petId/tags/:id`    — detach a tag (junction row id)
 *
 * Update is intentionally absent — junction rows are immutable
 * `(petId, tagId)` pairs; mutating either side would just be
 * delete + create on the same row.
 *
 * The `relation()` declarations preserve the type-level link to both
 * sides without re-declaring write semantics; eager loading is driven
 * by the entity (`tag` ManyToOne `eager: true`) so the response
 * already carries a `TagResponseDto` preview without an extra round
 * trip to `/tags/:id`.
 */
export const petTagResource = defineResource({
  key: PET_TAG_ENTITY_KEY,
  entity: PetTagEntity,
  path: 'pets/:petId/tags',
  tags: ['Pet Tags'],
  dto: {
    response: PetTagResponseDto,
    create: PetTagCreateDto,
  },
  operations: [Operation.List, Operation.Read, Operation.Create, Operation.Delete],
  relations: (relation) => [
    relation(() => PetEntity, 'pet'),
    relation(() => TagEntity, 'tag'),
  ],
  hooks: [PetTagPathScopeHook],
  providers: [PetTagPathScopeGuard],
  // Path carries an extra `:petId` segment beyond the conventional
  // `:id`. The CRUD context overlay validates every URL param against
  // this map, so unlisted params raise a 400 before the request ever
  // hits the controller. `petId` is declared as a uuid so the param
  // pipeline accepts it; the path scope hook reads it directly from
  // `ctx.params` to filter persistence queries.
  //
  // `PetTagPathScopeGuard` runs *before* the CRUD pipeline and is the
  // only place that may throw `HttpException` to abort the request
  // with the intended status (401/404/400). The hook layer is wrapped
  // by the upstream membrane and would mask non-500 statuses.
  //
  // `request.params` drives validation; OpenAPI still needs explicit
  // `@ApiParam` for nested path segments (e.g. `petId`) because the
  // generated CRUD controller does not always document every `:` in
  // the path. See `petIdParam` / `junctionIdParam` on each operation.
  overrides: {
    operations: {
      [Operation.List]: { extraDecorators: [petIdParam] },
      [Operation.Create]: { extraDecorators: [petIdParam] },
      [Operation.Read]: { extraDecorators: [petIdParam, junctionIdParam] },
      [Operation.Delete]: { extraDecorators: [petIdParam, junctionIdParam] },
    },
    controller: {
      extraDecorators: [
        UseGuards(PetTagPathScopeGuard)
      ],
      request: {
        params: {
          id: { field: 'id', type: 'uuid', primary: true },
          petId: { field: 'petId', type: 'uuid' },
        },
      },
    },
  },
});
