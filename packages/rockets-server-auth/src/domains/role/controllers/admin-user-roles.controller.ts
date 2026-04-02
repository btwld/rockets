import { CommandBus, QueryBus } from '@nestjs/cqrs';
import {
  AssignRoleCommand,
  GetAssignedRolesQuery,
} from '@concepta/nestjs-role';
import { RepositoryContextInterface } from '@concepta/nestjs-repository';
import {
  Body,
  Controller,
  Get,
  Logger,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiProperty,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AdminGuard } from '../../../guards/admin.guard';
import { USER_ROLE_ENTITY_KEY } from '../../../shared/constants/repository-entity-keys.constants';
import { Expose } from 'class-transformer';
import { IsString, IsNotEmpty } from 'class-validator';

class AdminAssignUserRoleDto {
  @ApiProperty({
    description: 'Role ID to assign to the user',
    example: '08a82592-714e-4da0-ace5-45ed3b4eb795',
  })
  @Expose()
  @IsString()
  @IsNotEmpty()
  roleId!: string;
}

function createRoleCtx(): RepositoryContextInterface {
  return { entity: USER_ROLE_ENTITY_KEY } as RepositoryContextInterface;
}

@UseGuards(AdminGuard)
@ApiBearerAuth()
@ApiTags('admin')
@Controller('admin/users/:userId/roles')
export class AdminUserRolesController {
  private readonly logger = new Logger(AdminUserRolesController.name);

  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @ApiOperation({ summary: 'List roles assigned to a user' })
  @ApiParam({ name: 'userId', required: true })
  @ApiOkResponse({ description: 'Roles for the user' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @Get()
  async list(@Param('userId') userId: string) {
    const ctx = createRoleCtx();
    return this.queryBus.execute(new GetAssignedRolesQuery(ctx, userId));
  }

  @ApiOperation({ summary: 'Assign a role to a user' })
  @ApiParam({ name: 'userId', required: true })
  @ApiCreatedResponse({ description: 'Role assigned' })
  @ApiBadRequestResponse({ description: 'Invalid payload' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @Post()
  async assign(
    @Param('userId') userId: string,
    @Body() dto: AdminAssignUserRoleDto,
  ) {
    const ctx = createRoleCtx();
    await this.commandBus.execute(
      new AssignRoleCommand(ctx, dto.roleId, userId),
    );

    this.logger.log(`Role ${dto.roleId} assigned to user ${userId}`);
  }
}
