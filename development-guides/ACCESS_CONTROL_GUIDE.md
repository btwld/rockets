# 🛡️ ACCESS CONTROL GUIDE

> **For AI Tools**: This guide contains role-based access control patterns and permission management for Rockets SDK. Use this when implementing security and authorization in your modules.

## 📋 **Quick Reference**

| Task | Section | Time |
|------|---------|------|
| Create access query service | [Access Query Service Pattern](#access-query-service-pattern) | 10 min |
| Add controller decorators | [Controller Access Control](#controller-access-control) | 5 min |
| Define resource types | [Resource Type Definitions](#resource-type-definitions) | 5 min |
| Role-based permissions | [Role Permission Patterns](#role-permission-patterns) | 15 min |
| Custom access logic | [Business Logic Access Control](#business-logic-access-control) | 20 min |

---

## 🔐 **Core Concepts**

### **Access Control Flow**

```
Request → Authentication → Access Guard → Access Query Service → Permission Check → Allow/Deny
```

### **Key Components**

1. **Resource Types**: Define what can be accessed (`artist-one`, `artist-many`)
2. **Access Query Service**: Implements permission logic (`CanAccess` interface)  
3. **Decorators**: Apply access control to controller endpoints
4. **Context**: Provides request, user, and query information
5. **Role System**: Hierarchical user roles and permissions

---

## 📋 **Resource Type Definitions**

### **Basic Resource Types (Constants Pattern)**

```typescript
// artist.constants.ts
/**
 * Artist Resource Definitions
 * Used for access control and API resource identification
 */
export const ArtistResource = {
  One: 'artist-one',
  Many: 'artist-many',
} as const;

export type ArtistResourceType = typeof ArtistResource[keyof typeof ArtistResource];
```

### **Advanced Resource Types with Actions**

```typescript
// song.constants.ts
export const SongResource = {
  One: 'song-one',
  Many: 'song-many',
  Upload: 'song-upload',
  Download: 'song-download',
  Approve: 'song-approve',
  Publish: 'song-publish',
} as const;

export type SongResourceType = typeof SongResource[keyof typeof SongResource];

/**
 * Action to Resource Mapping
 * Defines which resources are needed for specific actions
 */
export const SongActions = {
  Create: [SongResource.One, SongResource.Upload],
  Read: [SongResource.One, SongResource.Many, SongResource.Download],
  Update: [SongResource.One],
  Delete: [SongResource.One],
  Approve: [SongResource.Approve],
  Publish: [SongResource.Publish],
} as const;
```

### **Multi-Entity Resource Types**

```typescript
// album.constants.ts
export const AlbumResource = {
  One: 'album-one',
  Many: 'album-many',
  Songs: 'album-songs',
  Artists: 'album-artists',
  Cover: 'album-cover',
} as const;

// Cross-entity access patterns
export const AlbumCrossEntityAccess = {
  // User can access album if they own any song in it
  SongOwnership: 'album-song-ownership',
  // User can access album if they are the artist
  ArtistOwnership: 'album-artist-ownership',
} as const;
```

---

## 🛡️ **Access Query Service Pattern**

### **Basic Implementation**

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
    const user = context.getUser() as any; // Cast to your user interface
    const request = context.getRequest() as any;
    const query = context.getQuery();
    
    // Extract access control information
    const resource = query.resource;
    const action = query.action;
    const entityId = request.params?.id;
    
    console.log(`Access check: User ${user?.id} requesting ${action} on ${resource}`);

    // Handle unauthenticated users
    if (!user) {
      console.log('Access denied: No authenticated user');
      return false;
    }

    // Role-based access control
    return this.checkRoleBasedAccess(user, resource, action, entityId, request);
  }

  /**
   * Role-based access control logic
   */
  private async checkRoleBasedAccess(
    user: any,
    resource: string,
    action: string,
    entityId?: string,
    request?: any
  ): Promise<boolean> {
    const userRole = user?.roles?.[0]?.name || 'User';

    switch (userRole) {
      case 'Admin':
        return this.checkAdminAccess(resource, action, user, entityId);
      
      case 'ImprintArtist':
        return this.checkImprintArtistAccess(resource, action, user, entityId);
      
      case 'Clerical':
        return this.checkClericalAccess(resource, action, user, entityId);
      
      case 'User':
        return this.checkUserAccess(resource, action, user, entityId);
      
      default:
        console.log(`Access denied: Unknown role '${userRole}' for user ${user?.id}`);
        return false;
    }
  }

  /**
   * Admin access logic - full access to everything
   */
  private async checkAdminAccess(
    resource: string,
    action: string,
    user: any,
    entityId?: string
  ): Promise<boolean> {
    console.log(`Admin access granted for ${resource}:${action}`);
    return true;
  }

  /**
   * ImprintArtist access logic - read-only access
   */
  private async checkImprintArtistAccess(
    resource: string,
    action: string,
    user: any,
    entityId?: string
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
   * Clerical access logic - limited write access
   */
  private async checkClericalAccess(
    resource: string,
    action: string,
    user: any,
    entityId?: string
  ): Promise<boolean> {
    // Clerical can read and create artists, but not update/delete
    if (resource === 'artist-one' || resource === 'artist-many') {
      if (action === 'read' || action === 'create') {
        console.log(`Clerical access granted for ${resource}:${action}`);
        return true;
      }
    }

    console.log(`Clerical access denied for ${resource}:${action}`);
    return false;
  }

  /**
   * User access logic - very limited access
   */
  private async checkUserAccess(
    resource: string,
    action: string,
    user: any,
    entityId?: string
  ): Promise<boolean> {
    // Regular users can only read public artists
    if ((resource === 'artist-one' || resource === 'artist-many') && action === 'read') {
      console.log(`User read access granted for ${resource}`);
      return true;
    }

    console.log(`User access denied for ${resource}:${action}`);
    return false;
  }
}
```

### **Advanced Access Query with Business Logic**

```typescript
// song-access-query.service.ts
import { Injectable } from '@nestjs/common';
import { AccessControlContextInterface, CanAccess } from '@concepta/nestjs-access-control';
import { SongModelService } from './song-model.service';

@Injectable()
export class SongAccessQueryService implements CanAccess {
  constructor(private songModelService: SongModelService) {}

  async canAccess(context: AccessControlContextInterface): Promise<boolean> {
    const user = context.getUser() as any;
    const request = context.getRequest() as any;
    const query = context.getQuery();
    
    const resource = query.resource;
    const action = query.action;
    const songId = request.params?.id;
    
    if (!user) return false;

    // Role-based access + ownership checks
    return this.checkAccess(user, resource, action, songId);
  }

  private async checkAccess(
    user: any,
    resource: string,
    action: string,
    songId?: string
  ): Promise<boolean> {
    const userRole = user?.roles?.[0]?.name || 'User';

    // Admin always has access
    if (userRole === 'Admin') {
      return true;
    }

    // Check ownership for specific song operations
    if (songId && (resource === 'song-one')) {
      const isOwner = await this.checkSongOwnership(user.id, songId);
      
      // Owner can read, update their own songs
      if (isOwner && (action === 'read' || action === 'update')) {
        console.log(`Owner access granted for song ${songId}`);
        return true;
      }

      // Only admins can delete songs
      if (action === 'delete') {
        return userRole === 'Admin';
      }
    }

    // General role-based access for creating songs
    if (resource === 'song-many' && action === 'create') {
      // ImprintArtists and Clericals can create songs
      return ['ImprintArtist', 'Clerical'].includes(userRole);
    }

    // Read access for songs
    if ((resource === 'song-one' || resource === 'song-many') && action === 'read') {
      // All authenticated users can read published songs
      return true;
    }

    console.log(`Access denied for ${resource}:${action} by role ${userRole}`);
    return false;
  }

  /**
   * Check if user owns the song
   */
  private async checkSongOwnership(userId: string, songId: string): Promise<boolean> {
    try {
      const song = await this.songModelService.byId(songId);
      return song?.createdBy === userId || song?.artist?.userId === userId;
    } catch (error) {
      console.error('Error checking song ownership:', error);
      return false;
    }
  }
}
```

---

## 🎯 **Controller Access Control**

### **Standard CRUD Controller with Access Control**

```typescript
// artist.crud.controller.ts
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
import { ArtistResource } from './artist.constants';
import { ArtistAccessQueryService } from './artist-access-query.service';

@CrudController({
  path: 'artists',
  model: {
    type: ArtistDto,
    paginatedType: ArtistPaginatedDto,
  },
})
@AccessControlQuery({
  service: ArtistAccessQueryService, // Apply access control to all endpoints
})
@ApiTags('artists')
export class ArtistCrudController {
  constructor(private artistCrudService: ArtistCrudService) {}

  @CrudReadMany()
  @AccessControlReadMany(ArtistResource.Many)
  async getMany(@CrudRequest() crudRequest: CrudRequestInterface<ArtistEntityInterface>) {
    return this.artistCrudService.getMany(crudRequest);
  }

  @CrudReadOne()
  @AccessControlReadOne(ArtistResource.One)
  async getOne(@CrudRequest() crudRequest: CrudRequestInterface<ArtistEntityInterface>) {
    return this.artistCrudService.getOne(crudRequest);
  }

  @CrudCreateOne({ dto: ArtistCreateDto })
  @AccessControlCreateOne(ArtistResource.One)
  async createOne(
    @CrudRequest() crudRequest: CrudRequestInterface<ArtistEntityInterface>,
    @CrudBody() artistCreateDto: ArtistCreateDto,
  ) {
    return this.artistCrudService.createOne(crudRequest, artistCreateDto);
  }

  @CrudUpdateOne({ dto: ArtistUpdateDto })
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
}
```

### **Custom Controller with Granular Access Control**

```typescript
// song.custom.controller.ts
import { Controller, Get, Post, Patch, Param, Body, UseGuards } from '@nestjs/common';
import { AccessControlGrant } from '@concepta/nestjs-access-control';
import { AuthGuard } from '@nestjs/passport';
import { SongResource } from './song.constants';

@Controller('songs')
@UseGuards(AuthGuard('jwt'))
@ApiTags('songs-custom')
export class SongCustomController {
  constructor(
    private songModelService: SongModelService,
    private songAccessQueryService: SongAccessQueryService
  ) {}

  @Get('my-songs')
  @AccessControlGrant({
    resource: SongResource.Many,
    action: 'read',
    service: SongAccessQueryService,
  })
  async getMySongs(@AuthUser() user: any): Promise<SongDto[]> {
    const songs = await this.songModelService.findByUserId(user.id);
    return songs.map(song => new SongDto(song));
  }

  @Post(':id/approve')
  @AccessControlGrant({
    resource: SongResource.Approve,
    action: 'update',
    service: SongAccessQueryService,
  })
  async approveSong(
    @Param('id') id: string,
    @AuthUser() user: any
  ): Promise<SongDto> {
    const song = await this.songModelService.approveSong(id, user.id);
    return new SongDto(song);
  }

  @Post(':id/publish')
  @AccessControlGrant({
    resource: SongResource.Publish,
    action: 'update',
    service: SongAccessQueryService,
  })
  async publishSong(
    @Param('id') id: string,
    @AuthUser() user: any
  ): Promise<SongDto> {
    const song = await this.songModelService.publishSong(id, user.id);
    return new SongDto(song);
  }
}
```

---

## 👥 **Role Permission Patterns**

### **Role Hierarchy Definition**

```typescript
// config/roles.config.ts
export enum UserRole {
  ADMIN = 'Admin',
  IMPRINT_ARTIST = 'ImprintArtist',
  CLERICAL = 'Clerical',
  USER = 'User',
}

export const RoleHierarchy = {
  [UserRole.ADMIN]: 100,        // Full access
  [UserRole.IMPRINT_ARTIST]: 75, // High access
  [UserRole.CLERICAL]: 50,       // Medium access
  [UserRole.USER]: 25,           // Basic access
} as const;

export const RolePermissions = {
  [UserRole.ADMIN]: {
    artists: ['create', 'read', 'update', 'delete'],
    songs: ['create', 'read', 'update', 'delete', 'approve', 'publish'],
    users: ['create', 'read', 'update', 'delete'],
  },
  [UserRole.IMPRINT_ARTIST]: {
    artists: ['read'],
    songs: ['create', 'read', 'update'], // Own songs only
    users: [],
  },
  [UserRole.CLERICAL]: {
    artists: ['create', 'read'],
    songs: ['create', 'read'],
    users: [],
  },
  [UserRole.USER]: {
    artists: ['read'],
    songs: ['read'], // Public songs only
    users: [],
  },
} as const;
```

### **Permission Checking Utilities**

```typescript
// utils/permission.utils.ts
export class PermissionUtils {
  /**
   * Check if user has required permission for resource
   */
  static hasPermission(
    userRole: UserRole,
    resource: string,
    action: string
  ): boolean {
    const permissions = RolePermissions[userRole];
    if (!permissions) return false;

    const resourcePermissions = permissions[resource as keyof typeof permissions] || [];
    return resourcePermissions.includes(action);
  }

  /**
   * Check if user role is at least the required level
   */
  static hasRoleLevel(userRole: UserRole, requiredRole: UserRole): boolean {
    const userLevel = RoleHierarchy[userRole] || 0;
    const requiredLevel = RoleHierarchy[requiredRole] || 0;
    return userLevel >= requiredLevel;
  }

  /**
   * Get highest role from user roles array
   */
  static getHighestRole(roles: any[]): UserRole {
    if (!roles || roles.length === 0) return UserRole.USER;

    const userRoles = roles.map(role => role.name as UserRole);
    const sortedRoles = userRoles.sort((a, b) => 
      (RoleHierarchy[b] || 0) - (RoleHierarchy[a] || 0)
    );

    return sortedRoles[0] || UserRole.USER;
  }
}
```

### **Enhanced Access Query with Permission Utils**

```typescript
// enhanced-access-query.service.ts
import { Injectable } from '@nestjs/common';
import { PermissionUtils, UserRole } from '../utils/permission.utils';

@Injectable()
export class EnhancedAccessQueryService implements CanAccess {
  
  async canAccess(context: AccessControlContextInterface): Promise<boolean> {
    const user = context.getUser() as any;
    const query = context.getQuery();
    
    if (!user) return false;

    const userRole = PermissionUtils.getHighestRole(user.roles);
    const resource = this.extractResourceType(query.resource);
    const action = query.action;

    // Check basic permission
    if (!PermissionUtils.hasPermission(userRole, resource, action)) {
      console.log(`Permission denied: ${userRole} cannot ${action} ${resource}`);
      return false;
    }

    // Additional business logic checks
    return this.checkBusinessLogic(user, query, context);
  }

  private extractResourceType(resource: string): string {
    // Convert 'artist-one' to 'artists', 'song-many' to 'songs'
    return resource.replace(/-one|-many|-upload|-download|-approve|-publish/, 's');
  }

  private async checkBusinessLogic(
    user: any,
    query: any,
    context: AccessControlContextInterface
  ): Promise<boolean> {
    // Implement specific business rules here
    // e.g., ownership checks, time-based restrictions, etc.
    return true;
  }
}
```

---

## 🔧 **Business Logic Access Control**

### **Ownership-Based Access Control**

```typescript
// ownership-access-query.service.ts
@Injectable()
export class OwnershipAccessQueryService implements CanAccess {
  constructor(
    private songModelService: SongModelService,
    private artistModelService: ArtistModelService,
  ) {}

  async canAccess(context: AccessControlContextInterface): Promise<boolean> {
    const user = context.getUser() as any;
    const request = context.getRequest() as any;
    const query = context.getQuery();
    
    if (!user) return false;

    const userRole = PermissionUtils.getHighestRole(user.roles);
    const resource = query.resource;
    const action = query.action;
    const entityId = request.params?.id;

    // Admin bypasses all checks
    if (userRole === UserRole.ADMIN) {
      return true;
    }

    // Check ownership for specific resources
    if (entityId) {
      return this.checkOwnership(user, resource, action, entityId);
    }

    // Default permission check for non-specific resources
    return PermissionUtils.hasPermission(userRole, resource, action);
  }

  private async checkOwnership(
    user: any,
    resource: string,
    action: string,
    entityId: string
  ): Promise<boolean> {
    try {
      switch (resource) {
        case 'song-one':
          return this.checkSongOwnership(user, action, entityId);
        
        case 'artist-one':
          return this.checkArtistOwnership(user, action, entityId);
        
        default:
          return false;
      }
    } catch (error) {
      console.error('Error checking ownership:', error);
      return false;
    }
  }

  private async checkSongOwnership(
    user: any,
    action: string,
    songId: string
  ): Promise<boolean> {
    const song = await this.songModelService.byId(songId);
    if (!song) return false;

    const isOwner = song.createdBy === user.id || song.artist?.userId === user.id;
    
    // Owners can read and update their songs
    if (isOwner && ['read', 'update'].includes(action)) {
      return true;
    }

    // Only admins can delete songs
    if (action === 'delete') {
      return user.roles?.some(role => role.name === UserRole.ADMIN);
    }

    return false;
  }

  private async checkArtistOwnership(
    user: any,
    action: string,
    artistId: string
  ): Promise<boolean> {
    const artist = await this.artistModelService.byId(artistId);
    if (!artist) return false;

    const isOwner = artist.userId === user.id;
    
    // Owners can read and update their artist profile
    if (isOwner && ['read', 'update'].includes(action)) {
      return true;
    }

    return false;
  }
}
```

### **Time-Based Access Control**

```typescript
// time-based-access-query.service.ts
@Injectable()
export class TimeBasedAccessQueryService implements CanAccess {
  
  async canAccess(context: AccessControlContextInterface): Promise<boolean> {
    const user = context.getUser() as any;
    const query = context.getQuery();
    
    if (!user) return false;

    // Check basic permissions first
    const basicAccess = await this.checkBasicAccess(user, query);
    if (!basicAccess) return false;

    // Apply time-based restrictions
    return this.checkTimeRestrictions(user, query);
  }

  private checkTimeRestrictions(user: any, query: any): boolean {
    const now = new Date();
    const hour = now.getHours();
    const day = now.getDay(); // 0 = Sunday, 6 = Saturday

    // Business hours restriction for certain roles
    if (user.roles?.some(role => role.name === 'Clerical')) {
      // Clerical users can only access during business hours (9 AM - 6 PM, Monday-Friday)
      if (day === 0 || day === 6 || hour < 9 || hour >= 18) {
        console.log('Access denied: Outside business hours for Clerical role');
        return false;
      }
    }

    // Maintenance window restriction
    if (this.isMaintenanceWindow(now)) {
      // Only admins can access during maintenance
      if (!user.roles?.some(role => role.name === UserRole.ADMIN)) {
        console.log('Access denied: Maintenance window active');
        return false;
      }
    }

    return true;
  }

  private isMaintenanceWindow(now: Date): boolean {
    // Maintenance every Sunday 2-4 AM
    const day = now.getDay();
    const hour = now.getHours();
    return day === 0 && hour >= 2 && hour < 4;
  }
}
```

---

## ✅ **Best Practices**

### **1. Use Constants for Resources**
```typescript
// ✅ Good - Use constants
import { ArtistResource } from './artist.constants';
@AccessControlReadMany(ArtistResource.Many)

// ❌ Avoid - Hard-coded strings
@AccessControlReadMany('artist-many')
```

### **2. Implement Hierarchical Role Checking**
```typescript
// ✅ Good - Role hierarchy
private hasMinimumRole(userRole: UserRole, requiredRole: UserRole): boolean {
  return RoleHierarchy[userRole] >= RoleHierarchy[requiredRole];
}

// ❌ Avoid - Hard-coded role checks
if (userRole === 'Admin' || userRole === 'Manager') {}
```

### **3. Log Access Decisions**
```typescript
// ✅ Good - Comprehensive logging
console.log(`Access ${allowed ? 'granted' : 'denied'}: User ${user.id} (${userRole}) ` +
           `requesting ${action} on ${resource} (Entity: ${entityId})`);

// ❌ Avoid - No logging
return allowed;
```

### **4. Handle Errors Gracefully**
```typescript
// ✅ Good - Error handling
try {
  const isOwner = await this.checkOwnership(user.id, entityId);
  return isOwner;
} catch (error) {
  console.error('Ownership check failed:', error);
  return false; // Fail secure
}
```

### **5. Use Business Logic in Access Control**
```typescript
// ✅ Good - Business logic integration
async canAccess(context: AccessControlContextInterface): Promise<boolean> {
  // 1. Check authentication
  if (!user) return false;
  
  // 2. Check basic permissions
  if (!this.hasBasicPermission()) return false;
  
  // 3. Check business rules
  return this.checkBusinessRules();
}
```

---

## 🎯 **Testing Access Control**

### **Unit Tests for Access Query Service**

```typescript
// artist-access-query.service.spec.ts
describe('ArtistAccessQueryService', () => {
  let service: ArtistAccessQueryService;
  let mockContext: AccessControlContextInterface;

  beforeEach(() => {
    // Setup test service and mocks
  });

  it('should allow admin full access', async () => {
    const mockUser = { id: '1', roles: [{ name: 'Admin' }] };
    mockContext.getUser.mockReturnValue(mockUser);
    mockContext.getQuery.mockReturnValue({ resource: 'artist-one', action: 'delete' });

    const result = await service.canAccess(mockContext);
    expect(result).toBe(true);
  });

  it('should deny user delete access', async () => {
    const mockUser = { id: '1', roles: [{ name: 'User' }] };
    mockContext.getUser.mockReturnValue(mockUser);
    mockContext.getQuery.mockReturnValue({ resource: 'artist-one', action: 'delete' });

    const result = await service.canAccess(mockContext);
    expect(result).toBe(false);
  });

  it('should allow owner to update their content', async () => {
    const mockUser = { id: '1', roles: [{ name: 'ImprintArtist' }] };
    // Mock ownership check
    // Test ownership logic
  });
});
```

---

## 🚀 **Integration with Module System**

### **Module Configuration with Access Control**

```typescript
// artist.module.ts
@Module({
  imports: [
    TypeOrmModule.forFeature([ArtistEntity]),
    TypeOrmExtModule.forFeature({
      [ARTIST_MODULE_ARTIST_ENTITY_KEY]: { entity: ArtistEntity },
    }),
    // Import access control module if needed
    AccessControlModule,
  ],
  controllers: [ArtistCrudController],
  providers: [
    ArtistTypeOrmCrudAdapter,
    ArtistModelService,
    ArtistCrudService,
    ArtistAccessQueryService, // Register access control service
  ],
  exports: [
    ArtistModelService, 
    ArtistTypeOrmCrudAdapter,
    ArtistAccessQueryService, // Export for cross-module access
  ],
})
export class ArtistModule {}
```

---

## 🎯 **Success Metrics**

**Your access control implementation is secure when:**
- ✅ All endpoints have appropriate access decorators
- ✅ Role hierarchy is properly defined and enforced
- ✅ Ownership checks are implemented for user-specific resources
- ✅ Business logic restrictions are properly applied
- ✅ Access decisions are logged for auditing
- ✅ Error cases fail securely (deny by default)
- ✅ Time-based and context-based restrictions work correctly

**🔒 Build secure applications with proper access control!**