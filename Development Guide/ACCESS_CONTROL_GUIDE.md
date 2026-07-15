# Access Control Guide

> **For AI Tools**: This guide contains role-based access control patterns and permission management. Use this when implementing security and authorization in your modules.

## 📋 **Quick Reference**

| Task | Section |
|------|---------|
| Create access query service | [Access Query Service](#access-query-service-pattern) |
| Add controller decorators | [Controller Access Control](#controller-access-control) |
| Define resource types | [Resource Type Definitions](#resource-type-definitions) |
| Role-based permissions | [Role Permission Patterns](#role-permission-patterns) |
| Custom access logic | [Business Logic Access Control](#business-logic-access-control) |

---

## Core Concepts

### Access Control Flow

```
Request → Guards → Access Query Service → Business Logic Check → Allow/Deny
```

### Key Components

1. **Resource Types**: Define what can be accessed (`artist-one`, `artist-many`)
2. **Access Query Service**: Implements permission logic (`CanAccess` interface)
3. **Decorators**: Apply access control to controller endpoints
4. **Context**: Provides request, user, and query information

---

## Resource Type Definitions

### Basic Resource Types

```typescript
// artist.types.ts
export const ArtistResource = {
  One: 'artist-one',
  Many: 'artist-many',
} as const;

export type ArtistResourceType = typeof ArtistResource[keyof typeof ArtistResource];
```

### Advanced Resource Types

```typescript
// song.types.ts
export const SongResource = {
  One: 'song-one',
  Many: 'song-many',
  Upload: 'song-upload',
  Download: 'song-download',
  Approve: 'song-approve',
  Publish: 'song-publish',
} as const;

export type SongResourceType = typeof SongResource[keyof typeof SongResource];

// User action mapping
export const SongActions = {
  Create: ['song-one', 'song-upload'],
  Read: ['song-one', 'song-many', 'song-download'],
  Update: ['song-one'],
  Delete: ['song-one'],
  Approve: ['song-approve'],
  Publish: ['song-publish'],
} as const;
```

---

## Access Query Service Pattern

### Basic Implementation

```typescript
// artist-access-query.service.ts
import { Injectable } from '@nestjs/common';
import { AccessControlContextInterface, CanAccess } from '@concepta/nestjs-access-control';

@Injectable()
export class ArtistAccessQueryService implements CanAccess {
  
  /**
   * Main access control logic
   * Called for every request with access control decorators
   */
  async canAccess(context: AccessControlContextInterface): Promise<boolean> {
    const user = context.getUser() as any; // Cast to your user type
    const request = context.getRequest() as any;
    const query = context.getQuery();
    
    // Get the resource being accessed
    const resource = query.resource;
    const action = query.action;

    console.log(`Access check: User ${user?.id} requesting ${action} on ${resource}`);

    // Role-based access control
    switch (user?.roles?.[0]?.name) {
      case 'Admin':
        return this.checkAdminAccess(resource, action, user, request);
      
      case 'ImprintArtist':
        return this.checkImprintArtistAccess(resource, action, user, request);
      
      case 'Clerical':
        return this.checkClericalAccess(resource, action, user, request);
      
      default:
        console.log(`Access denied: Unknown role for user ${user?.id}`);
        return false;
    }
  }

  /**
   * Admin access logic - full access
   */
  private async checkAdminAccess(
    resource: string, 
    action: string, 
    user: any, 
    request: any
  ): Promise<boolean> {
    // Admins have access to everything
    console.log(`Admin access granted for ${resource}:${action}`);
    return true;
  }

  /**
   * ImprintArtist access logic - limited access
   */
  private async checkImprintArtistAccess(
    resource: string, 
    action: string, 
    user: any, 
    request: any
  ): Promise<boolean> {
    // ImprintArtists can only read artists, cannot create/update/delete
    if (resource === 'artist-one' || resource === 'artist-many') {
      if (action === 'read') {
        console.log(`ImprintArtist read access granted for ${resource}`);
        return true;
      }
    }

    console.log(`ImprintArtist access denied for ${resource}:${action}`);
    return false;
  }

  /**
   * Clerical access logic - read-only access
   */
  private async checkClericalAccess(
    resource: string, 
    action: string, 
    user: any, 
    request: any
  ): Promise<boolean> {
    // Clerical can only read artists
    if ((resource === 'artist-one' || resource === 'artist-many') && action === 'read') {
      console.log(`Clerical read access granted for ${resource}`);
      return true;
    }

    console.log(`Clerical access denied for ${resource}:${action}`);
    return false;
  }
}
```

### Advanced Implementation with Business Logic

```typescript
// song-access-query.service.ts
import { Injectable, Inject } from '@nestjs/common';
import { AccessControlContextInterface, CanAccess } from '@concepta/nestjs-access-control';
import { SongModelService } from './song-model.service';

@Injectable()
export class SongAccessQueryService implements CanAccess {
  constructor(
    private readonly songModelService: SongModelService,
  ) {}

  async canAccess(context: AccessControlContextInterface): Promise<boolean> {
    const user = context.getUser() as any;
    const request = context.getRequest() as any;
    const query = context.getQuery();
    
    const resource = query.resource;
    const action = query.action;

    // Extract song ID from request if available
    const songId = request.params?.id;

    console.log(`Song access check: User ${user?.id} requesting ${action} on ${resource}, songId: ${songId}`);

    switch (user?.roles?.[0]?.name) {
      case 'Admin':
        return this.checkAdminAccess(resource, action, user, songId);
      
      case 'ImprintArtist':
        return this.checkImprintArtistAccess(resource, action, user, songId);
      
      case 'Clerical':
        return this.checkClericalAccess(resource, action, user, songId);
      
      default:
        return false;
    }
  }

  private async checkAdminAccess(
    resource: string, 
    action: string, 
    user: any, 
    songId?: string
  ): Promise<boolean> {
    // Admins have full access
    return true;
  }

  private async checkImprintArtistAccess(
    resource: string, 
    action: string, 
    user: any, 
    songId?: string
  ): Promise<boolean> {
    // ImprintArtists can only access their assigned songs
    if (resource === 'song-one' && songId) {
      const song = await this.songModelService.getSongById(songId);
      
      if (!song) {
        console.log(`Song ${songId} not found`);
        return false;
      }

      // Check if user is assigned to this song (business logic)
      const isAssigned = await this.songModelService.isUserAssignedToSong(user.id, songId);
      
      if (!isAssigned) {
        console.log(`ImprintArtist ${user.id} not assigned to song ${songId}`);
        return false;
      }

      // Allow read and update for assigned songs
      if (['read', 'update'].includes(action)) {
        console.log(`ImprintArtist access granted for assigned song ${songId}`);
        return true;
      }
    }

    // Allow reading song lists (they'll be filtered by business logic)
    if (resource === 'song-many' && action === 'read') {
      return true;
    }

    return false;
  }

  private async checkClericalAccess(
    resource: string, 
    action: string, 
    user: any, 
    songId?: string
  ): Promise<boolean> {
    // Clerical can create and edit songs they created
    if (resource === 'song-one' && songId) {
      const song = await this.songModelService.getSongById(songId);
      
      if (song && song.createdById === user.id) {
        // Can read/update songs they created
        if (['read', 'update'].includes(action)) {
          console.log(`Clerical access granted for own song ${songId}`);
          return true;
        }
      }
    }

    // Can create new songs
    if (resource === 'song-one' && action === 'create') {
      return true;
    }

    // Can read song lists (they'll be filtered)
    if (resource === 'song-many' && action === 'read') {
      return true;
    }

    return false;
  }
}
```

---

## Controller Access Control

### Basic Controller Pattern

```typescript
// artist.crud.controller.ts
import { ApiTags } from '@nestjs/swagger';
import {
  AccessControlCreateMany,
  AccessControlCreateOne,
  AccessControlDeleteOne,
  AccessControlQuery,
  AccessControlReadMany,
  AccessControlReadOne,
  AccessControlRecoverOne,
  AccessControlUpdateOne,
} from '@concepta/nestjs-access-control';
import {
  CrudBody,
  CrudCreateOne,
  CrudDeleteOne,
  CrudReadOne,
  CrudRequest,
  CrudRequestInterface,
  CrudUpdateOne,
  CrudControllerInterface,
  CrudController,
  CrudCreateMany,
  CrudReadMany,
  CrudRecoverOne,
} from '@concepta/nestjs-crud';
import { ArtistDto, ArtistCreateDto, ArtistUpdateDto, ArtistPaginatedDto, ArtistCreateManyDto } from './artist.dto';
import { ArtistAccessQueryService } from './artist-access-query.service';
import { ArtistResource } from './artist.types';
import { ArtistCrudService } from './artist.crud.service';
import { ArtistEntityInterface, ArtistCreatableInterface, ArtistUpdatableInterface } from './artist.interface';

@CrudController({
  path: 'artists',
  model: {
    type: ArtistDto,
    paginatedType: ArtistPaginatedDto,
  },
})
@AccessControlQuery({
  service: ArtistAccessQueryService, // Link to access control service
})
@ApiTags('artists')
export class ArtistCrudController implements CrudControllerInterface<
  ArtistEntityInterface,
  ArtistCreatableInterface,
  ArtistUpdatableInterface
> {
  constructor(private artistCrudService: ArtistCrudService) {}

  @CrudReadMany()
  @AccessControlReadMany(ArtistResource.Many) // Apply access control
  async getMany(@CrudRequest() crudRequest: CrudRequestInterface<ArtistEntityInterface>) {
    return this.artistCrudService.getMany(crudRequest);
  }

  @CrudReadOne()
  @AccessControlReadOne(ArtistResource.One)
  async getOne(@CrudRequest() crudRequest: CrudRequestInterface<ArtistEntityInterface>) {
    return this.artistCrudService.getOne(crudRequest);
  }

  @CrudCreateMany()
  @AccessControlCreateMany(ArtistResource.Many)
  async createMany(
    @CrudRequest() crudRequest: CrudRequestInterface<ArtistEntityInterface>,
    @CrudBody() artistCreateManyDto: ArtistCreateManyDto,
  ) {
    return this.artistCrudService.createMany(crudRequest, artistCreateManyDto);
  }

  @CrudCreateOne({
    dto: ArtistCreateDto
  })
  @AccessControlCreateOne(ArtistResource.One)
  async createOne(
    @CrudRequest() crudRequest: CrudRequestInterface<ArtistEntityInterface>,
    @CrudBody() artistCreateDto: ArtistCreateDto,
  ) {
    return this.artistCrudService.createOne(crudRequest, artistCreateDto);
  }

  @CrudUpdateOne({
    dto: ArtistUpdateDto
  })
  @AccessControlUpdateOne(ArtistResource.One)
  async updateOne(
    @CrudRequest() crudRequest: CrudRequestInterface<ArtistEntityInterface>,
    @CrudBody() artistUpdateDto: ArtistUpdateDto,
  ) {
    return this.artistCrudService.updateOne(crudRequest, artistUpdateDto);
  }

  @CrudDeleteOne()
  @AccessControlDeleteOne(ArtistResource.One)
  async deleteOne(@CrudRequest() crudRequest: CrudRequestInterface<ArtistEntityInterface>) {
    return this.artistCrudService.deleteOne(crudRequest);
  }

  @CrudRecoverOne()
  @AccessControlRecoverOne(ArtistResource.One)
  async recoverOne(@CrudRequest() crudRequest: CrudRequestInterface<ArtistEntityInterface>) {
    return this.artistCrudService.recoverOne(crudRequest);
  }
}
```

### Custom Endpoint Access Control

```typescript
// Custom endpoints with specific permissions
import { Get, Post, Param, Body, UseGuards } from '@nestjs/common';
import { AccessControlGrant } from '@concepta/nestjs-access-control';
import { AuthGuard } from '@nestjs/passport';

export class ArtistCrudController {
  // ... CRUD methods above

  @Get(':id/songs')
  @UseGuards(AuthGuard('jwt'))
  @AccessControlGrant({
    resource: 'artist-songs',
    action: 'read',
    queryService: ArtistAccessQueryService,
  })
  async getArtistSongs(@Param('id') artistId: string) {
    return this.artistCrudService.getSongsByArtist(artistId);
  }

  @Post(':id/assign-songs')
  @UseGuards(AuthGuard('jwt'))
  @AccessControlGrant({
    resource: 'artist-songs',
    action: 'create',
    queryService: ArtistAccessQueryService,
  })
  async assignSongsToArtist(
    @Param('id') artistId: string,
    @Body() songIds: string[]
  ) {
    return this.artistCrudService.assignSongs(artistId, songIds);
  }
}
```

---

## Role Permission Patterns

### Role Hierarchy

```typescript
// Define role permissions clearly
export const RolePermissions = {
  Admin: {
    artists: ['create', 'read', 'update', 'delete'],
    songs: ['create', 'read', 'update', 'delete', 'approve', 'publish'],
    users: ['create', 'read', 'update', 'delete'],
    reports: ['read', 'export'],
  },
  ImprintArtist: {
    artists: ['read'], // Can only view artists
    songs: ['read', 'update'], // Can only read and update assigned songs
    users: [], // No user management
    reports: ['read'], // Can view reports for their songs
  },
  Clerical: {
    artists: ['read'], // Can view artists
    songs: ['create', 'read', 'update'], // Can manage songs they created
    users: [], // No user management
    reports: ['read'], // Can view reports for their songs
  },
} as const;

// Usage in access query service
private hasPermission(userRole: string, resource: string, action: string): boolean {
  const permissions = RolePermissions[userRole as keyof typeof RolePermissions];
  if (!permissions) return false;

  const resourcePermissions = permissions[resource as keyof typeof permissions];
  return resourcePermissions?.includes(action) ?? false;
}
```

### Dynamic Role Checking

```typescript
// artist-access-query.service.ts (enhanced)
export class ArtistAccessQueryService implements CanAccess {

  async canAccess(context: AccessControlContextInterface): Promise<boolean> {
    const user = context.getUser() as any;
    const query = context.getQuery();
    
    // Check if user is authenticated
    if (!user || !user.id) {
      console.log('Access denied: User not authenticated');
      return false;
    }

    // Check if user is active
    if (user.status !== 'ACTIVE') {
      console.log(`Access denied: User ${user.id} status is ${user.status}`);
      return false;
    }

    // Get user roles
    const userRoles = user.roles || [];
    if (userRoles.length === 0) {
      console.log(`Access denied: User ${user.id} has no roles`);
      return false;
    }

    // Check permissions for each role
    for (const role of userRoles) {
      if (this.checkRolePermissions(role.name, query.resource, query.action)) {
        console.log(`Access granted: User ${user.id} role ${role.name} has permission`);
        return true;
      }
    }

    console.log(`Access denied: No role has permission for ${query.resource}:${query.action}`);
    return false;
  }

  private checkRolePermissions(roleName: string, resource: string, action: string): boolean {
    // Map resources to permission categories
    const resourceMap: Record<string, string> = {
      'artist-one': 'artists',
      'artist-many': 'artists',
      'song-one': 'songs',
      'song-many': 'songs',
    };

    const permissionResource = resourceMap[resource];
    if (!permissionResource) {
      console.log(`Unknown resource: ${resource}`);
      return false;
    }

    return this.hasPermission(roleName, permissionResource, action);
  }

  private hasPermission(userRole: string, resource: string, action: string): boolean {
    const permissions = RolePermissions[userRole as keyof typeof RolePermissions];
    if (!permissions) {
      console.log(`Unknown role: ${userRole}`);
      return false;
    }

    const resourcePermissions = permissions[resource as keyof typeof permissions];
    const hasAccess = resourcePermissions?.includes(action) ?? false;
    
    console.log(`Permission check: ${userRole} -> ${resource}:${action} = ${hasAccess}`);
    return hasAccess;
  }
}
```

---

## Business Logic Access Control

### Entity-Level Access Control

```typescript
// song-access-query.service.ts with ownership checks
export class SongAccessQueryService implements CanAccess {
  constructor(
    private readonly songModelService: SongModelService,
  ) {}

  async canAccess(context: AccessControlContextInterface): Promise<boolean> {
    const user = context.getUser() as any;
    const request = context.getRequest() as any;
    const query = context.getQuery();
    
    const songId = request.params?.id;
    const resource = query.resource;
    const action = query.action;

    // For song-specific operations, check ownership/assignment
    if (resource === 'song-one' && songId) {
      return this.checkSongAccess(user, songId, action);
    }

    // For list operations, allow but filter results in service
    if (resource === 'song-many') {
      return this.checkSongListAccess(user, action);
    }

    return false;
  }

  private async checkSongAccess(user: any, songId: string, action: string): Promise<boolean> {
    const song = await this.songModelService.getSongById(songId);
    
    if (!song) {
      console.log(`Song ${songId} not found`);
      return false;
    }

    switch (user.roles[0]?.name) {
      case 'Admin':
        return true; // Admin can access any song

      case 'ImprintArtist':
        // Can only access assigned songs
        const isAssigned = await this.songModelService.isUserAssignedToSong(user.id, songId);
        if (!isAssigned) {
          console.log(`ImprintArtist ${user.id} not assigned to song ${songId}`);
          return false;
        }
        // Can read and update assigned songs
        return ['read', 'update'].includes(action);

      case 'Clerical':
        // Can only access songs they created
        if (song.createdById !== user.id) {
          console.log(`Clerical ${user.id} did not create song ${songId}`);
          return false;
        }
        // Can read and update own songs, but not delete
        return ['read', 'update'].includes(action);

      default:
        return false;
    }
  }

  private async checkSongListAccess(user: any, action: string): Promise<boolean> {
    // All authenticated users can read song lists
    // Business logic in service will filter based on permissions
    return action === 'read';
  }
}
```

### Service-Level Filtering

```typescript
// song.crud.service.ts with permission-based filtering
export class SongCrudService extends CrudService<SongEntityInterface> {
  
  async getMany(
    req: CrudRequestInterface<SongEntityInterface>,
    options?: Record<string, unknown>,
  ): Promise<SongEntityInterface[]> {
    try {
      // Apply permission-based filtering before executing query
      const filteredRequest = await this.applyPermissionFilters(req);
      
      const result = await super.getMany(filteredRequest, options);
      console.log(`Returned ${result.length} songs for user based on permissions`);
      return result;
    } catch (error) {
      if (error instanceof SongException) {
        throw error;
      }
      console.error('Unexpected error in song getMany:', error);
      throw new InternalServerErrorException('Failed to retrieve songs', { cause: error });
    }
  }

  private async applyPermissionFilters(
    req: CrudRequestInterface<SongEntityInterface>
  ): Promise<CrudRequestInterface<SongEntityInterface>> {
    // Get user from request context
    const user = (req as any).user; // Injected by auth guard
    
    if (!user) {
      throw new UnauthorizedException('User not found in request');
    }

    // Clone the request to avoid mutations
    const filteredRequest = { ...req };

    switch (user.roles[0]?.name) {
      case 'Admin':
        // No filtering needed - admin sees all
        break;

      case 'ImprintArtist':
        // Filter to only assigned songs
        const assignedSongIds = await this.songModelService.getAssignedSongIds(user.id);
        if (!filteredRequest.parsed.filter) {
          filteredRequest.parsed.filter = [];
        }
        filteredRequest.parsed.filter.push({
          field: 'id',
          operator: 'in',
          value: assignedSongIds,
        });
        break;

      case 'Clerical':
        // Filter to only songs they created
        if (!filteredRequest.parsed.filter) {
          filteredRequest.parsed.filter = [];
        }
        filteredRequest.parsed.filter.push({
          field: 'createdById',
          operator: 'eq',
          value: user.id,
        });
        break;

      default:
        // Unknown role - return empty results
        filteredRequest.parsed.filter = [{
          field: 'id',
          operator: 'eq',
          value: 'non-existent-id', // Force empty result
        }];
    }

    return filteredRequest;
  }
}
```

---

## Module Configuration

### Complete Module Setup

```typescript
// artist.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TypeOrmExtModule } from '@concepta/nestjs-typeorm-ext';
import { ArtistEntity } from './artist.entity';
import { ArtistCrudController } from './artist.crud.controller';
import { ArtistCrudService } from './artist.crud.service';
import { ArtistModelService } from './artist-model.service';
import { ArtistTypeOrmCrudAdapter } from './artist-typeorm-crud.adapter';
import { ArtistAccessQueryService } from './artist-access-query.service';

@Module({
  imports: [
    // Standard TypeORM for CRUD operations
    TypeOrmModule.forFeature([ArtistEntity]),
    // Extended TypeORM for ModelServices
    TypeOrmExtModule.forFeature({
      artist: { entity: ArtistEntity },
    }),
  ],
  controllers: [ArtistCrudController],
  providers: [
    ArtistTypeOrmCrudAdapter,
    ArtistModelService,
    ArtistCrudService,
    ArtistAccessQueryService, // Access control service
  ],
  exports: [
    ArtistModelService, 
    ArtistTypeOrmCrudAdapter,
    ArtistAccessQueryService, // Export for other modules to use
  ],
})
export class ArtistModule {}
```

---

## Testing Access Control

### Unit Testing Access Logic

```typescript
// artist-access-query.service.spec.ts
describe('ArtistAccessQueryService', () => {
  let service: ArtistAccessQueryService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ArtistAccessQueryService],
    }).compile();

    service = module.get<ArtistAccessQueryService>(ArtistAccessQueryService);
  });

  describe('canAccess', () => {
    it('should allow admin full access', async () => {
      const context = createMockContext({
        user: { id: 'admin1', roles: [{ name: 'Admin' }] },
        resource: 'artist-one',
        action: 'create',
      });

      const result = await service.canAccess(context);
      expect(result).toBe(true);
    });

    it('should deny ImprintArtist create access', async () => {
      const context = createMockContext({
        user: { id: 'imprint1', roles: [{ name: 'ImprintArtist' }] },
        resource: 'artist-one',
        action: 'create',
      });

      const result = await service.canAccess(context);
      expect(result).toBe(false);
    });

    it('should allow ImprintArtist read access', async () => {
      const context = createMockContext({
        user: { id: 'imprint1', roles: [{ name: 'ImprintArtist' }] },
        resource: 'artist-many',
        action: 'read',
      });

      const result = await service.canAccess(context);
      expect(result).toBe(true);
    });

    it('should deny access for unauthenticated user', async () => {
      const context = createMockContext({
        user: null,
        resource: 'artist-one',
        action: 'read',
      });

      const result = await service.canAccess(context);
      expect(result).toBe(false);
    });
  });

  function createMockContext(config: {
    user: any;
    resource: string;
    action: string;
  }): AccessControlContextInterface {
    return {
      getUser: () => config.user,
      getQuery: () => ({ resource: config.resource, action: config.action }),
      getRequest: () => ({}),
      getAccessControl: () => ({} as any),
      getExecutionContext: () => ({} as any),
    };
  }
});
```

### Integration Testing

```typescript
// artist.controller.integration.spec.ts
describe('Artist Controller Access Control', () => {
  let app: INestApplication;
  let adminToken: string;
  let imprintToken: string;
  let clericalToken: string;

  beforeAll(async () => {
    // Setup test app and get auth tokens
    adminToken = await getAuthToken('admin@test.com');
    imprintToken = await getAuthToken('imprint@test.com'); 
    clericalToken = await getAuthToken('clerical@test.com');
  });

  describe('GET /artists', () => {
    it('should allow admin to read all artists', async () => {
      const response = await request(app.getHttpServer())
        .get('/artists')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      
      expect(response.body.data).toBeDefined();
    });

    it('should allow ImprintArtist to read artists', async () => {
      const response = await request(app.getHttpServer())
        .get('/artists')
        .set('Authorization', `Bearer ${imprintToken}`)
        .expect(200);
      
      expect(response.body.data).toBeDefined();
    });
  });

  describe('POST /artists', () => {
    it('should allow admin to create artists', async () => {
      await request(app.getHttpServer())
        .post('/artists')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'New Artist', status: 'ACTIVE' })
        .expect(201);
    });

    it('should deny ImprintArtist create access', async () => {
      await request(app.getHttpServer())
        .post('/artists')
        .set('Authorization', `Bearer ${imprintToken}`)
        .send({ name: 'New Artist', status: 'ACTIVE' })
        .expect(403);
    });
  });
});
```

---

## Template for New Access Control

```typescript
// {entity}-access-query.service.ts
import { Injectable } from '@nestjs/common';
import { AccessControlContextInterface, CanAccess } from '@concepta/nestjs-access-control';

@Injectable()
export class {Entity}AccessQueryService implements CanAccess {
  
  async canAccess(context: AccessControlContextInterface): Promise<boolean> {
    const user = context.getUser() as any;
    const query = context.getQuery();
    const request = context.getRequest() as any;
    
    // Check authentication
    if (!user || !user.id) {
      return false;
    }

    // Check user status
    if (user.status !== 'ACTIVE') {
      return false;
    }

    const userRole = user.roles?.[0]?.name;
    const resource = query.resource;
    const action = query.action;
    const entityId = request.params?.id;

    console.log(`{Entity} access: ${userRole} requesting ${action} on ${resource}`);

    switch (userRole) {
      case 'Admin':
        return this.checkAdminAccess(resource, action, entityId);
      
      case 'ImprintArtist':
        return this.checkImprintArtistAccess(resource, action, entityId);
      
      case 'Clerical':
        return this.checkClericalAccess(resource, action, entityId);
      
      default:
        return false;
    }
  }

  private checkAdminAccess(resource: string, action: string, entityId?: string): boolean {
    // Admin has full access
    return true;
  }

  private checkImprintArtistAccess(resource: string, action: string, entityId?: string): boolean {
    // Define ImprintArtist permissions for this entity
    // Example: read-only access
    return action === 'read';
  }

  private checkClericalAccess(resource: string, action: string, entityId?: string): boolean {
    // Define Clerical permissions for this entity
    // Example: read-only access
    return action === 'read';
  }
}
```

---

## Best Practices

### ✅ Do:

- **Implement CanAccess Interface**: Every access query service must implement this
- **Check Authentication**: Always verify user is authenticated and active
- **Role-Based Logic**: Use clear switch statements for different roles
- **Log Access Attempts**: Log both granted and denied access for security
- **Resource-Action Pattern**: Use consistent resource and action naming
- **Business Logic Integration**: Check entity ownership when needed
- **Filter Service Results**: Apply permission filters in service layer

### Best Practices:

- **Always authenticate**: Verify user authentication and active status in every access service
- **Use dynamic permissions**: Get user roles and permissions from the context, never hardcode values
- **Secure logging**: Log access attempts without exposing sensitive user information
- **Register services**: Ensure all access services are properly registered in their respective modules
- **Use decorators consistently**: Apply @AccessControl decorators to all endpoints that need protection
- **Server-side validation**: Always implement server-side permission checks, never rely solely on client validation
- **Test thoroughly**: Create comprehensive tests for all access control scenarios and edge cases

This pattern ensures secure, role-based access control throughout your application with clear separation of concerns and testable logic.