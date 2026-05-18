import {
  Body,
  Controller,
  Get,
  Logger,
  Param,
  Post,
  Type,
  UseGuards,
} from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
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
import { Expose } from 'class-transformer';
import { IsString, IsNotEmpty } from 'class-validator';
import {
  AssignRoleCommand,
  GetAssignedRolesQuery,
} from '@concepta/nestjs-role';

import { AdminGuard } from '../../../../../guards/admin.guard';
import { USER_ROLE_ENTITY_KEY } from '../../../../../shared/constants/repository-entity-keys.constants';
import { AdminUserRolesControllerExtras } from '../../../interfaces/role-controller-extras.interface';

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

/**
 * Build the `admin/users/:userId/roles` controller, applying any
 * consumer-supplied extras (`classDecorators`, per-route `decorators`).
 *
 * The two routes (`list`, `assign`) are thin shells around the upstream
 * `@concepta/nestjs-role` query/command classes via CQRS buses — no
 * business logic lives in the controller.
 */
export function buildAdminUserRolesController(
  extras: AdminUserRolesControllerExtras = {},
): Type<unknown> {
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiTags('admin')
  @Controller('admin/users/:userId/roles')
  class AdminUserRolesController {
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
      return this.queryBus.execute(
        new GetAssignedRolesQuery({}, USER_ROLE_ENTITY_KEY, userId),
      );
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
      await this.commandBus.execute(
        new AssignRoleCommand({}, USER_ROLE_ENTITY_KEY, dto.roleId, userId),
      );
      this.logger.log(`Role ${dto.roleId} assigned to user ${userId}`);
    }
  }

  applyExtras(AdminUserRolesController, extras);
  return AdminUserRolesController;
}

function applyExtras(
  controllerClass: Type<unknown>,
  extras: AdminUserRolesControllerExtras,
): void {
  for (const decorator of extras.classDecorators ?? []) {
    decorator(controllerClass);
  }

  const routeMap: Record<string, string> = {
    list: 'list',
    assign: 'assign',
  };

  for (const [routeKey, methodName] of Object.entries(routeMap)) {
    const cfg = extras.routes?.[routeKey as keyof typeof extras.routes];
    if (!cfg?.decorators) continue;

    const proto = controllerClass.prototype as Record<string, unknown>;
    const descriptor = Object.getOwnPropertyDescriptor(proto, methodName);
    if (!descriptor) continue;

    for (const decorator of cfg.decorators) {
      decorator(proto, methodName, descriptor);
    }
  }
}
