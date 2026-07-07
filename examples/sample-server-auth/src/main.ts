import 'reflect-metadata';

import { HttpAdapterHost, NestFactory } from '@nestjs/core';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { DataSource } from 'typeorm';
import { AppModule } from './app.module';
import { ExceptionsFilter } from '@bitwild/rockets';

import {
  ROLE_CRUD_ENTITY_KEY,
  USER_ROLE_ENTITY_KEY,
} from '@bitwild/rockets-auth';
import {
  AssignRoleCommand,
  CreateRoleCommand,
  GetAssignedRolesQuery,
  RoleAssignment,
} from '@concepta/nestjs-role';
import { CreateUserCommand, GetUserByEmailQuery } from '@concepta/nestjs-user';
import helmet from 'helmet';
import { RoleEntity } from './modules/role/role.entity';
import { UserMetadataEntity } from './modules/user/entities/user-metadata.entity';
import { SwaggerUiService } from '@bitwild/rockets-core';

// v8 commands/queries call `AppContextHost.from(ctx)` which only accepts
// an `AppContextHost`, `null`, `undefined`, or an empty object `{}`.
// The previous `createRepositoryContext(KEY)` produced `{ entity: KEY }`
// which now throws `Expected AppContextHost or nullish value, got object`.
// rockets-server-auth's internal handlers pass `{}` — match that.
const emptyCtx = {};

/** Minimal shape returned by nestjs-user queries/commands for this bootstrap. */
interface SeededUserRef {
  readonly id: string;
}

async function ensureRoleByName(
  dataSource: DataSource,
  commandBus: CommandBus,
  name: string,
  description: string,
): Promise<RoleEntity> {
  const roleRepo = dataSource.getRepository(RoleEntity);
  let role = await roleRepo.findOne({ where: { name } });
  if (!role) {
    await commandBus.execute(
      new CreateRoleCommand(emptyCtx, ROLE_CRUD_ENTITY_KEY, {
        name,
        description,
      }),
    );
    role = await roleRepo.findOne({ where: { name } });
  }
  if (!role) {
    throw new Error(`Failed to ensure role "${name}"`);
  }
  return role;
}

async function ensureInitialAdmin(app: INestApplication) {
  const commandBus = app.get(CommandBus);
  const queryBus = app.get(QueryBus);
  const dataSource = app.get(DataSource);

  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminEmail || !adminPassword) {
    console.error(
      'ERROR: ADMIN_EMAIL and ADMIN_PASSWORD environment variables are required',
    );
    console.error('Please set these in your .env file');
    process.exit(1);
  }

  const adminRole = await ensureRoleByName(
    dataSource,
    commandBus,
    'admin',
    'Administrator role',
  );

  let userAggregate = await queryBus.execute<
    GetUserByEmailQuery,
    SeededUserRef | null
  >(new GetUserByEmailQuery(emptyCtx, adminEmail));

  if (!userAggregate) {
    userAggregate = await commandBus.execute<CreateUserCommand, SeededUserRef>(
      new CreateUserCommand(emptyCtx, {
        username: adminEmail,
        email: adminEmail,
        active: true,
        password: adminPassword,
      }),
    );
    const metaRepo = dataSource.getRepository(UserMetadataEntity);
    await metaRepo.save(
      metaRepo.create({
        userId: userAggregate.id,
        firstName: 'Admin',
        lastName: 'User',
        username: 'admin',
        bio: 'Default administrator account',
      }),
    );
  }

  const adminUserId = userAggregate.id;

  const assignedRoles = await queryBus.execute<
    GetAssignedRolesQuery,
    RoleAssignment[]
  >(new GetAssignedRolesQuery(emptyCtx, USER_ROLE_ENTITY_KEY, adminUserId));
  const isAssigned = assignedRoles.some(
    (r: RoleAssignment) => r.roleId === adminRole.id,
  );
  if (!isAssigned) {
    await commandBus.execute(
      new AssignRoleCommand(
        emptyCtx,
        USER_ROLE_ENTITY_KEY,
        adminRole.id,
        adminUserId,
      ),
    );
  }
}

async function ensureAdditionalRoles(app: INestApplication) {
  const commandBus = app.get(CommandBus);
  const dataSource = app.get(DataSource);
  await Promise.all([
    ensureRoleByName(
      dataSource,
      commandBus,
      'manager',
      'Manager role with limited permissions (cannot delete)',
    ),
    ensureRoleByName(
      dataSource,
      commandBus,
      'user',
      'Default role for authenticated users',
    ),
  ]);
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.use(helmet());

  app.enableCors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidUnknownValues: true,
    }),
  );

  const swaggerUiService = app.get(SwaggerUiService);
  swaggerUiService.builder().addBearerAuth();
  swaggerUiService.setup(app);

  const exceptionsFilter = app.get(HttpAdapterHost);
  app.useGlobalFilters(new ExceptionsFilter(exceptionsFilter));

  await app.listen(process.env.PORT || 3001);

  try {
    await ensureInitialAdmin(app);
    await ensureAdditionalRoles(app);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Bootstrap failed:', err);
  }
}

bootstrap();
