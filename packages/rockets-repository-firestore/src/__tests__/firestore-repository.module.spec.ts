import { Test } from '@nestjs/testing';
import {
  SortOrder,
  Where,
  getDynamicRepositoryToken,
} from '@concepta/nestjs-repository';
import type { RepositoryInterface } from '@concepta/nestjs-repository';

import { FirestoreRepositoryModule } from '../firestore-repository.module';

class WidgetEntity {
  id!: string;
  title!: string;
  dateCreated!: Date;
}

class SoftWidgetEntity {
  id!: string;
  title!: string;
  dateRemoved!: Date | null;
}

describe(FirestoreRepositoryModule.name, () => {
  const originalEnv = process.env.FIREBASE_FIRESTORE_USE_FAKE;

  beforeEach(() => {
    process.env.FIREBASE_FIRESTORE_USE_FAKE = 'true';
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.FIREBASE_FIRESTORE_USE_FAKE;
      return;
    }
    process.env.FIREBASE_FIRESTORE_USE_FAKE = originalEnv;
  });

  it('registers a global dynamic module', () => {
    const dynModule = FirestoreRepositoryModule.forFeature([
      { key: 'widget', entity: WidgetEntity },
    ]);

    expect(dynModule.module).toBe(FirestoreRepositoryModule);
    expect(dynModule.providers).toHaveLength(1);
    expect(dynModule.exports).toHaveLength(1);
  });

  it('persists and reads through the in-memory backend when the fake backend is enabled', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        FirestoreRepositoryModule.forFeature([
          { key: 'widget', entity: WidgetEntity, collection: 'widgets-test' },
        ]),
      ],
    }).compile();

    const repo = moduleRef.get<RepositoryInterface<WidgetEntity>>(
      getDynamicRepositoryToken('widget'),
    );

    await repo.create({
      id: 'widget-2',
      title: 'Beta',
      dateCreated: new Date('2025-01-02T00:00:00.000Z'),
    });
    await repo.create({
      id: 'widget-1',
      title: 'Alpha',
      dateCreated: new Date('2025-01-01T00:00:00.000Z'),
    });

    const ordered = await repo.find({
      order: [{ field: 'title', order: SortOrder.ASC }],
    });
    expect(ordered.map((row) => row.id)).toEqual(['widget-1', 'widget-2']);

    const found = await repo.findOne({
      where: Where.eq('id', 'widget-1'),
    });
    expect(found?.title).toBe('Alpha');
  });

  it('applies take and skip', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        FirestoreRepositoryModule.forFeature([
          { key: 'widget', entity: WidgetEntity, collection: 'widgets-paging' },
        ]),
      ],
    }).compile();

    const repo = moduleRef.get<RepositoryInterface<WidgetEntity>>(
      getDynamicRepositoryToken('widget'),
    );

    await repo.create({ id: 'w1', title: 'A', dateCreated: new Date() });
    await repo.create({ id: 'w2', title: 'B', dateCreated: new Date() });
    await repo.create({ id: 'w3', title: 'C', dateCreated: new Date() });

    const page = await repo.find({
      order: [{ field: 'title', order: SortOrder.ASC }],
      skip: 1,
      take: 1,
    });

    expect(page).toHaveLength(1);
    expect(page[0]?.id).toBe('w2');
  });

  it('soft-deletes and restores when dateRemoved is present on the entity', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        FirestoreRepositoryModule.forFeature([
          {
            key: 'soft-widget',
            entity: SoftWidgetEntity,
            collection: 'soft-widgets',
            softDeleteField: 'dateRemoved',
          },
        ]),
      ],
    }).compile();

    const repo = moduleRef.get<RepositoryInterface<SoftWidgetEntity>>(
      getDynamicRepositoryToken('soft-widget'),
    );

    await repo.create({ id: 's1', title: 'Keep', dateRemoved: null });

    const created = await repo.findOne({ where: Where.eq('id', 's1') });
    expect(created).not.toBeNull();

    await repo.softDelete(created!);

    const hidden = await repo.find({ where: Where.eq('id', 's1') });
    expect(hidden).toHaveLength(0);

    const withDeleted = await repo.find({
      where: Where.eq('id', 's1'),
      withDeleted: true,
    });
    expect(withDeleted).toHaveLength(1);

    await repo.restore(withDeleted[0]!);

    const visible = await repo.find({ where: Where.eq('id', 's1') });
    expect(visible).toHaveLength(1);
    expect(visible[0]?.dateRemoved).toBeNull();
  });

  it('findAndCount returns total without take', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        FirestoreRepositoryModule.forFeature([
          { key: 'widget', entity: WidgetEntity, collection: 'widgets-count' },
        ]),
      ],
    }).compile();

    const repo = moduleRef.get<RepositoryInterface<WidgetEntity>>(
      getDynamicRepositoryToken('widget'),
    );

    await repo.create({ id: 'c1', title: 'One', dateCreated: new Date() });
    await repo.create({ id: 'c2', title: 'Two', dateCreated: new Date() });

    const [rows, total] = await repo.findAndCount({ take: 1 });
    expect(rows).toHaveLength(1);
    expect(total).toBe(2);
  });
});
