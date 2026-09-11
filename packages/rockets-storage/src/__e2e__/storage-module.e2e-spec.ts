import 'reflect-metadata';

import { Controller, Get, Module, Param, Put } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';

import { InjectStorage } from '../inject-storage.decorator.js';
import { StorageClient } from '../storage.client.js';
import { StorageModule } from '../storage.module.js';
import { createMemoryStorageDriver } from '../testing/index.js';

@ApiTags('storage-e2e')
@Controller('objects')
class StorageTestController {
  constructor(@InjectStorage('media') private readonly media: StorageClient) {}

  @Put(':key')
  @ApiOkResponse({ description: 'Stored object metadata' })
  async put(@Param('key') key: string): Promise<{ key: string; size: number }> {
    const uploaded = await this.media.upload(key, `contents:${key}`, {
      contentType: 'text/plain',
    });
    return { key: uploaded.key, size: uploaded.size };
  }

  @Get(':key')
  @ApiOkResponse({ description: 'Stored object contents' })
  async get(@Param('key') key: string): Promise<{ contents: string }> {
    return { contents: await this.media.downloadText(key) };
  }
}

@Module({
  controllers: [StorageTestController],
  imports: [
    StorageModule.forRoot({
      default: 'media',
      stores: [
        {
          driver: createMemoryStorageDriver(),
          name: 'media',
        },
      ],
    }),
  ],
})
class StorageTestModule {}

describe('StorageModule e2e', () => {
  let closeApp: (() => Promise<void>) | undefined;

  afterEach(async () => {
    await closeApp?.();
    closeApp = undefined;
  });

  it('injects a named client into a real Nest HTTP application', async () => {
    const testingModule = await Test.createTestingModule({
      imports: [StorageTestModule],
    }).compile();
    const app = testingModule.createNestApplication();
    closeApp = () => app.close();
    await app.init();

    await request(app.getHttpServer())
      .put('/objects/avatar.txt')
      .expect(200)
      .expect(({ body }) => {
        expect(body).toEqual({ key: 'avatar.txt', size: 19 });
      });

    await request(app.getHttpServer())
      .get('/objects/avatar.txt')
      .expect(200)
      .expect({ contents: 'contents:avatar.txt' });
  });
});
