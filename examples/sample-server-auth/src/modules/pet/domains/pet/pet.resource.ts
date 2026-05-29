import { applyDecorators } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { defineResource } from '@bitwild/rockets';
import {
  AccessControlQuery,
  AccessControlReadMany,
  AccessControlReadOne,
  AccessControlCreateOne,
  AccessControlUpdateOne,
  AccessControlDeleteOne,
} from '@bitwild/rockets-access-control';

import { PetEntity } from './pet.entity';
import { PetVaccinationEntity } from '../pet-vaccination/pet-vaccination.entity';
import { PetAppointmentEntity } from '../pet-appointment/pet-appointment.entity';
import { PetCreateDto, PetResponseDto, PetUpdateDto } from './pet.dto';
import { PetResource } from './pet.types';
import { PetCreateHandler } from './pet-create.handler';
import { PetListHandler } from './pet-list.handler';
import { PetModelService } from './pet-model.service';
import { PetAccessQueryService } from './pet-access-query.service';

/**
 * Class-level decorators applied to the generated pet controller:
 * - `AccessControlQuery` resolves the per-route `CanAccess` service
 * - Swagger tag + bearer auth for documentation
 *
 * Global guard is wired in `app.module.ts` (accessControl block). Do NOT
 * add `@UseGuards(AccessControlGuard)` here — see
 * `rockets-auth.module-definition.ts` for why (strict-resolve scope).
 */
const petControllerDecorators = applyDecorators(
  AccessControlQuery({ service: PetAccessQueryService }),
  ApiTags('Pets'),
  ApiBearerAuth(),
);

export const petResource = defineResource({
  entity: PetEntity,
  path: 'pets',
  tags: ['Pets'],
  // No per-resource `persistence`: the bundle inherits the root
  // `repository` adapter declared on `RocketsModule.forRoot` in
  // `app.module.ts` (a single `defineTypeOrmRepository` bootstrap shared
  // with `defineRocketsAuth`). The planner still registers
  // `DYNAMIC_REPOSITORY_TOKEN_pet` for `PetEntity`.
  dto: {
    response: PetResponseDto,
    create: PetCreateDto,
    update: PetUpdateDto,
  },
  relations: (relation) => [
    relation(PetVaccinationEntity, 'vaccinations'),
    relation(PetAppointmentEntity, 'appointments'),
  ],
  decorators: [petControllerDecorators],
  operations: {
    list: {
      handler: PetListHandler,
      decorators: [AccessControlReadMany(PetResource.Many)],
    },
    read: {
      decorators: [AccessControlReadOne(PetResource.One)],
    },
    create: {
      handler: PetCreateHandler,
      decorators: [AccessControlCreateOne(PetResource.One)],
    },
    update: {
      decorators: [AccessControlUpdateOne(PetResource.One)],
    },
    delete: {
      decorators: [AccessControlDeleteOne(PetResource.One)],
    },
  },
  // `PetModelService` injects `@InjectDynamicRepository(PetEntity)` so it
  // must share the resource bundle's scope (where the dynamic-repository
  // token is registered). `RocketsCoreModule` is `@Global()` and re-exports
  // these via `createCoreExports`, so it remains injectable from any other
  // module that needs it. `JwtAuthenticatedUserLocal` and `UseCrudLocals`
  // were removed: the v8 `CrudLocalsInterceptor` is broken upstream, so
  // both handlers read the authenticated user from `ActorOverlay` instead.
  providers: [PetModelService],
});

export function createPetResource(): typeof petResource {
  return petResource;
}
