import 'reflect-metadata';
import { HttpAdapterHost, NestFactory } from '@nestjs/core';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { ExceptionsFilter } from '@bitwild/rockets';
import { SwaggerUiService } from '@concepta/nestjs-swagger-ui';
import { UserModelService } from '@concepta/nestjs-user';
import { RoleModelService, RoleService } from '@concepta/nestjs-role';
import { PasswordCreationService } from '@concepta/nestjs-password';
import helmet from 'helmet';

async function ensureInitialAdmin(app: INestApplication) {
  const userModelService = app.get(UserModelService);
  const roleModelService = app.get(RoleModelService);
  const roleService = app.get(RoleService);
  const passwordCreationService = app.get(PasswordCreationService);

  // admin user credentials
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminEmail || !adminPassword) {
    console.error('ERROR: ADMIN_EMAIL and ADMIN_PASSWORD environment variables are required');
    console.error('Please set these in your .env file');
    process.exit(1);
  }
  const adminRoleName = 'admin';

  // Ensure role exists
  let adminRole = (
    await roleModelService.find({ where: { name: adminRoleName } })
  )?.[0];
  if (!adminRole) {
    adminRole = await roleModelService.create({
      name: adminRoleName,
      description: 'Administrator role',
    });
  }

  // Ensure user exists
  let adminUser = (
    await userModelService.find({
      where: [{ username: adminEmail }, { email: adminEmail }],
    })
  )?.[0];
  
  if (!adminUser) {
    const hashed = await passwordCreationService.create(adminPassword);
    // Note: In sample-server-auth, UserEntity has cascade: true on userMetadata relation
    // so we can pass metadata directly and TypeORM will handle it
    // This is adapter-specific (TypeORM) but works for this example
    adminUser = await userModelService.create({
      username: adminEmail,
      email: adminEmail,
      active: true,
      ...hashed,
      userMetadata: {
        firstName: 'Admin',
        lastName: 'User',
        username: 'admin',
        bio: 'Default administrator account',
      },
    } as Parameters<typeof userModelService.create>[0]);
  }

  // Ensure role is assigned to user
  const assignedRoles = await roleService.getAssignedRoles({
    assignment: 'user',
    assignee: { id: adminUser.id },
  });
  const isAssigned = assignedRoles?.some(
    (r: { id: string }) => r.id === adminRole.id,
  );
  if (!isAssigned) {
    await roleService.assignRole({
      assignment: 'user',
      assignee: { id: adminUser.id },
      role: { id: adminRole.id },
    });
  }
}

async function ensureManagerRole(app: INestApplication) {
  const roleModelService = app.get(RoleModelService);
  
  const managerRoleName = 'manager';
  let managerRole = (
    await roleModelService.find({ where: { name: managerRoleName } })
  )?.[0];
  
  if (!managerRole) {
    await roleModelService.create({
      name: managerRoleName,
      description: 'Manager role with limited permissions (cannot delete)',
    });
  }
}


async function ensureDefaultUserRole(app: INestApplication) {
  const roleModelService = app.get(RoleModelService);
  
  const defaultUserRoleName = 'user';
  let userRole = (
    await roleModelService.find({ where: { name: defaultUserRoleName } })
  )?.[0];
  
  if (!userRole) {
    await roleModelService.create({
      name: defaultUserRoleName,
      description: 'Default role for authenticated users',
    });
  }
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  // Enable graceful shutdown hooks
  //app.enableShutdownHooks();

  // Add security headers
  app.use(helmet());

  // Configure CORS
  app.enableCors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
    credentials: true,
  });
  
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
   
  // Get the swagger ui service, and set it up
  const swaggerUiService = app.get(SwaggerUiService);
  swaggerUiService.builder().addBearerAuth();
  swaggerUiService.setup(app);

  const exceptionsFilter = app.get(HttpAdapterHost);
  app.useGlobalFilters(new ExceptionsFilter(exceptionsFilter));

  await app.listen(process.env.PORT || 3001);

  try {
    await ensureInitialAdmin(app);
    await ensureManagerRole(app);
    await ensureDefaultUserRole(app);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Bootstrap failed:', err);
  } 
}

bootstrap();


