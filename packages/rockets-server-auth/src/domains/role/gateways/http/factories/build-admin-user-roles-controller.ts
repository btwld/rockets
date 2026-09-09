import {
  Body,
  Controller,
  Get,
  Logger,
  Param,
  Post,
  Req,
  StandardSchemaValidationPipe,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import type { Type } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import {
  AssignRoleCommand,
  GetAssignedRolesQuery,
} from '@concepta/nestjs-role';
import { getAppContext, rocketsSchemaValidation } from '@concepta/rockets-core';
import type { Request } from 'express';
import type { z } from 'zod';

import { AdminGuard } from '../../../../../guards/admin.guard';
import { USER_ROLE_ENTITY_KEY } from '../../../../../shared/constants/repository-entity-keys.constants';
import { rocketsAuthAdminAssignUserRoleSchema } from '../../../infrastructure/schemas/rockets-auth-admin-assign-user-role.schema';
import type { AdminUserRolesControllerExtras } from '../../../interfaces/role-controller-extras.interface';
import { applyControllerExtras } from '../../../../../shared/utils/apply-controller-extras.helper';

type AssignUserRoleBody = z.output<typeof rocketsAuthAdminAssignUserRoleSchema>;

/** Build the admin user-role controller and apply consumer decorators. */
export function buildAdminUserRolesController(
  extras: AdminUserRolesControllerExtras = {},
): Type<unknown> {
  @UseGuards(AdminGuard)
  @UsePipes(new StandardSchemaValidationPipe(rocketsSchemaValidation))
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
    async list(@Param('userId') userId: string, @Req() req: Request) {
      const ctx = getAppContext(req);
      return this.queryBus.execute(
        new GetAssignedRolesQuery(ctx, USER_ROLE_ENTITY_KEY, userId),
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
      @Body({ schema: rocketsAuthAdminAssignUserRoleSchema })
      body: AssignUserRoleBody,
      @Req() req: Request,
    ) {
      const ctx = getAppContext(req);
      await this.commandBus.execute(
        new AssignRoleCommand(ctx, USER_ROLE_ENTITY_KEY, body.roleId, userId),
      );
      this.logger.log(`Role ${body.roleId} assigned to user ${userId}`);
    }
  }

  applyControllerExtras(AdminUserRolesController, extras, {
    list: 'list',
    assign: 'assign',
  });
  return AdminUserRolesController;
}
