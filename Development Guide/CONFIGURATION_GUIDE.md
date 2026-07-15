# Configuration Guide

> **For AI Tools**: This guide contains all application setup and configuration patterns. Use this when setting up new applications or configuring Rockets Server SDK.

## 📋 **Quick Reference**

| Task | Section |
|------|---------|
| Setting up main.ts | [Application Bootstrap](#application-bootstrap) |
| Configuring Rockets Server | [Rockets Server Configuration](#rockets-server-configuration) |
| Setting up Swagger | [Swagger Setup](#swagger-setup) |
| Environment variables | [Environment Configuration](#environment-configuration) |

---

## Application Bootstrap

### Main Application Setup (main.ts)

The Rockets Server SDK provides built-in services that handle most application setup automatically:

```typescript
// main.ts
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerUiService } from '@bitwild/rockets-server';
import { HttpAdapterHost } from '@nestjs/core';
import { ExceptionsFilter } from './common/filters/exceptions.filter';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Enable validation globally
  app.useGlobalPipes(new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  }));

  // Get the swagger UI service and set it up (SDK handles configuration)
  const swaggerUiService = app.get(SwaggerUiService);
  swaggerUiService.builder().addBearerAuth();
  swaggerUiService.setup(app);

  // Global exception filter (optional)
  try {
    const exceptionsFilter = app.get(HttpAdapterHost);
    app.useGlobalFilters(new ExceptionsFilter(exceptionsFilter));
  } catch (error) {
    console.warn('HttpAdapterHost not available, skipping global exception filter');
  }

  await app.listen(3000);
}
bootstrap();
```

### Key Points:

✅ **Swagger Setup**: Use `SwaggerUiService` from SDK - no manual `DocumentBuilder`  
✅ **Validation**: Apply `ValidationPipe` globally for DTO validation  
✅ **Exception Handling**: Optional global exception filter  
✅ **Bearer Auth**: SDK handles JWT configuration automatically  

### What the SDK Provides:

✅ **Automatic Swagger Configuration**: SDK provides `SwaggerUiService` for easy setup  
✅ **JWT Configuration**: SDK handles JWT setup automatically  
✅ **API Documentation**: SDK manages DocumentBuilder and API documentation  

---

## Swagger Setup

The SDK automatically configures Swagger with proper authentication and API documentation:

### ✅ Correct Approach (Using SDK):
```typescript
// main.ts
const swaggerUiService = app.get(SwaggerUiService);
swaggerUiService.builder().addBearerAuth();
swaggerUiService.setup(app);
```

### Don't Do This (Manual Configuration):
```typescript
// DON'T - SDK already handles this
const config = new DocumentBuilder()
  .setTitle('API')
  .setVersion('1.0')
  .addBearerAuth()
  .build();
const document = SwaggerModule.createDocument(app, config);
SwaggerModule.setup('api', app, document);
```

---

## Rockets Server Configuration

### Basic Configuration (Minimal Setup)

```typescript
// app.module.ts
@Module({
  imports: [
    RocketsServerModule.forRootAsync({
      imports: [
        TypeOrmModule.forFeature([UserEntity]), // For user management
        TypeOrmExtModule.forFeature({
          user: { entity: UserEntity },
          role: { entity: RoleEntity },
          userRole: { entity: UserRoleEntity },
          userOtp: { entity: UserOtpEntity },
          federated: { entity: FederatedEntity },
        }),
      ],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        // JWT configuration is automatic - SDK handles this
        services: {
          mailerService: {
            sendMail: (options: any) => Promise.resolve(), // Mock for development
          },
        },
        settings: {
          email: {
            from: configService.get('EMAIL_FROM'),
            baseUrl: configService.get('BASE_URL'),
          },
          otp: {
            assignment: 'userOtp',
            category: 'auth-login',
            expiresIn: '1h',
          },
          role: {
            adminRoleName: 'Admin',
          },
        },
      }),
    }),
  ],
})
export class AppModule {}
```

### Enable Admin User Management

```typescript
// app.module.ts - Add to RocketsServerModule.forRootAsync()
RocketsServerModule.forRootAsync({
  // ... basic config above
  userCrud: {
    imports: [TypeOrmModule.forFeature([UserEntity])],
    adapter: UserTypeOrmCrudAdapter,
    model: UserDto,
    dto: {
      createOne: UserCreateDto,
      updateOne: UserUpdateDto,
    },
  },
})
```

### Key Configuration Points:

✅ **JWT is Automatic**: SDK handles all JWT configuration  
✅ **Email Service**: Provide mock for development, real service for production  
✅ **Settings Object**: Configure email, OTP, and role settings  
✅ **User CRUD**: Optional admin user management endpoints  

---

## TypeORM Module Differences

Understanding the two TypeORM patterns used in Rockets ecosystem:

### Standard TypeORM (for CRUD operations)
```typescript
TypeOrmModule.forFeature([UserEntity])
// Provides: Repository<UserEntity>
// Used by: CRUD adapters, basic database operations
```

### Extended TypeORM (for ModelServices)
```typescript
TypeOrmExtModule.forFeature({
  user: { entity: UserEntity },
  role: { entity: RoleEntity },
})
// Provides: DynamicRepository with extended features
// Used by: ModelServices, complex business logic
```

### Usage in Modules:
```typescript
@Module({
  imports: [
    // For CRUD operations (standard TypeORM tokens)
    TypeOrmModule.forFeature([UserEntity]),
    
    // For ModelServices (dynamic tokens)  
    TypeOrmExtModule.forFeature({
      user: { entity: UserEntity },
      role: { entity: RoleEntity },
    }),
  ],
})
```

---

## Environment Configuration

### Environment Variables (.env)

```bash
# Database
DATABASE_TYPE=postgres
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_USERNAME=myapp
DATABASE_PASSWORD=password
DATABASE_NAME=myapp_development

# Application
BASE_URL=http://localhost:3000
PORT=3000

# Email (Development - Mock)
EMAIL_FROM=noreply@myapp.com

# JWT (Optional - SDK handles if not provided)
JWT_ACCESS_SECRET=your-access-secret
JWT_REFRESH_SECRET=your-refresh-secret

# OTP Configuration
OTP_EXPIRES_IN=1h

# Role Configuration
ADMIN_ROLE_NAME=Admin
```

### Configuration Service Pattern

For complex configurations, use `registerAs` pattern:

```typescript
// config/rockets-server.config.ts
import { registerAs } from '@nestjs/config';

export const rocketsServerConfig = registerAs('rocketsServer', () => ({
  role: {
    adminRoleName: process.env.ADMIN_ROLE_NAME ?? 'Admin',
  },
  email: {
    from: process.env.EMAIL_FROM ?? 'noreply@yourapp.com',
    baseUrl: process.env.BASE_URL ?? 'http://localhost:3000',
  },
  otp: {
    assignment: 'userOtp',
    category: 'auth-login',
    type: 'uuid',
    expiresIn: process.env.OTP_EXPIRES_IN ?? '1h',
  },
}));
```

```typescript
// app.module.ts
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [rocketsServerConfig], // Load typed configuration
    }),
    RocketsServerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const rocketsConfig = configService.get('rocketsServer');
        return {
          settings: rocketsConfig,
          // ... other configuration
        };
      },
    }),
  ],
})
```

---

## Database Configuration

### Basic Database Setup

```typescript
// config/database.config.ts
import { registerAs } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';

export const databaseConfig = registerAs('database', (): TypeOrmModuleOptions => ({
  type: 'postgres',
  host: process.env.DATABASE_HOST || 'localhost',
  port: parseInt(process.env.DATABASE_PORT || '5432'),
  username: process.env.DATABASE_USERNAME,
  password: process.env.DATABASE_PASSWORD,
  database: process.env.DATABASE_NAME,
  entities: [__dirname + '/../**/*.entity{.ts,.js}'],
  synchronize: process.env.NODE_ENV === 'development',
  logging: process.env.NODE_ENV === 'development',
}));
```

### Using Database Configuration

```typescript
// app.module.ts
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [databaseConfig],
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) =>
        configService.get('database')!,
    }),
  ],
})
```

---

## Configuration Best Practices

### ✅ Do:
- Use `registerAs` for complex configurations
- Inject `ConfigService` with typed approach
- Provide development defaults
- Use environment variables for secrets
- Group related configuration together

### Best Practices:
- Use environment variables for all configuration values
- Use typed configuration access with ConfigService
- Store secrets in environment variables or secure vaults
- Separate configuration concerns into focused modules
- Leverage SDK's automatic JWT handling instead of custom implementation

---

## Complete Configuration Example

```typescript
// app.module.ts - Production-ready configuration
@Module({
  imports: [
    // Configuration management
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      load: [rocketsServerConfig, databaseConfig],
      cache: true,
    }),

    // Database configuration
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) =>
        configService.get('database')!,
    }),

    // Extended TypeORM for ModelServices
    TypeOrmExtModule.forFeature({
      user: { entity: UserEntity },
      role: { entity: RoleEntity },
      userRole: { entity: UserRoleEntity },
      userOtp: { entity: UserOtpEntity },
      federated: { entity: FederatedEntity },
    }),

    // Rockets Server SDK
    RocketsServerModule.forRootAsync({
      imports: [TypeOrmModule.forFeature([UserEntity])],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const rocketsConfig = configService.get('rocketsServer');
        return {
          services: {
            mailerService: {
              sendMail: async (options: any) => {
                // Your email implementation or mock for development
                console.log('📧 Email would be sent:', options.to);
                return Promise.resolve();
              },
            },
          },
          settings: rocketsConfig,
        };
      },
      // Optional: Admin user management
      userCrud: {
        imports: [TypeOrmModule.forFeature([UserEntity])],
        adapter: UserTypeOrmCrudAdapter,
        model: UserDto,
        dto: {
          createOne: UserCreateDto,
          updateOne: UserUpdateDto,
        },
      },
    }),

    // Custom modules
    UserModule,
    RoleModule,
    // ... other business modules
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
```

This configuration provides a production-ready setup with proper type safety, environment variable management, and SDK integration.