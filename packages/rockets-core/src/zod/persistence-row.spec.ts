import { describe, it, expect } from 'vitest';
import type {
  JsonEncoded,
  WireRow,
  SchemaPersistenceRow,
} from './persistence-row';
import { z } from 'zod';
import { f } from './fields';

describe('persistence row types', () => {
  const schema = z.object({
    id: f.pk(),
    sendAt: f.date(),
    dateCreated: f.createdAt(),
    dateUpdated: f.updatedAt(),
    dateDeleted: f.deletedAt(),
    name: f.string({ max: 10 }),
  });

  it('SchemaPersistenceRow is the schema output: date columns are Date', () => {
    type Persist = SchemaPersistenceRow<typeof schema>;

    const persist: Persist = {
      id: '00000000-0000-4000-8000-000000000001',
      sendAt: new Date('2024-01-15T10:00:00.000Z'),
      dateCreated: new Date('2024-01-15T10:00:00.000Z'),
      dateUpdated: new Date('2024-01-15T10:00:00.000Z'),
      dateDeleted: null,
      name: 'x',
    };

    expect(persist.sendAt).toBeInstanceOf(Date);
    expect(persist.dateCreated).toBeInstanceOf(Date);
  });

  it('WireRow is the JSON encoding of the output: dates are ISO strings', () => {
    type Wire = WireRow<typeof schema>;

    const wire: Wire = {
      id: '00000000-0000-4000-8000-000000000001',
      sendAt: '2024-01-15T10:00:00.000Z',
      dateCreated: '2024-01-15T10:00:00.000Z',
      dateUpdated: '2024-01-15T10:00:00.000Z',
      dateDeleted: null,
      name: 'x',
    };

    expect(typeof wire.sendAt).toBe('string');
    expect(typeof wire.dateCreated).toBe('string');
  });

  it('JsonEncoded recurses through arrays and nested objects', () => {
    type Nested = JsonEncoded<{
      items: { dateCreated: Date; name: string }[];
      meta: { at: Date | null };
    }>;
    const nested: Nested = {
      items: [{ dateCreated: '2024-01-15T10:00:00.000Z', name: 'a' }],
      meta: { at: null },
    };
    expect(typeof nested.items[0]?.dateCreated).toBe('string');
  });
});
