import { RoleService } from '@concepta/nestjs-role';
import {
  Body,
  Controller,
  Get,
  Inject,
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

@UseGuards(AdminGuard)
@ApiBearerAuth()
@ApiTags('admin')
@Controller('admin/users/:userId/roles')
export class AdminUserRolesController {
  private readonly logger = new Logger(AdminUserRolesController.name);

  constructor(
    @Inject(RoleService)
    private readonly roleService: RoleService,
  ) {}

  @ApiOperation({ summary: 'List roles assigned to a user' })
  @ApiParam({ name: 'userId', required: true })
  @ApiOkResponse({ description: 'Roles for the user' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @Get()
  async list(@Param('userId') userId: string) {
    return this.roleService.getAssignedRoles({
      assignment: 'user',
      assignee: { id: userId },
    });
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
    await this.roleService.assignRole({
      assignment: 'user',
      assignee: { id: userId },
      role: { id: dto.roleId },
    });

    this.logger.log(`Role ${dto.roleId} assigned to user ${userId}`);
  }
}
