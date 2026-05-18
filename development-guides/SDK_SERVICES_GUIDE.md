# SDK Services Integration Guide

> **For AI Tools**: This guide contains patterns for working with Rockets SDK services, dependency injection, and service extension strategies.

## 📋 **Quick Reference**

| Task | Section | Pattern |
|------|---------|---------|
| **Use existing SDK services** | [Working with SDK Services](#working-with-sdk-services) | Direct injection |
| **Extend SDK services** | [Service Extension Patterns](#service-extension-patterns) | Extend base class |
| **Custom services for business** | [Custom Service Implementation](#custom-service-implementation) | ModelService pattern |
| **Inject SDK services** | [SDK Service Injection](#sdk-service-injection) | Constructor injection |
| **CRUD with SDK services** | [CRUD Integration](#crud-integration-with-sdk-services) | Adapter + Service |

---

## ⚠️ Critical Rules for SDK Services

### **NEVER inject repositories directly**
```typescript
// ❌ WRONG - Direct repository injection
constructor(
  @InjectRepository(UserEntity)
  private userRepo: Repository<UserEntity>
) {}

// ✅ CORRECT - Use ModelService abstraction
constructor(
  @Inject(UserModelService)
  private userModelService: UserModelService
) {}
```

### **Use SDK services when available**
```typescript
// ❌ WRONG - Recreating authentication logic
class CustomAuth {
  async validatePassword(plain: string, hash: string) {
    // Custom password validation logic...
  }
}

// ✅ CORRECT - Use SDK PasswordService
constructor(
  private readonly passwordService: PasswordService
) {}

async validateCredentials(password: string, user: UserEntity) {
  return this.passwordService.validateObject({
    passwordPlain: password,
    passwordHash: user.password,
  });
}
```

### **Extend vs Create Decision Matrix**

| Scenario | Action | Reason |
|----------|---------|---------|
| Basic user operations | Use `UserModelService` as-is | Already implemented |
| Custom user business logic | Extend `UserModelService` | Add methods, preserve base |
| Non-SDK entity (Pet, Song) | Create new `ModelService` | SDK doesn't provide this |
| Authentication logic | Use SDK auth services | Security best practices |
| Password operations | Use `PasswordService` | Crypto implementations |

---

## Working with SDK Services

### Available SDK Services

The Rockets SDK provides these ready-to-use services:

```typescript
// Authentication & User Management
import { 
  UserModelService,           // User CRUD operations
  UserLookupService,          // User queries by username/email
  AuthenticationService,      // Login/logout operations
  PasswordService,           // Password hashing/validation
  OtpService,               // One-time password management
} from '@concepta/nestjs-user';

// Role & Access Control
import { 
  RoleModelService,          // Role CRUD operations
  RoleService,              // Role assignment operations
} from '@concepta/nestjs-role';

// Additional Services
import {
  PasswordCreationService,   // Password generation
} from '@concepta/nestjs-password';

import {
  AccessControlService,      // Permission checking
} from '@concepta/nestjs-access-control';
```

### Basic SDK Service Usage

```typescript
// services/custom-auth.service.ts
import { Injectable } from '@nestjs/common';
import { 
  UserLookupService,
  PasswordService,
  AuthenticationService
} from '@concepta/nestjs-user';

@Injectable()
export class CustomAuthService {
  constructor(
    private readonly userLookupService: UserLookupService,
    private readonly passwordService: PasswordService,
    private readonly authService: AuthenticationService,
  ) {}

  /**
   * Custom login with business validation
   */
  async authenticateUser(username: string, password: string) {
    // 1. Use SDK's user lookup
    const user = await this.userLookupService.byUsername(username);
    if (!user) {
      throw new Error('Invalid credentials');
    }

    // 2. Custom business validation
    if (!user.isVerified) {
      throw new Error('Account not verified');
    }

    // 3. Use SDK's password validation
    const isValid = await this.passwordService.validateObject({
      passwordPlain: password,
      passwordHash: user.password,
    });

    if (!isValid) {
      throw new Error('Invalid credentials');
    }

    // 4. Use SDK's authentication service for tokens
    const tokens = await this.authService.login(user);
    
    return {
      ...tokens,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
      },
    };
  }
}
```

---

## SDK Service Injection

### Method 1: Direct Injection (Recommended)

```typescript
// services/user-business.service.ts
import { Injectable } from '@nestjs/common';
import { UserModelService } from '@concepta/nestjs-user';
import { RoleModelService } from '@concepta/nestjs-role';

@Injectable()
export class UserBusinessService {
  constructor(
    private readonly userModelService: UserModelService,
    private readonly roleModelService: RoleModelService,
  ) {}

  async createUserWithRole(userData: any, roleName: string) {
    // Create user using SDK service
    const user = await this.userModelService.create(userData);
    
    // Assign role using SDK service
    const role = await this.roleModelService.findByName(roleName);
    if (role) {
      // Use role assignment service...
    }
    
    return user;
  }
}
```

### Method 2: Application Bootstrap Injection

```typescript
// main.ts - For initialization logic
import { UserModelService, RoleModelService } from '@concepta/nestjs-user';
import { PasswordCreationService } from '@concepta/nestjs-password';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  // Get SDK services for bootstrap operations
  const userModelService = app.get(UserModelService);
  const roleModelService = app.get(RoleModelService);
  const passwordService = app.get(PasswordCreationService);
  
  // Use services for initial setup
  await ensureAdminUser(userModelService, roleModelService, passwordService);
  
  await app.listen(3000);
}

async function ensureAdminUser(
  userService: UserModelService,
  roleService: RoleModelService,
  passwordService: PasswordCreationService
) {
  const adminEmail = 'admin@example.com';
  
  // Check if admin exists using SDK service
  let adminUser = await userService.findOne({
    where: { email: adminEmail }
  });

  if (!adminUser) {
    // Create admin using SDK services
    const hashedPassword = await passwordService.hash('admin123');
    
    adminUser = await userService.create({
      email: adminEmail,
      username: 'admin',
      password: hashedPassword,
      active: true,
    });
  }
}
```

### Method 3: Factory Provider Pattern

```typescript
// Custom provider with SDK service dependencies
import { Provider } from '@nestjs/common';
import { UserModelService } from '@concepta/nestjs-user';

const CUSTOM_USER_SERVICE = 'CUSTOM_USER_SERVICE';

export const customUserServiceProvider: Provider = {
  provide: CUSTOM_USER_SERVICE,
  inject: [UserModelService],
  useFactory: (userModelService: UserModelService) => {
    return new CustomUserService(userModelService);
  },
};

class CustomUserService {
  constructor(private readonly userModelService: UserModelService) {}
  
  async getActiveUsers() {
    return this.userModelService.findMany({
      where: { active: true }
    });
  }
}
```

---

## Service Extension Patterns

### Extending SDK Services

**When to extend**: You need additional methods or want to override existing behavior.

```typescript
// services/enhanced-user-model.service.ts
import { Injectable } from '@nestjs/common';
import {
  RepositoryInterface,
  InjectDynamicRepository,
} from '@concepta/nestjs-common';
import { 
  UserModelService,
  UserEntityInterface,
  USER_MODULE_USER_ENTITY_KEY 
} from '@concepta/nestjs-user';

@Injectable()
export class EnhancedUserModelService extends UserModelService {
  constructor(
    @InjectDynamicRepository(USER_MODULE_USER_ENTITY_KEY)
    repo: RepositoryInterface<UserEntityInterface>,
  ) {
    super(repo);
  }

  /**
   * Custom method: Get user profile completion percentage
   */
  async getUserProfileCompletion(userId: string): Promise<number> {
    const user = await this.byId(userId);
    
    const fields = ['firstName', 'lastName', 'phoneNumber', 'avatar'];
    const completedFields = fields.filter(field => !!user[field]);
    
    return Math.round((completedFields.length / fields.length) * 100);
  }

  /**
   * Override: Add custom validation to user creation
   */
  async create(data: any): Promise<UserEntityInterface> {
    // Custom business validation
    if (data.age && data.age < 18) {
      throw new Error('User must be at least 18 years old');
    }

    // Custom data enrichment
    const enrichedData = {
      ...data,
      isVerified: false,
      lastLoginAt: null,
    };

    // Call parent implementation
    return super.create(enrichedData);
  }

  /**
   * Custom method: Advanced user search
   */
  async searchUsers(criteria: {
    name?: string;
    email?: string;
    isVerified?: boolean;
    registeredAfter?: Date;
  }): Promise<UserEntityInterface[]> {
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

    if (criteria.registeredAfter) {
      query = query.andWhere('user.dateCreated >= :date', { 
        date: criteria.registeredAfter 
      });
    }

    return query.getMany();
  }
}
```

### Extending Role Services

```typescript
// services/enhanced-role-model.service.ts
import { Injectable } from '@nestjs/common';
import {
  RepositoryInterface,
  InjectDynamicRepository,
} from '@concepta/nestjs-common';
import {
  RoleModelService,
  RoleEntityInterface,
  ROLE_MODULE_ROLE_ENTITY_KEY
} from '@concepta/nestjs-role';

@Injectable()
export class EnhancedRoleModelService extends RoleModelService {
  constructor(
    @InjectDynamicRepository(ROLE_MODULE_ROLE_ENTITY_KEY)
    roleRepository: RepositoryInterface<RoleEntityInterface>,
  ) {
    super(roleRepository);
  }

  /**
   * Custom method: Get roles with user counts
   */
  async getRolesWithUserCounts(): Promise<Array<RoleEntityInterface & { userCount: number }>> {
    const roles = await this.findMany();
    
    // Add user count to each role
    const rolesWithCounts = await Promise.all(
      roles.map(async (role) => {
        const userCount = await this.getUserCountForRole(role.id);
        return { ...role, userCount };
      })
    );

    return rolesWithCounts;
  }

  /**
   * Custom method: Check if role is deletable
   */
  async isRoleDeletable(roleId: string): Promise<boolean> {
    const userCount = await this.getUserCountForRole(roleId);
    return userCount === 0;
  }

  private async getUserCountForRole(roleId: string): Promise<number> {
    // Implementation depends on your user-role relationship
    // This would typically join with user_role table
    return 0; // Placeholder
  }
}
```

---

## Custom Service Implementation

### Creating Business-Specific Services

For entities not provided by the SDK, create custom ModelServices:

```typescript
// services/pet-model.service.ts
import { Injectable } from '@nestjs/common';
import {
  RepositoryInterface,
  ModelService,
  InjectDynamicRepository,
} from '@concepta/nestjs-common';
import { 
  PetEntityInterface,
  PetCreatableInterface,
  PetUpdatableInterface,
  PetModelServiceInterface
} from '../interfaces/pet.interface';
import { PET_MODULE_PET_ENTITY_KEY } from '../constants/pet.constants';
import { PetCreateDto, PetUpdateDto } from '../dto/pet.dto';

@Injectable()
export class PetModelService
  extends ModelService<
    PetEntityInterface,
    PetCreatableInterface,
    PetUpdatableInterface
  >
  implements PetModelServiceInterface
{
  protected createDto = PetCreateDto;
  protected updateDto = PetUpdateDto;

  constructor(
    @InjectDynamicRepository(PET_MODULE_PET_ENTITY_KEY)
    repo: RepositoryInterface<PetEntityInterface>,
  ) {
    super(repo);
  }

  /**
   * Business method: Find pets by owner
   */
  async findByOwnerId(ownerId: string): Promise<PetEntityInterface[]> {
    return this.repo.find({
      where: { 
        ownerId,
        dateDeleted: undefined 
      }
    });
  }

  /**
   * Business method: Check ownership
   */
  async isPetOwnedBy(petId: string, ownerId: string): Promise<boolean> {
    const pet = await this.repo.findOne({
      where: { id: petId, ownerId }
    });
    return !!pet;
  }
}
```

### Combining SDK and Custom Services

```typescript
// services/pet-management.service.ts
import { Injectable } from '@nestjs/common';
import { UserModelService } from '@concepta/nestjs-user';
import { PetModelService } from './pet-model.service';

@Injectable()
export class PetManagementService {
  constructor(
    private readonly userModelService: UserModelService,  // SDK service
    private readonly petModelService: PetModelService,    // Custom service
  ) {}

  /**
   * Business operation combining SDK and custom services
   */
  async transferPetOwnership(petId: string, newOwnerId: string, currentUserId: string) {
    // 1. Verify current user owns the pet (custom service)
    const isOwner = await this.petModelService.isPetOwnedBy(petId, currentUserId);
    if (!isOwner) {
      throw new Error('You do not own this pet');
    }

    // 2. Verify new owner exists (SDK service)
    const newOwner = await this.userModelService.byId(newOwnerId);
    if (!newOwner) {
      throw new Error('New owner not found');
    }

    // 3. Transfer ownership (custom service)
    const pet = await this.petModelService.update({
      id: petId,
      ownerId: newOwnerId,
    });

    return {
      pet,
      newOwner: {
        id: newOwner.id,
        username: newOwner.username,
        email: newOwner.email,
      },
    };
  }
}
```

---

## CRUD Integration with SDK Services

### CRUD Service with SDK Integration

```typescript
// crud/user-crud.service.ts
import { Inject, Injectable } from '@nestjs/common';
import { UserModelService } from '@concepta/nestjs-user';
import { RoleService } from '@concepta/nestjs-role';

export class UserCrudService extends ConfigurableServiceClass {
  constructor(
    @Inject(UserTypeOrmCrudAdapter)
    protected readonly crudAdapter: UserTypeOrmCrudAdapter,
    private readonly userModelService: UserModelService,
    private readonly roleService: RoleService,
  ) {
    super();
  }

  /**
   * Override createOne to add role assignment
   */
  async createOne(body: UserCreateDto): Promise<UserDto> {
    // 1. Create user via CRUD adapter
    const user = await super.createOne(body);

    // 2. Assign default role using SDK service
    if (body.roleName) {
      await this.roleService.assignRole(user.id, body.roleName);
    }

    // 3. Return enriched user data using SDK service
    return this.userModelService.byId(user.id);
  }

  /**
   * Override updateOne to prevent role changes via CRUD
   */
  async updateOne(id: string, body: UserUpdateDto): Promise<UserDto> {
    // Remove role data from update (use separate role endpoint)
    const { roleName, ...updateData } = body;
    
    return super.updateOne(id, updateData);
  }
}
```

### Access Control Service Implementation

```typescript
// services/access-control.service.ts
import { Injectable, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AccessControlServiceInterface } from '@concepta/nestjs-access-control';

@Injectable()
export class AccessControlService implements AccessControlServiceInterface {
  /**
   * Extract user from JWT token (populated by RocketsJwtAuthAdapter)
   */
  async getUser<T>(context: ExecutionContext): Promise<T> {
    const request = context.switchToHttp().getRequest();
    return request.user as T;
  }

  /**
   * Extract user roles for permission checking
   */
  async getUserRoles(context: ExecutionContext): Promise<string[]> {
    const user = await this.getUser<{
      id: string;
      userRoles?: { role: { name: string } }[];
    }>(context);

    if (!user || !user.id) {
      throw new UnauthorizedException('User not authenticated');
    }

    // Roles are populated by RocketsJwtAuthAdapter during token validation
    return user.userRoles?.map(ur => ur.role.name) || [];
  }
}
```

---

## Best Practices for Service Architecture

### 1. Service Layer Hierarchy

```typescript
// Recommended service architecture
Controller → Business Service → SDK Service/ModelService → Repository
```

Example:
```typescript
// controllers/user.controller.ts
@Controller('users')
export class UserController {
  constructor(
    private readonly userBusinessService: UserBusinessService
  ) {}

  @Post()
  async createUser(@Body() userData: UserCreateDto) {
    return this.userBusinessService.createUserWithProfile(userData);
  }
}

// services/user-business.service.ts
@Injectable()
export class UserBusinessService {
  constructor(
    private readonly userModelService: UserModelService,    // SDK service
    private readonly roleService: RoleService,              // SDK service
    private readonly notificationService: NotificationService, // Custom service
  ) {}

  async createUserWithProfile(userData: UserCreateDto) {
    // Business logic orchestration
    const user = await this.userModelService.create(userData);
    await this.roleService.assignRole(user.id, 'user');
    await this.notificationService.sendWelcomeEmail(user.email);
    return user;
  }
}
```

### 2. Dependency Injection Patterns

**✅ CORRECT: Direct injection**
```typescript
constructor(
  private readonly userModelService: UserModelService,
  private readonly roleModelService: RoleModelService,
) {}
```

**❌ WRONG: Repository injection**
```typescript
constructor(
  @InjectRepository(UserEntity)
  private userRepo: Repository<UserEntity>,
) {}
```

### 3. Error Handling with SDK Services

```typescript
// services/user-operations.service.ts
import { Injectable } from '@nestjs/common';
import { UserModelService } from '@concepta/nestjs-user';
import { UserNotFoundException } from './exceptions/user-not-found.exception';

@Injectable()
export class UserOperationsService {
  constructor(
    private readonly userModelService: UserModelService,
  ) {}

  async getUserSafely(userId: string): Promise<UserEntityInterface> {
    try {
      return await this.userModelService.byId(userId);
    } catch (error) {
      // Convert SDK errors to business errors
      throw new UserNotFoundException(`User with ID ${userId} not found`);
    }
  }
}
```

### 4. Configuration Injection with SDK Services

```typescript
// services/notification.service.ts
import { Injectable, Inject } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { UserModelService } from '@concepta/nestjs-user';
import { emailConfig } from '../config/email.config';

@Injectable()
export class NotificationService {
  constructor(
    private readonly userModelService: UserModelService,
    @Inject(emailConfig.KEY)
    private readonly emailSettings: ConfigType<typeof emailConfig>,
  ) {}

  async sendUserNotification(userId: string, message: string) {
    const user = await this.userModelService.byId(userId);
    
    // Use injected configuration
    await this.sendEmail({
      to: user.email,
      from: this.emailSettings.fromAddress,
      subject: 'Notification',
      body: message,
    });
  }
}
```

### 5. Testing SDK Service Integration

```typescript
// user-business.service.spec.ts
import { Test } from '@nestjs/testing';
import { UserModelService } from '@concepta/nestjs-user';
import { UserBusinessService } from './user-business.service';

describe('UserBusinessService', () => {
  let service: UserBusinessService;
  let userModelService: jest.Mocked<UserModelService>;

  beforeEach(async () => {
    const mockUserModelService = {
      create: jest.fn(),
      byId: jest.fn(),
      update: jest.fn(),
    };

    const module = await Test.createTestingModule({
      providers: [
        UserBusinessService,
        {
          provide: UserModelService,
          useValue: mockUserModelService,
        },
      ],
    }).compile();

    service = module.get(UserBusinessService);
    userModelService = module.get(UserModelService);
  });

  it('should create user with business logic', async () => {
    userModelService.create.mockResolvedValue({ id: '1', email: 'test@example.com' });
    
    const result = await service.createUserWithProfile({
      email: 'test@example.com',
      username: 'testuser',
    });

    expect(userModelService.create).toHaveBeenCalled();
    expect(result).toBeDefined();
  });
});
```

---

## Summary

### ✅ **Use SDK Services When:**
- Basic user/role CRUD operations
- Authentication and authorization
- Password operations
- OTP management
- Standard business logic

### ✅ **Extend SDK Services When:**
- Adding custom business methods
- Overriding default behavior
- Adding validation logic
- Enhancing existing functionality

### ✅ **Create Custom Services When:**
- Working with non-SDK entities (Pet, Product, etc.)
- Complex business orchestration
- Integration with external services
- Domain-specific operations

### ❌ **Never:**
- Inject repositories directly
- Recreate SDK functionality
- Bypass SDK authentication services
- Mix injection patterns in the same service

This approach ensures you leverage the full power of the Rockets SDK while maintaining clean, testable, and maintainable code architecture.