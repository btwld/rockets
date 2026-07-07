import { z } from 'zod';
import { rocketsFieldMeta } from '@bitwild/rockets-core/zod';
import { zodResource } from '../../zod-bindings';

/**
 * Library pair — the in-app showcase of the zod layer features the tag
 * resource cannot demonstrate:
 *
 * - `dto` field roles: `isbn` is create-only (immutable on PATCH),
 *   `internalNote` is write-only (never serialized in responses).
 * - `relation` meta: `book.authorId` references {@link authorSchema};
 *   the generated entity gains the FK column + eager `@ManyToOne`, and
 *   `expose: true` projects the author's response shape into the book
 *   response document.
 * - keyed `operations` form with full defineResource parity:
 *   soft delete (`dateDeleted` via `db.deletedAt`), restore, replace.
 *
 * The handwritten control twin lives in
 * `test/__fixtures__/zod-parity/author-book.control.ts`; the parity e2e
 * keeps both styles behaviorally identical.
 */
export const authorSchema = z.object({
  id: z
    .uuid()
    .register(rocketsFieldMeta, { db: { pk: true, generated: true } }),
  name: z.string().min(1).max(100).meta({ example: 'Machado de Assis' }),
  dateCreated: z.iso
    .datetime()
    .register(rocketsFieldMeta, { db: { createdAt: true } }),
  dateUpdated: z.iso
    .datetime()
    .register(rocketsFieldMeta, { db: { updatedAt: true } }),
});

export const bookSchema = z.object({
  id: z
    .uuid()
    .register(rocketsFieldMeta, { db: { pk: true, generated: true } }),
  title: z.string().min(1).max(200).meta({ example: 'Dom Casmurro' }),
  isbn: z
    .string()
    .max(20)
    .meta({ example: '9788535914061' })
    .register(rocketsFieldMeta, { dto: { update: false } }),
  internalNote: z
    .string()
    .max(500)
    .register(rocketsFieldMeta, { dto: { response: false } })
    .optional(),
  authorId: z.uuid().register(rocketsFieldMeta, {
    db: { index: true },
    relation: {
      target: () => authorSchema,
      expose: true,
      onDelete: 'CASCADE',
    },
  }),
  dateCreated: z.iso
    .datetime()
    .register(rocketsFieldMeta, { db: { createdAt: true } }),
  dateUpdated: z.iso
    .datetime()
    .register(rocketsFieldMeta, { db: { updatedAt: true } }),
  dateDeleted: z.iso
    .datetime()
    .register(rocketsFieldMeta, { db: { deletedAt: true } })
    .nullable()
    .optional(),
});

export type Author = z.infer<typeof authorSchema>;
export type Book = z.infer<typeof bookSchema>;

export const authorZodResource = zodResource({
  name: 'Author',
  schema: authorSchema,
  table: 'authors',
  operations: ['list', 'read', 'create', 'update', 'delete'],
});

export const bookZodResource = zodResource({
  name: 'Book',
  schema: bookSchema,
  table: 'books',
  operations: {
    list: true,
    read: true,
    create: true,
    update: true,
    replace: true,
    delete: { soft: true, returnDeleted: true },
    restore: { returnRestored: true },
  },
});
