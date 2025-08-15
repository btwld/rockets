import { DynamicModule, Module, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ConfigurableCrudBuilder } from '@concepta/nestjs-crud';
import { AdminOptionsExtrasInterface } from '../../interfaces/rockets-server-options-extras.interface';
import { ADMIN_USER_CRUD_SERVICE_TOKEN } from '../../rockets-server.constants';
import { AdminGuard } from '../../guards/admin.guard';
@Module({})
export class RocketsServerAdminModule {
  static register(admin: AdminOptionsExtrasInterface): DynamicModule {
    const builder = new ConfigurableCrudBuilder({
      service: {
        adapter: admin.adapter,
        injectionToken: ADMIN_USER_CRUD_SERVICE_TOKEN,
      },
      controller: {
        path: admin.path || 'admin/users',
        model: {
          type: admin.model,
        },
        extraDecorators: [
          ApiTags('admin'),
          UseGuards(AdminGuard),
          ApiBearerAuth(),
        ],
      },
      getMany: {},
      getOne: {},
      createOne: admin.dto?.createOne
        ? { dto: admin.dto.createOne }
        : undefined,
      createMany: admin.dto?.createMany
        ? { dto: admin.dto.createMany }
        : undefined,
      updateOne: admin.dto?.updateOne
        ? { dto: admin.dto.updateOne }
        : undefined,
      replaceOne: admin.dto?.replaceOne
        ? { dto: admin.dto.replaceOne }
        : undefined,
      deleteOne: {},
    });

    const { ConfigurableControllerClass, ConfigurableServiceClass } =
      builder.build();

    class AdminUserCrudService extends ConfigurableServiceClass {}
    // TODO: add decorators and option to overwrite or disable controller
    class AdminUserCrudController extends ConfigurableControllerClass {
      // TODO: update methods to get profile data
    }

    return {
      module: RocketsServerAdminModule,
      imports: [...(admin.imports || [])],
      controllers: [AdminUserCrudController],
      providers: [
        admin.adapter,
        AdminUserCrudService,
        {
          provide: ADMIN_USER_CRUD_SERVICE_TOKEN,
          useClass: AdminUserCrudService,
        },
      ],
      exports: [AdminUserCrudService, admin.adapter],
    };
  }
}
