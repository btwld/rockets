import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  InjectDynamicRepository,
  RepositoryInterface,
  Where,
} from '@bitwild/rockets-repository';
import type { AuthorizedUser } from '@bitwild/rockets-core';
import { PET_ENTITY_KEY } from './pet.constants';
import { PetEntity } from './pet.entity';
import { TAG_ENTITY_KEY } from '../tag/tag.constants';
import { TagEntity } from '../tag/tag.entity';

interface RequestShape {
  method: string;
  user?: AuthorizedUser;
  params?: { petId?: string };
  body?: { tagId?: unknown };
}

/**
 * Pre-handler authorization for the `pets/:petId/tags` junction.
 *
 * Runs as a NestJS Guard so that any exception it raises propagates with
 * the intended HTTP status — the membrane / CRUD wrapping layer that sits
 * around `Before*` hooks would otherwise re-wrap a `BadRequestException`
 * or `NotFoundException` into an opaque `CrudQueryException` (500).
 *
 * Responsibilities:
 *
 * 1. Require an authenticated actor (`401` otherwise).
 * 2. Validate that the actor owns the parent pet referenced by `:petId`
 *    (`404` otherwise — same reply for "missing" and "not yours" so a
 *    stranger cannot probe pet existence).
 * 3. On `POST`, validate that `body.tagId` references an existing tag in
 *    the catalog (`400` with a descriptive message). The shared scope
 *    hook still stamps `petId` from the URL onto the payload — DTO
 *    validation handles UUID format separately.
 *
 * This is the recommended pattern whenever a hook needs to abort a
 * request with a non-500 status: throw from a guard instead of from a
 * `Before*` repo hook so the framework's exception filter receives the
 * `HttpException` unwrapped.
 */
@Injectable()
export class PetTagPathScopeGuard implements CanActivate {
  constructor(
    @InjectDynamicRepository(PET_ENTITY_KEY)
    private readonly petRepo: RepositoryInterface<PetEntity>,
    @InjectDynamicRepository(TAG_ENTITY_KEY)
    private readonly tagRepo: RepositoryInterface<TagEntity>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<RequestShape>();

    const actorId = req?.user?.id;
    if (!actorId) {
      throw new UnauthorizedException(
        'Authenticated actor required to manage pet tags',
      );
    }

    const petId = req?.params?.petId;
    if (typeof petId !== 'string' || petId.length === 0) {
      throw new NotFoundException('petId path parameter is required');
    }

    const pet = await this.petRepo.findOne({
      where: Where.and(
        Where.eq<PetEntity>('id', petId),
        Where.eq<PetEntity>('userId', actorId),
      ),
    });
    if (!pet) {
      throw new NotFoundException(`Pet ${petId} not found`);
    }

    if (req.method === 'POST') {
      const tagId =
        typeof req.body?.tagId === 'string' ? req.body.tagId : undefined;
      if (tagId) {
        const tag = await this.tagRepo.findOne({
          where: Where.eq<TagEntity>('id', tagId),
        });
        if (!tag) {
          throw new BadRequestException(`Unknown tag id: ${tagId}`);
        }
      }
    }

    return true;
  }
}
