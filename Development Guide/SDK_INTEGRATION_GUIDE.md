# SDK Integration Guide

> **For AI Tools**: This guide contains patterns for extending and integrating with Rockets Server SDK. Use this when customizing user entities, DTOs, and SDK services.

## 📋 **Quick Reference**

| Task | Section |
|------|---------|
| Extend user DTOs | [Custom User DTOs](#custom-user-dtos) |
| Extend user entity | [Custom User Entities](#custom-user-entities) |
| Work with SDK services | [SDK Service Integration](#sdk-service-integration) |
| Customize authentication | [Authentication Customization](#authentication-customization) |
| Configure SDK features | [SDK Configuration](#sdk-configuration) |

---

## Custom User DTOs

### 1. Extend Base User DTO

**Extend from Rockets SDK DTOs instead of creating from scratch:**

```typescript
// user.dto.ts
import { RocketsServerUserDto } from '@bitwild/rockets-server';
import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import { IsOptional, IsNumber, Min, IsString, MinLength } from 'class-validator';

export class UserDto extends RocketsServerUserDto {
  @ApiProperty({
    description: 'User age',
    example: 25,
    required: false,
    minimum: 18,
  })
  @IsOptional()
  @IsNumber({}, { message: 'Age must be a number' })
  @Min(18, { message: 'Must be at least 18 years old' })
  @Expose()
  age?: number;

  @ApiProperty({
    description: 'User first name',
    example: 'John',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'First name must be at least 2 characters' })
  @Expose()
  firstName?: string;

  @ApiProperty({
    description: 'User last name',
    example: 'Doe',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'Last name must be at least 2 characters' })
  @Expose()
  lastName?: string;
}
```

### 2. Create User Create DTO

```typescript
// user-create.dto.ts
import { RocketsServerUserCreateDto } from '@bitwild/rockets-server';
import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsOptional, Min, IsString, MinLength } from 'class-validator';

export class UserCreateDto extends RocketsServerUserCreateDto {
  @ApiProperty({
    description: 'User age (must be 18 or older)',
    example: 25,
    required: false,
    minimum: 18,
  })
  @IsOptional()
  @IsNumber({}, { message: 'Age must be a number' })
  @Min(18, { message: 'Must be at least 18 years old' })
  age?: number;

  @ApiProperty({
    description: 'User first name',
    example: 'John',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'First name must be at least 2 characters' })
  firstName?: string;

  @ApiProperty({
    description: 'User last name',
    example: 'Doe',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'Last name must be at least 2 characters' })
  lastName?: string;
}
```

### 3. Create User Update DTO

```typescript
// user-update.dto.ts
import { RocketsServerUserUpdateDto } from '@bitwild/rockets-server';
import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsOptional, Min, IsString, MinLength } from 'class-validator';

export class UserUpdateDto extends RocketsServerUserUpdateDto {
  @ApiProperty({
    description: 'User age (must be 18 or older)',
    example: 25,
    required: false,
    minimum: 18,
  })
  @IsOptional()
  @IsNumber({}, { message: 'Age must be a number' })
  @Min(18, { message: 'Must be at least 18 years old' })
  age?: number;

  @ApiProperty({
    description: 'User first name',
    example: 'John',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'First name must be at least 2 characters' })
  firstName?: string;

  @ApiProperty({
    description: 'User last name',
    example: 'Doe',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'Last name must be at least 2 characters' })
  lastName?: string;
}
```

**Key Points:**
- ✅ **Always extend SDK DTOs**: Don't create from scratch
- ✅ **Use @Expose()**: Required for custom fields in base DTO
- ✅ **Add validation**: Use class-validator decorators
- ✅ **Document with @ApiProperty**: For Swagger documentation

---

## Custom User Entities

### 1. Extend SDK Entity

```typescript
// user.entity.ts
import { Entity, Column, OneToMany } from 'typeorm';
import { UserSqliteEntity } from '@concepta/nestjs-typeorm-ext';
import { UserOtpEntity } from './user-otp.entity';
import { FederatedEntity } from './federated.entity';
import { UserEntityInterface } from './user.interface';

@Entity('user')
export class UserEntity extends UserSqliteEntity implements UserEntityInterface {
  // Add custom fields
  @Column({ type: 'integer', nullable: true })
  age?: number;

  @Column({ type: 'varchar', length: 50, nullable: true })
  firstName?: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  lastName?: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  phoneNumber?: string;

  @Column({ type: 'simple-array', nullable: true })
  tags?: string[];

  @Column({ type: 'boolean', default: false })
  isVerified?: boolean;

  @Column({ type: 'datetime', nullable: true })
  lastLoginAt?: Date;

  // SDK relationships (already provided by base entity)
  @OneToMany(() => UserOtpEntity, (userOtp) => userOtp.assignee)
  userOtps?: UserOtpEntity[];
  
  @OneToMany(() => FederatedEntity, (federated) => federated.assignee)
  federatedAccounts?: FederatedEntity[];
}
```

### 2. Create Custom Interfaces

```typescript
// user.interface.ts
import { RocketsServerUserEntityInterface } from '@bitwild/rockets-server';

/**
 * User Entity Interface
 * Extends SDK interface with custom fields
 */
export interface UserEntityInterface extends RocketsServerUserEntityInterface {
  age?: number;
  firstName?: string;
  lastName?: string;
  phoneNumber?: string;
  tags?: string[];
  isVerified?: boolean;
  lastLoginAt?: Date;
}

/**
 * User Interface for DTOs
 */
export interface UserInterface extends RocketsServerUserInterface {
  age?: number;
  firstName?: string;
  lastName?: string;
  phoneNumber?: string;
  tags?: string[];
  isVerified?: boolean;
  lastLoginAt?: Date;
}

/**
 * User Creatable Interface
 */
export interface UserCreatableInterface
  extends Pick<UserInterface, 'username' | 'email'>,
    Partial<Pick<UserInterface, 'active' | 'age' | 'firstName' | 'lastName'>>,
    RocketsServerUserCreatableInterface {}

/**
 * User Updatable Interface
 */
export interface UserUpdatableInterface
  extends Partial<Pick<UserInterface, 'age' | 'firstName' | 'lastName'>>,
    RocketsServerUserUpdatableInterface {}
```

**Key Points:**
- ✅ **Choose correct base entity**: `UserSqliteEntity` or `UserPostgresEntity`
- ✅ **Always implement custom interface**: Type safety for custom fields
- ✅ **Make custom fields nullable**: Unless required by business rules
- ✅ **Use appropriate column types**: Match your database choice

---

## SDK Service Integration

### Working with Built-in Services

The SDK provides several services you can inject and use:

```typescript
// custom-auth.service.ts
import { Injectable } from '@nestjs/common';
import { 
  AuthenticationService,
  UserLookupService,
  PasswordService,
  OtpService 
} from '@bitwild/rockets-server';

@Injectable()
export class CustomAuthService {
  constructor(
    private readonly authService: AuthenticationService,
    private readonly userLookupService: UserLookupService,
    private readonly passwordService: PasswordService,
    private readonly otpService: OtpService,
  ) {}

  /**
   * Custom login with additional validation
   */
  async customLogin(username: string, password: string): Promise<any> {
    try {
      // Use SDK's user lookup
      const user = await this.userLookupService.byUsername(username);
      
      if (!user) {
        throw new Error('Invalid credentials');
      }

      // Custom business logic - check if user is verified
      if (!user.isVerified) {
        throw new Error('Account not verified. Please verify your email.');
      }

      // Use SDK's password validation
      const isValidPassword = await this.passwordService.validateObject({
        passwordPlain: password,
        passwordHash: user.password,
      });

      if (!isValidPassword) {
        throw new Error('Invalid credentials');
      }

      // Use SDK's authentication service
      const tokens = await this.authService.login(user);
      
      // Update last login timestamp
      await this.updateLastLogin(user.id);
      
      return {
        ...tokens,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
        },
      };
    } catch (error) {
      console.error('Custom login error:', error);
      throw error;
    }
  }

  /**
   * Send custom OTP with business logic
   */
  async sendCustomOTP(email: string): Promise<void> {
    // Custom validation
    const user = await this.userLookupService.byEmail(email);
    if (!user) {
      throw new Error('User not found');
    }

    if (user.isVerified) {
      throw new Error('User already verified');
    }

    // Use SDK's OTP service
    await this.otpService.send(user.id, 'email-verification');
  }

  private async updateLastLogin(userId: string): Promise<void> {
    // Custom logic to update last login timestamp
    // This would typically use your UserModelService
  }
}
```

### Extending SDK Services

```typescript
// enhanced-user.service.ts
import { Injectable } from '@nestjs/common';
import { UserModelService } from '@concepta/nestjs-user';

@Injectable()
export class EnhancedUserService extends UserModelService {
  
  /**
   * Get user with profile completion percentage
   */
  async getUserWithProfileCompletion(id: string) {
    const user = await this.byId(id);
    
    const profileCompletion = this.calculateProfileCompletion(user);
    
    return {
      ...user,
      profileCompletion,
    };
  }

  /**
   * Custom user search with business logic
   */
  async searchUsers(criteria: {
    name?: string;
    email?: string;
    isVerified?: boolean;
    tags?: string[];
  }) {
    let query = this.repo.createQueryBuilder('user');

    if (criteria.name) {
      query = query.andWhere(
        'CONCAT(user.firstName, \' \', user.lastName) ILIKE :name',
        { name: `%${criteria.name}%` }
      );
    }

    if (criteria.email) {
      query = query.andWhere('user.email ILIKE :email', { 
        email: `%${criteria.email}%` 
      });
    }

    if (criteria.isVerified !== undefined) {
      query = query.andWhere('user.isVerified = :isVerified', { 
        isVerified: criteria.isVerified 
      });
    }

    if (criteria.tags && criteria.tags.length > 0) {
      query = query.andWhere('user.tags && :tags', { tags: criteria.tags });
    }

    return await query.getMany();
  }

  private calculateProfileCompletion(user: any): number {
    const fields = ['firstName', 'lastName', 'phoneNumber', 'age'];
    const completedFields = fields.filter(field => !!user[field]);
    return Math.round((completedFields.length / fields.length) * 100);
  }
}
```

---

## Authentication Customization

### Custom Guards

```typescript
// custom-auth.guard.ts
import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Observable } from 'rxjs';

@Injectable()
export class CustomJwtAuthGuard extends AuthGuard('jwt') implements CanActivate {
  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    // Add custom logic before JWT validation
    const request = context.switchToHttp().getRequest();
    
    // Example: Check for maintenance mode
    if (this.isMaintenanceMode() && !this.isAdminUser(request)) {
      return false;
    }

    return super.canActivate(context);
  }

  handleRequest(err: any, user: any, info: any, context: ExecutionContext) {
    // Add custom logic after JWT validation
    const request = context.switchToHttp().getRequest();
    
    if (user) {
      // Add custom user properties
      user.lastActiveAt = new Date();
      request.user = user;
    }

    return super.handleRequest(err, user, info, context);
  }

  private isMaintenanceMode(): boolean {
    return process.env.MAINTENANCE_MODE === 'true';
  }

  private isAdminUser(request: any): boolean {
    // Check if user has admin role
    return request.headers['x-admin-key'] === process.env.ADMIN_KEY;
  }
}
```

### Custom Strategies

```typescript
// custom-local.strategy.ts
import { Strategy } from 'passport-local';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { CustomAuthService } from './custom-auth.service';

@Injectable()
export class CustomLocalStrategy extends PassportStrategy(Strategy, 'custom-local') {
  constructor(private customAuthService: CustomAuthService) {
    super({
      usernameField: 'username',
      passwordField: 'password',
    });
  }

  async validate(username: string, password: string): Promise<any> {
    try {
      const result = await this.customAuthService.customLogin(username, password);
      return result.user;
    } catch (error) {
      throw new UnauthorizedException(error.message);
    }
  }
}
```

### Custom Controllers

```typescript
// custom-auth.controller.ts
import { Controller, Post, Body, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { CustomAuthService } from './custom-auth.service';
import { UserCreateDto } from './user.dto';

@ApiTags('custom-auth')
@Controller('custom-auth')
export class CustomAuthController {
  constructor(private readonly customAuthService: CustomAuthService) {}

  @Post('login')
  @UseGuards(AuthGuard('custom-local'))
  @ApiOperation({ summary: 'Custom login with additional validation' })
  @ApiResponse({ status: 200, description: 'Login successful' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  async customLogin(@Request() req) {
    // User is already validated by the guard
    return {
      message: 'Login successful',
      user: req.user,
    };
  }

  @Post('register')
  @ApiOperation({ summary: 'Register new user with custom validation' })
  async register(@Body() createUserDto: UserCreateDto) {
    return await this.customAuthService.registerUser(createUserDto);
  }

  @Post('verify-email')
  @ApiOperation({ summary: 'Verify email with OTP' })
  async verifyEmail(@Body() body: { email: string; otp: string }) {
    return await this.customAuthService.verifyEmail(body.email, body.otp);
  }
}
```

---

## SDK Configuration

### Complete SDK Setup

```typescript
// app.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TypeOrmExtModule } from '@concepta/nestjs-typeorm-ext';
import { RocketsServerModule } from '@bitwild/rockets-server';

// Custom entities
import { UserEntity } from './modules/user/user.entity';
import { UserOtpEntity } from './modules/user/user-otp.entity';
import { FederatedEntity } from './modules/user/federated.entity';
import { RoleEntity } from './modules/role/role.entity';
import { UserRoleEntity } from './modules/role/user-role.entity';

// Custom DTOs
import { UserDto, UserCreateDto, UserUpdateDto } from './modules/user/user.dto';

// Custom adapters
import { UserTypeOrmCrudAdapter } from './modules/user/user-typeorm-crud.adapter';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),

    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get('DATABASE_HOST'),
        port: configService.get('DATABASE_PORT'),
        username: configService.get('DATABASE_USERNAME'),
        password: configService.get('DATABASE_PASSWORD'),
        database: configService.get('DATABASE_NAME'),
        entities: [__dirname + '/**/*.entity{.ts,.js}'],
        synchronize: configService.get('NODE_ENV') === 'development',
      }),
    }),

    TypeOrmExtModule.forFeature({
      user: { entity: UserEntity },
      role: { entity: RoleEntity },
      userRole: { entity: UserRoleEntity },
      userOtp: { entity: UserOtpEntity },
      federated: { entity: FederatedEntity },
    }),

    RocketsServerModule.forRootAsync({
      imports: [TypeOrmModule.forFeature([UserEntity])],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        // Services configuration
        services: {
          mailerService: {
            sendMail: async (options: any) => {
              console.log('📧 Email would be sent:', options.to);
              // Implement your email service here
              return Promise.resolve();
            },
          },
        },

        // Settings configuration
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

      // Enable admin user management
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

    // Your business modules
    // ArtistModule,
    // SongModule,
    // etc.
  ],
})
export class AppModule {}
```

### Environment Variables

```bash
# .env
DATABASE_TYPE=postgres
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_USERNAME=myapp
DATABASE_PASSWORD=password
DATABASE_NAME=myapp_development

BASE_URL=http://localhost:3000
PORT=3000

EMAIL_FROM=noreply@myapp.com

# Optional - SDK generates these if not provided
JWT_ACCESS_SECRET=your-access-secret
JWT_REFRESH_SECRET=your-refresh-secret

ADMIN_ROLE_NAME=Admin
```

---

## Important Notes

### ✅ What the SDK Provides Automatically:

- **JWT Configuration**: Automatic token generation and validation
- **User Management**: Complete user CRUD with validation
- **Authentication Endpoints**: Login, signup, refresh, recovery
- **OTP System**: Email-based OTP for 2FA
- **OAuth Integration**: Google, GitHub, Apple OAuth flows
- **Password Security**: Automatic hashing and validation
- **Role Management**: Basic role and user-role entities

### ✅ When to Extend vs Use As-Is:

**Extend When:**
- Adding custom user fields (age, firstName, etc.)
- Custom validation rules beyond SDK defaults
- Additional authentication flows
- Custom email templates or delivery
- Business-specific user roles or permissions

**Use As-Is When:**
- Standard user authentication is sufficient
- Basic user profile management works
- Standard password recovery is adequate
- Default role system meets needs

### Best Practices:

- **Leverage SDK functionality**: Use built-in endpoints instead of recreating authentication logic
- **Extend SDK services**: Customize by extending SDK services rather than bypassing them
- **Implement interfaces properly**: Ensure custom entities implement required SDK interfaces for compatibility
- **Use @Expose() decorators**: Always include @Expose() for custom DTO fields to ensure proper serialization
- **Consistent entity base classes**: Stick to one entity base class (SQLite vs Postgres) throughout your application

This integration pattern ensures you get the full benefit of the Rockets Server SDK while maintaining the flexibility to customize for your specific business needs.