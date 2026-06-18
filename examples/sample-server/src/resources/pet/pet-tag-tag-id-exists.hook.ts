import {
  BadRequestException,
  Injectable,
  PlainLiteralObject,
} from '@nestjs/common';
import {
  InjectDynamicRepository,
  type RepositoryInterface,
  Where,
} from '@bitwild/rockets-repository';
import {
  EntityHook,
  type EntityHookContext,
  PassthroughEntityHookBase,
} from '@bitwild/rockets-core';
import { PetTagEntity } from './pet-tag.schema';
import { TagEntity } from '../tag/tag.zod';
import type { Tag } from '../tag/tag.schema';

/**
 * Ensures `tagId` references an existing {@link TagEntity} row before the
 * junction insert, so unknown ids surface as `400 Bad Request` instead of
 * an FK error wrapped as `500`.
 */
@EntityHook({ entity: PetTagEntity })
@Injectable()
export class PetTagTagIdExistsHook extends PassthroughEntityHookBase<PlainLiteralObject> {
  constructor(
    @InjectDynamicRepository(TagEntity)
    private readonly tagRepo: RepositoryInterface<Tag>,
  ) {
    super();
  }

  override async beforeCreate(
    payload: PlainLiteralObject,
    ctx?: EntityHookContext,
  ): Promise<PlainLiteralObject> {
    const tagId = payload.tagId;
    if (typeof tagId !== 'string' || tagId.length === 0) {
      return payload;
    }

    const existing = await this.tagRepo.findOne({
      where: Where.eq<Tag>('id', tagId),
    });

    if (!existing) {
      throw new BadRequestException(`Unknown tag id: ${tagId}`);
    }

    return payload;
  }
}
