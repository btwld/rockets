import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  SerializeOptions,
  StandardSchemaSerializerInterceptor,
  StandardSchemaValidationPipe,
  StreamableFile,
  UseInterceptors,
  UsePipes,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOperation,
  ApiProduces,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Ctx, type AppContextInterface } from '@concepta/nestjs-core';
import type { AuthorizedUser } from '@concepta/rockets';
import { AuthUser, rocketsSchemaValidation } from '@concepta/rockets-core';

import {
  petPhotoDownloadUrlSchema,
  petPhotoListResponseSchema,
  petPhotoResponseSchema,
  petPhotoUploadSchema,
  type PetPhotoDownloadUrl,
  type PetPhotoResponse,
  type PetPhotoUploadBody,
} from './pet-photo.schema';
import { PetPhotoService } from './pet-photo.service';

/**
 * Photo routes for a pet. Same hand-written idiom as `PetShareController`:
 * class-level Standard Schema pipe validates `@Body({ schema })`, and the
 * serializer projects rows through `petPhotoResponseSchema`.
 *
 * The raw-bytes route is the exception — it streams a binary body, so it
 * opts OUT of the schema serializer rather than pretending the payload is
 * a JSON document.
 */
@ApiTags('Pet photos')
@ApiBearerAuth()
@Controller('pets/:petId/photos')
@UsePipes(new StandardSchemaValidationPipe(rocketsSchemaValidation))
export class PetPhotoController {
  constructor(private readonly petPhotoService: PetPhotoService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(StandardSchemaSerializerInterceptor)
  @SerializeOptions({ schema: petPhotoResponseSchema })
  @ApiOperation({
    summary: 'Upload a photo for a pet (owner only)',
    description:
      'Bytes are sent base64-encoded in JSON: the storage package adds no ' +
      'multipart parsing, so an app either brings its own middleware or ' +
      'encodes small payloads like this.',
  })
  @ApiResponse({ status: 201, standardSchema: petPhotoResponseSchema })
  @ApiNotFoundResponse({ description: 'Pet not found or not owned by you' })
  async upload(
    @Ctx() ctx: AppContextInterface,
    @Param('petId', ParseUUIDPipe) petId: string,
    @Body({ schema: petPhotoUploadSchema }) body: PetPhotoUploadBody,
    @AuthUser() user: AuthorizedUser,
  ): Promise<PetPhotoResponse> {
    return this.petPhotoService.upload(ctx, petId, user.id, body);
  }

  @Get()
  @UseInterceptors(StandardSchemaSerializerInterceptor)
  @SerializeOptions({ schema: petPhotoResponseSchema })
  @ApiOperation({ summary: 'List a pet photos (owner only)' })
  @ApiResponse({ status: 200, standardSchema: petPhotoListResponseSchema })
  async list(
    @Ctx() ctx: AppContextInterface,
    @Param('petId', ParseUUIDPipe) petId: string,
    @AuthUser() user: AuthorizedUser,
  ): Promise<PetPhotoResponse[]> {
    return this.petPhotoService.list(ctx, petId, user.id);
  }

  @Get(':photoId/url')
  @UseInterceptors(StandardSchemaSerializerInterceptor)
  @SerializeOptions({ schema: petPhotoDownloadUrlSchema })
  @ApiOperation({
    summary: 'Hand the client a URL for the photo bytes',
    description:
      '`expiresIn` is honored only when the configured store advertises ' +
      'that guarantee; the response says which you got.',
  })
  @ApiResponse({ status: 200, standardSchema: petPhotoDownloadUrlSchema })
  @ApiNotFoundResponse({ description: 'Photo not found' })
  async url(
    @Ctx() ctx: AppContextInterface,
    @Param('petId', ParseUUIDPipe) petId: string,
    @Param('photoId', ParseUUIDPipe) photoId: string,
    @Query('expiresIn') expiresIn: string | undefined,
    @AuthUser() user: AuthorizedUser,
  ): Promise<PetPhotoDownloadUrl> {
    return this.petPhotoService.downloadUrl(
      ctx,
      petId,
      photoId,
      user.id,
      expiresIn === undefined ? undefined : Number(expiresIn),
    );
  }

  @Get(':photoId/raw')
  @Header('Cache-Control', 'private, max-age=0')
  @ApiProduces('image/png', 'image/jpeg', 'image/webp')
  @ApiOperation({
    summary: 'Serve the photo bytes through the API',
    description:
      'For stores with no usable signed URL (the filesystem driver, for ' +
      'one), the app stays the gatekeeper and streams the bytes itself.',
  })
  @ApiResponse({ status: 200, description: 'Raw image bytes' })
  @ApiNotFoundResponse({ description: 'Photo not found' })
  async raw(
    @Ctx() ctx: AppContextInterface,
    @Param('petId', ParseUUIDPipe) petId: string,
    @Param('photoId', ParseUUIDPipe) photoId: string,
    @AuthUser() user: AuthorizedUser,
  ): Promise<StreamableFile> {
    const { bytes, contentType } = await this.petPhotoService.read(
      ctx,
      petId,
      photoId,
      user.id,
    );
    // `StreamableFile` keeps the route framework-neutral — no `@Res()`, so
    // the interceptor chain still runs and the handler stays testable.
    return new StreamableFile(Buffer.from(bytes), { type: contentType });
  }

  @Delete(':photoId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a photo and its stored object' })
  @ApiResponse({ status: 204, description: 'Deleted' })
  @ApiNotFoundResponse({ description: 'Photo not found' })
  async remove(
    @Ctx() ctx: AppContextInterface,
    @Param('petId', ParseUUIDPipe) petId: string,
    @Param('photoId', ParseUUIDPipe) photoId: string,
    @AuthUser() user: AuthorizedUser,
  ): Promise<void> {
    await this.petPhotoService.remove(ctx, petId, photoId, user.id);
  }
}
