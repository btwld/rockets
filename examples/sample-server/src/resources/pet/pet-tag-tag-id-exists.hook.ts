import { BadRequestException, Injectable } from '@nestjs/common';
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
import { PetTagEntity } from './pet-tag.entity';
import { TagEntity } from '../tag/tag.entity';

/**
 * Ensures `tagId` references an existing {@link TagEntity} row before the
 * junction insert, so unknown ids surface as `400 Bad Request` instead of
 * an FK error wrapped as `500`.
 */
@EntityHook({ entity: PetTagEntity })
@Injectable()
export class PetTagTagIdExistsHook extends PassthroughEntityHookBase<PetTagEntity> {
  constructor(
    @InjectDynamicRepository(TagEntity)
    private readonly tagRepo: RepositoryInterface<TagEntity>,
  ) {
    super();
  }

  override async beforeCreate(
    payload: PetTagEntity,
    ctx?: EntityHookContext,
  ): Promise<PetTagEntity> {
    const tagId = payload.tagId;
    if (typeof tagId !== 'string' || tagId.length === 0) {
      return payload;
    }

    const existing = await this.tagRepo.findOne({
      where: Where.eq<TagEntity>('id', tagId),
    });

    if (!existing) {
      throw new BadRequestException(`Unknown tag id: ${tagId}`);
    }

    return payload;
  }
}
