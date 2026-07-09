import type {
  WireRow,
  PersistenceRow,
  SchemaPersistenceRow,
} from './persistence-row';
import { z } from 'zod';
import { f } from './fields';

describe('persistence row types', () => {
  it('maps audit ISO datetime fields to Date on persistence rows', () => {
    const schema = z.object({
      id: f.pk(),
      sendAt: z.iso.datetime(),
      dateCreated: f.createdAt(),
      dateUpdated: f.updatedAt(),
      dateDeleted: f.deletedAt(),
      name: f.string({ max: 10 }),
    });

    type Wire = WireRow<typeof schema>;
    type Persist = SchemaPersistenceRow<typeof schema>;

    const wire: Wire = {
      id: '00000000-0000-4000-8000-000000000001',
      sendAt: '2024-01-15T10:00:00.000Z',
      dateCreated: '2024-01-15T10:00:00.000Z',
      dateUpdated: '2024-01-15T10:00:00.000Z',
      dateDeleted: undefined,
      name: 'x',
    };

    const persist: Persist = {
      id: wire.id,
      sendAt: new Date(wire.sendAt),
      dateCreated: new Date(wire.dateCreated),
      dateUpdated: new Date(wire.dateUpdated),
      dateDeleted: undefined,
      name: wire.name,
    };

    expect(persist.sendAt).toBeInstanceOf(Date);
    expect(persist.dateCreated).toBeInstanceOf(Date);

    type Nested = PersistenceRow<{
      items: { dateCreated: string; name: string }[];
    }>;
    const nested: Nested = {
      items: [{ dateCreated: new Date(), name: 'a' }],
    };
    expect(nested.items[0]?.dateCreated).toBeInstanceOf(Date);
  });
});
