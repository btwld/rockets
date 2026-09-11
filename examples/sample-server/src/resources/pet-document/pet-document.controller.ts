import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  SerializeOptions,
  StandardSchemaSerializerInterceptor,
  StandardSchemaValidationPipe,
  StreamableFile,
  UseInterceptors,
  UsePipes,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Ctx, type AppContextInterface } from '@concepta/nestjs-core';
import type { AuthorizedUser } from '@concepta/rockets';
import { AuthUser, rocketsSchemaValidation } from '@concepta/rockets-core';
import { toNodeReadable } from '@concepta/rockets-storage';

import {
  petDocumentArchiveResultSchema,
  petDocumentListResponseSchema,
  petDocumentResponseSchema,
  petDocumentUploadSchema,
  type PetDocumentArchiveResult,
  type PetDocumentResponse,
  type PetDocumentUploadBody,
} from './pet-document.schema';
import { PetDocumentService } from './pet-document.service';

/** `bytes=<start>-<end?>` — the only Range form this sample accepts. */
function parseRange(
  header: string | undefined,
): { start: number; end?: number } | undefined {
  if (!header) return undefined;
  const match = /^bytes=(\d+)-(\d*)$/u.exec(header.trim());
  if (!match) return undefined;
  const start = Number(match[1]);
  const end = match[2] === '' ? undefined : Number(match[2]);
  return end === undefined ? { start } : { start, end };
}

@ApiTags('Pet documents')
@ApiBearerAuth()
@Controller('pets/:petId/documents')
@UsePipes(new StandardSchemaValidationPipe(rocketsSchemaValidation))
export class PetDocumentController {
  constructor(private readonly petDocumentService: PetDocumentService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(StandardSchemaSerializerInterceptor)
  @SerializeOptions({ schema: petDocumentResponseSchema })
  @ApiOperation({ summary: 'Upload a document for a pet (owner only)' })
  @ApiResponse({ status: 201, standardSchema: petDocumentResponseSchema })
  async upload(
    @Ctx() ctx: AppContextInterface,
    @Param('petId', ParseUUIDPipe) petId: string,
    @Body({ schema: petDocumentUploadSchema }) body: PetDocumentUploadBody,
    @AuthUser() user: AuthorizedUser,
  ): Promise<PetDocumentResponse> {
    return this.petDocumentService.upload(ctx, petId, user.id, body);
  }

  @Get()
  @UseInterceptors(StandardSchemaSerializerInterceptor)
  @SerializeOptions({ schema: petDocumentResponseSchema })
  @ApiOperation({ summary: 'List a pet documents' })
  @ApiResponse({ status: 200, standardSchema: petDocumentListResponseSchema })
  async list(
    @Ctx() ctx: AppContextInterface,
    @Param('petId', ParseUUIDPipe) petId: string,
    @AuthUser() user: AuthorizedUser,
  ): Promise<PetDocumentResponse[]> {
    return this.petDocumentService.list(ctx, petId, user.id);
  }

  @Get(':documentId/content')
  @ApiOperation({
    summary: 'Stream a document, optionally a byte range',
    description:
      'Honors a `bytes=start-end` Range header when the holding store ' +
      'supports range reads.',
  })
  @ApiResponse({ status: 200, description: 'Document bytes' })
  async content(
    @Ctx() ctx: AppContextInterface,
    @Param('petId', ParseUUIDPipe) petId: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @Headers('range') rangeHeader: string | undefined,
    @AuthUser() user: AuthorizedUser,
  ): Promise<StreamableFile> {
    const { object, document } = await this.petDocumentService.open(
      ctx,
      petId,
      documentId,
      user.id,
      parseRange(rangeHeader),
    );
    // The driver hands back a web ReadableStream; Nest wants a Node one.
    return new StreamableFile(toNodeReadable(object), {
      type: document.contentType,
    });
  }

  @Post('archive')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(StandardSchemaSerializerInterceptor)
  @SerializeOptions({ schema: petDocumentArchiveResultSchema })
  @ApiOperation({ summary: 'Move every live document of a pet to cold storage' })
  @ApiResponse({ status: 200, standardSchema: petDocumentArchiveResultSchema })
  async archive(
    @Ctx() ctx: AppContextInterface,
    @Param('petId', ParseUUIDPipe) petId: string,
    @AuthUser() user: AuthorizedUser,
  ): Promise<PetDocumentArchiveResult> {
    return this.petDocumentService.archive(ctx, petId, user.id);
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete every document of a pet, in both stores' })
  @ApiResponse({ status: 204, description: 'Deleted' })
  async removeAll(
    @Ctx() ctx: AppContextInterface,
    @Param('petId', ParseUUIDPipe) petId: string,
    @AuthUser() user: AuthorizedUser,
  ): Promise<void> {
    await this.petDocumentService.removeAllForPet(ctx, petId, user.id);
  }
}
