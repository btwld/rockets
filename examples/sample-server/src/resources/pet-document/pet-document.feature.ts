import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineModuleResource } from '@concepta/rockets-core';
import { StorageModule } from '@concepta/rockets-storage';
import { createFsStorageDriver } from '@concepta/rockets-storage/files-sdk/fs';

import { PetDocumentEntity } from './pet-document.entity';
import { PetDocumentController } from './pet-document.controller';
import {
  PetDocumentService,
  PET_ARCHIVE_STORE,
  PET_DOCUMENTS_STORE,
} from './pet-document.service';

/**
 * Two named stores in one registration — the shape an app reaches for as
 * soon as hot and cold data have different homes. Both are filesystem here;
 * swapping the archive for S3 is a one-line driver change.
 */
const documentsRoot = mkdtempSync(join(tmpdir(), 'sample-server-pet-docs-'));
const archiveRoot = mkdtempSync(join(tmpdir(), 'sample-server-pet-archive-'));

export const petDocumentFeature = defineModuleResource({
  entities: [PetDocumentEntity],
  imports: [
    StorageModule.forRoot({
      default: PET_DOCUMENTS_STORE,
      stores: [
        {
          name: PET_DOCUMENTS_STORE,
          driver: createFsStorageDriver({ adapter: { root: documentsRoot } }),
        },
        {
          name: PET_ARCHIVE_STORE,
          driver: createFsStorageDriver({ adapter: { root: archiveRoot } }),
        },
      ],
    }),
  ],
  controllers: [PetDocumentController],
  providers: [PetDocumentService],
  exports: [PetDocumentService],
});

export { archiveRoot, documentsRoot };
