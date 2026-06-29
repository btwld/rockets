import { Type } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import { Expose, Type as TypeTransform } from 'class-transformer';
import { CrudResponsePaginatedDto } from '@concepta/nestjs-crud';

/**
 * Per-resource cache so repeated calls with the same resource DTO return
 * the same generated class (important — controller generation compares by
 * reference in some downstream code paths).
 */
const cache = new WeakMap<Type, Type>();

/**
 * Build a concrete paginated response DTO for a given resource DTO.
 *
 * Equivalent to the hand-written pattern:
 *
 * ```ts
 * class PetPaginatedDto extends CrudResponsePaginatedDto<PetResponseDto> {
 *   @Expose() @Type(() => PetResponseDto)
 *   @ApiProperty({ type: [PetResponseDto] })
 *   declare data: PetResponseDto[];
 * }
 * ```
 *
 * Consumers can opt out by providing `dto.paginated` explicitly on the
 * `RocketsResourceDefinition`.
 */
export function createPaginatedDto<TResource>(
  resourceDto: Type<TResource>,
  className?: string,
): Type {
  const cached = cache.get(resourceDto);
  if (cached) return cached;

  // Named class so Swagger shows something reasonable, and error stacks
  // include the resource name instead of "anonymous".
  const name = className ?? `${resourceDto.name}PaginatedDto`;
  const generated = {
    [name]: class extends CrudResponsePaginatedDto<TResource> {
      declare data: TResource[];
    },
  }[name] as Type;

  // Apply decorators programmatically — equivalent to hand-writing them.
  ApiProperty({ type: [resourceDto] })(generated.prototype, 'data');
  Expose()(generated.prototype, 'data');
  TypeTransform(() => resourceDto)(generated.prototype, 'data');

  cache.set(resourceDto, generated);
  return generated;
}
