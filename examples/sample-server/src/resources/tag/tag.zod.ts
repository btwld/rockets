import { zodResource } from '../../zod-bindings';
import { tagSchema } from './tag.schema';

/**
 * Fully zod-compiled tag resource: nestjs-zod DTOs AND the `TagEntity`
 * class are generated from `tagSchema` — there is no handwritten
 * persistence or DTO code behind `/tags`. The handwritten twin
 * (tag-classic.resource.ts, served at `/tags-classic`) exists for
 * side-by-side comparison and as the control for the golden Swagger
 * e2e (test/zod-swagger-golden.e2e-spec.ts).
 */
export const tagZodResource = zodResource({
  name: 'Tag',
  schema: tagSchema,
  table: 'tags',
  // key / path / tags derived exactly like the handwritten resource.
  operations: ['list', 'read', 'create', 'update'],
});

/**
 * Generated entity class (named `TagEntity`, table `tags`). Exported as
 * the app-wide tag entity: the pet↔tag junction (`@ManyToOne`), the
 * tag-exists hook (`@InjectDynamicRepository`), and relations all
 * reference this class. For static row typing use `Tag`
 * (z.infer of `tagSchema`) — never the class.
 */
export const TagEntity = tagZodResource.zod.entity;
