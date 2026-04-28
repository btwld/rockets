import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CommandBus } from '@nestjs/cqrs';
import {
  AuthUser,
  Ctx,
  type AppContextInterface,
} from '@bitwild/rockets-common';
import type { AuthorizedUser } from '@bitwild/rockets';
import { PetEntity } from '../pet/pet.entity';
import { TransferPetOwnershipDto } from './dto/transfer-pet-ownership.dto';
import { TransferPetOwnershipCommand } from './commands/impl/transfer-pet-ownership.command';

/**
 * HTTP gateway for pet-transfer. Dispatches via `CommandBus.execute` —
 * controller has no repository or business logic, which is the main
 * point of the CQRS split.
 *
 * Compare with `PetShareController`: that one injects a plain
 * `PetShareService`. Both patterns work; pick CQRS when the use case
 * benefits from (a) being discoverable as a verb (`grep Command`), (b)
 * having listeners react to its outcome via `EventBus`, or (c) being
 * composable with other commands via `CommandBus.execute()` inside
 * another handler.
 */
@ApiTags('Pet transfer')
@ApiBearerAuth()
@Controller('pets/:petId/transfer')
export class PetTransferController {
  constructor(private readonly commandBus: CommandBus) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Transfer pet ownership to another user (owner only)' })
  @ApiNotFoundResponse({
    description:
      'Pet not found, not owned by you, or target user does not exist',
  })
  async transfer(
    @Ctx() ctx: AppContextInterface,
    @Param('petId', new ParseUUIDPipe()) petId: string,
    @AuthUser() authUser: AuthorizedUser,
    @Body() dto: TransferPetOwnershipDto,
  ): Promise<PetEntity> {
    return this.commandBus.execute(
      new TransferPetOwnershipCommand(ctx, petId, authUser.id, dto.newOwnerId),
    );
  }
}
