import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  SerializeOptions,
  StandardSchemaSerializerInterceptor,
  StandardSchemaValidationPipe,
  UseInterceptors,
  UsePipes,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { randomBytes } from 'crypto';
import { RepositoryInterface, Where } from '@concepta/nestjs-repository';

import type { AuthorizedUser } from '@concepta/rockets-core';
import {
  AuthUser,
  InjectDynamicRepository,
  rocketsSchemaValidation,
} from '@concepta/rockets-core';
import { ApiKeyEntity } from './api-key.entity';
import {
  apiKeyListResponseSchema,
  apiKeyResponseSchema,
  createApiKeyResponseSchema,
  createApiKeySchema,
  type ApiKeyResponse,
  type CreateApiKeyBody,
  type CreateApiKeyResponse,
} from './api-key.schema';

@ApiTags('API Keys')
@ApiBearerAuth()
@Controller('api-keys')
@UsePipes(new StandardSchemaValidationPipe(rocketsSchemaValidation))
@UseInterceptors(StandardSchemaSerializerInterceptor)
export class ApiKeyController {
  constructor(
    @InjectDynamicRepository(ApiKeyEntity)
    private readonly repo: RepositoryInterface<ApiKeyEntity>,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a new API key for programmatic access' })
  @ApiResponse({
    status: 201,
    standardSchema: createApiKeyResponseSchema,
    description: 'Key created — value shown once, store it securely.',
  })
  @SerializeOptions({ schema: createApiKeyResponseSchema })
  async create(
    @Body({ schema: createApiKeySchema }) dto: CreateApiKeyBody,
    @AuthUser() user: AuthorizedUser,
  ): Promise<CreateApiKeyResponse> {
    const key = randomBytes(32).toString('hex');

    const record = await this.repo.create({
      key,
      userId: user.id,
      name: dto.name,
    });

    return {
      id: record.id,
      key,
      keyPrefix: key.slice(0, 8),
      name: record.name,
      dateCreated: record.dateCreated,
    };
  }

  @Get()
  @ApiOperation({ summary: 'List all API keys for the authenticated user' })
  @ApiResponse({
    status: 200,
    standardSchema: apiKeyListResponseSchema,
    description: 'Key values are never returned after creation.',
  })
  @SerializeOptions({ schema: apiKeyResponseSchema })
  async list(@AuthUser() user: AuthorizedUser): Promise<ApiKeyResponse[]> {
    const records = await this.repo.find({
      where: Where.eq<ApiKeyEntity>('userId', user.id),
    });

    return records.map((r) => ({
      id: r.id,
      keyPrefix: r.key.slice(0, 8),
      name: r.name,
      lastUsedAt: r.lastUsedAt,
      dateCreated: r.dateCreated,
    }));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke an API key' })
  @ApiResponse({ status: 204, description: 'Key revoked.' })
  @ApiResponse({ status: 404, description: 'Key not found or not owned by user.' })
  async revoke(
    @Param('id') id: string,
    @AuthUser() user: AuthorizedUser,
  ): Promise<void> {
    const record = await this.repo.findOne({
      where: Where.and(
        Where.eq<ApiKeyEntity>('id', id),
        Where.eq<ApiKeyEntity>('userId', user.id),
      ),
    });

    if (!record) {
      throw new NotFoundException('API key not found');
    }

    await this.repo.delete(record);
  }
}
