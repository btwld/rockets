import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineModuleResource } from '@concepta/rockets-core';
import { StorageModule } from '@concepta/rockets-storage';
// NOTE: the subpath names the engine, not the backend — an app that only
// wants "files on disk" still has to type `files-sdk` in its import.
import { createFsStorageDriver } from '@concepta/rockets-storage/files-sdk/fs';

import { PetPhotoEntity } from './pet-photo.entity';
import { PetPhotoController } from './pet-photo.controller';
import { PetPhotoService, PET_PHOTOS_STORE } from './pet-photo.service';

/**
 * Photo feature: the metadata table, the HTTP gateway, and the named
 * storage store the service injects.
 *
 * The sample writes to a temp directory so it runs anywhere; a real
 * deployment swaps `createFsStorageDriver` for the S3 or runtime-provider
 * driver and changes nothing else — `PetPhotoService` only ever sees a
 * `StorageClient`.
 */
const photosRoot = mkdtempSync(join(tmpdir(), 'sample-server-pet-photos-'));

export const petPhotoFeature = defineModuleResource({
  entities: [PetPhotoEntity],
  imports: [
    StorageModule.forRoot({
      stores: [
        {
          name: PET_PHOTOS_STORE,
          driver: createFsStorageDriver({ adapter: { root: photosRoot } }),
        },
      ],
    }),
  ],
  controllers: [PetPhotoController],
  providers: [PetPhotoService],
  exports: [PetPhotoService],
});

export { photosRoot };
