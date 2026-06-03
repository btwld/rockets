import { FirestoreRepositoryModule } from '../firestore-repository.module';
import { InMemoryFirestoreBackend } from '../backends/in-memory-firestore.backend';
import { defineFirestoreRepository } from '../integration/define-firestore-repository';

class ReportEntity {
  id!: string;
}

describe('defineFirestoreRepository', () => {
  it('returns a RepositoryBootstrap with forRoot and forFeature', () => {
    const bootstrap = defineFirestoreRepository();
    expect(bootstrap.name).toBe('firestore-bootstrap');
    expect(typeof bootstrap.forRoot).toBe('function');
    expect(typeof bootstrap.forFeature).toBe('function');
  });

  it('delegates forFeature to FirestoreRepositoryModule', () => {
    const backend = new InMemoryFirestoreBackend();
    const bootstrap = defineFirestoreRepository({ backend });
    const dynModule = bootstrap.forFeature([
      { key: 'report', entity: ReportEntity, collection: 'reports_custom' },
    ]);

    expect(dynModule.module).toBe(FirestoreRepositoryModule);
  });

  it('delegates forRoot to FirestoreRepositoryModule with entities', () => {
    const backend = new InMemoryFirestoreBackend();
    const bootstrap = defineFirestoreRepository({ backend });
    const root = bootstrap.forRoot([ReportEntity]);

    expect(root.global).toBe(true);
    expect(root.module).toBe(FirestoreRepositoryModule);
  });
});
