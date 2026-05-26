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
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { randomBytes } from 'crypto';
import {
  InjectDynamicRepository,
  RepositoryInterface,
  Where,
} from '@bitwild/rockets-repository';
import { AuthUser } from '@bitwild/rockets-common';
import type { AuthorizedUser } from '@bitwild/rockets-core';
import { ApiKeyEntity } from './api-key.entity';
import {
  ApiKeyResponseDto,
  CreateApiKeyDto,
  CreateApiKeyResponseDto,
} from './api-key.dto';

@ApiTags('API Keys')
@ApiBearerAuth()
@Controller('api-keys')
export class ApiKeyController {
  constructor(
    @InjectDynamicRepository(ApiKeyEntity)
    private readonly repo: RepositoryInterface<ApiKeyEntity>,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a new API key for programmatic access' })
  @ApiResponse({
    status: 201,
    type: CreateApiKeyResponseDto,
    description: 'Key created — value shown once, store it securely.',
  })
  async create(
    @Body() dto: CreateApiKeyDto,
    @AuthUser() user: AuthorizedUser,
  ): Promise<CreateApiKeyResponseDto> {
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
    type: [ApiKeyResponseDto],
    description: 'Key values are never returned after creation.',
  })
  async list(@AuthUser() user: AuthorizedUser): Promise<ApiKeyResponseDto[]> {
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
