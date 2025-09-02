# CRUD Patterns Guide

> **For AI Tools**: This guide contains both CRUD implementation patterns. Use this when building entities that need CRUD operations.

## 📋 **Quick Reference**

| Pattern | When to Use | Complexity | Recommended |
|---------|-------------|------------|-------------|
| [Direct CRUD](#pattern-1-direct-crud) | Standard CRUD, fixed DTOs, explicit control | Low | ✅ **RECOMMENDED** |
| [ConfigurableCrudBuilder](#pattern-2-configurablecrudbuilder) | Dynamic/configurable CRUD, legacy approach | Medium | ⚠️ *Legacy* |

---

## Pattern Decision Tree

```
Need CRUD operations for your entity?
├── Yes → **RECOMMENDED: Use Direct CRUD Pattern**
│   ├── ✅ Explicit control over all endpoints
│   ├── ✅ Clear business logic placement
│   ├── ✅ Easy debugging and maintenance
│   └── ✅ Access control integration
└── No → Use custom controllers (not covered here)

Note: ConfigurableCrudBuilder is still available but is considered legacy.
Use Direct CRUD for all new implementations.
```

---

## Pattern 1: Direct CRUD ⭐ **RECOMMENDED**

### When to Use:
- ✅ **All new CRUD implementations** 
- ✅ Standard CRUD operations
- ✅ Fixed DTOs and adapters
- ✅ Explicit control over endpoints
- ✅ Want to see all endpoints clearly
- ✅ Easy debugging and tracing
- ✅ Access control integration

### Complete Implementation:

#### Controller:

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
import { 
  ArtistCreateManyDto, 
  ArtistCreateDto, 
  ArtistPaginatedDto, 
  ArtistUpdateDto, 
  ArtistDto 
} from './artist.dto';
import { ArtistAccessQueryService } from './artist-access-query.service';
import { ArtistResource } from './artist.types';
import { ArtistCrudService } from './artist.crud.service';
import { 
  ArtistEntityInterface, 
  ArtistCreatableInterface, 
  ArtistUpdatableInterface 
} from './artist.interface';

@CrudController({
  path: 'artists',
  model: {
    type: ArtistDto,
    paginatedType: ArtistPaginatedDto,
  },
})
@AccessControlQuery({
  service: ArtistAccessQueryService,
})
@ApiTags('artists')
export class ArtistCrudController implements CrudControllerInterface<
  ArtistEntityInterface,
  ArtistCreatableInterface,
  ArtistUpdatableInterface
> {
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

#### Service:

```typescript
// artist.crud.service.ts
import { Inject, Injectable } from '@nestjs/common';
import { CrudService } from '@concepta/nestjs-crud';
import { CrudRequestInterface } from '@concepta/nestjs-crud';
import { ArtistEntityInterface, ArtistStatus } from './artist.interface';
import { ArtistTypeOrmCrudAdapter } from './artist-typeorm-crud.adapter';
import { ArtistModelService } from './artist-model.service';
import { 
  ArtistCreateDto, 
  ArtistUpdateDto, 
  ArtistCreateManyDto 
} from './artist.dto';
import { 
  ArtistException, 
  ArtistNameAlreadyExistsException 
} from './artist.exception';

@Injectable()
export class ArtistCrudService extends CrudService<ArtistEntityInterface> {
  constructor(
    @Inject(ArtistTypeOrmCrudAdapter)
    protected readonly crudAdapter: ArtistTypeOrmCrudAdapter,
    private readonly artistModelService: ArtistModelService,
  ) {
    super(crudAdapter);
  }

  // Override createOne with business logic and proper error handling
  async createOne(
    req: CrudRequestInterface<ArtistEntityInterface>,
    dto: ArtistCreateDto,
    options?: Record<string, unknown>,
  ): Promise<ArtistEntityInterface> {
    try {
      const isUnique = await this.artistModelService.isNameUnique(dto.name);
      if (!isUnique) {
        throw new ArtistNameAlreadyExistsException({
          message: `Artist with name "${dto.name}" already exists`,
        });
      }

      const createData = { ...dto, status: dto.status || ArtistStatus.ACTIVE };
      const result = await super.createOne(req, createData, options);
      console.log(`Artist created: ${result.name}`);
      return result;
    } catch (error) {
      if (error instanceof ArtistException) {
        throw error; // Known business exceptions bubble up
      }
      console.error('Unexpected error in artist createOne:', error);
      throw new ArtistException({
        message: 'Failed to create artist',
        originalError: error
      });
    }
  }

  // Override createMany with business logic
  async createMany(
    req: CrudRequestInterface<ArtistEntityInterface>,
    dto: ArtistCreateManyDto,
    options?: Record<string, unknown>,
  ): Promise<ArtistEntityInterface[]> {
    try {
      const bulkData = dto.bulk;
      const processedBulkData = [];
      
      for (const artistData of bulkData) {
        const isUnique = await this.artistModelService.isNameUnique(artistData.name);
        if (!isUnique) {
          throw new ArtistNameAlreadyExistsException({
            message: `Artist with name "${artistData.name}" already exists`,
          });
        }
        
        processedBulkData.push({
          ...artistData,
          status: artistData.status || ArtistStatus.ACTIVE,
        });
      }
      
      const processedDto = { bulk: processedBulkData };
      const result = await super.createMany(req, processedDto as any, options);
      console.log(`${result.length} artists created in bulk operation`);
      return result;
    } catch (error) {
      if (error instanceof ArtistException) {
        throw error;
      }
      console.error('Unexpected error in artist createMany:', error);
      throw new ArtistException({
        message: 'Failed to create artists',
        originalError: error
      });
    }
  }

  // Override updateOne with business logic
  async updateOne(
    req: CrudRequestInterface<ArtistEntityInterface>,
    dto: ArtistUpdateDto,
    options?: Record<string, unknown>,
  ): Promise<ArtistEntityInterface> {
    try {
      const artistId = req.parsed.paramsFilter.find((p: any) => p.field === 'id')?.value as string;
      
      if (dto.name) {
        const existingArtist = await this.artistModelService.getArtistById(artistId);
        if (dto.name !== existingArtist.name) {
          const isUnique = await this.artistModelService.isNameUnique(dto.name, artistId);
          if (!isUnique) {
            throw new ArtistNameAlreadyExistsException({
              message: `Artist with name "${dto.name}" already exists`,
            });
          }
        }
      }

      const result = await super.updateOne(req, dto, options);
      console.log(`Artist updated: ${result.name}`);
      return result;
    } catch (error) {
      if (error instanceof ArtistException) {
        throw error;
      }
      console.error('Unexpected error in artist updateOne:', error);
      throw new ArtistException({
        message: 'Failed to update artist',
        originalError: error
      });
    }
  }

  // Override deleteOne with business logic
  async deleteOne(
    req: CrudRequestInterface<ArtistEntityInterface>,
    options?: Record<string, unknown>,
  ): Promise<void | ArtistEntityInterface> {
    try {
      const artistId = req.parsed.paramsFilter.find((p: any) => p.field === 'id')?.value as string;
      const artist = await this.artistModelService.getArtistById(artistId);
      
      const result = await super.deleteOne(req, options);
      console.log(`Artist deleted: ${artist.name}`);
      return result;
    } catch (error) {
      if (error instanceof ArtistException) {
        throw error;
      }
      console.error('Unexpected error in artist deleteOne:', error);
      throw new ArtistException({
        message: 'Failed to delete artist',
        originalError: error
      });
    }
  }

  // Override recoverOne for soft-deleted artists
  async recoverOne(
    req: CrudRequestInterface<ArtistEntityInterface>,
    options?: Record<string, unknown>,
  ): Promise<ArtistEntityInterface> {
    try {
      const artistId = req.parsed.paramsFilter.find((p: any) => p.field === 'id')?.value as string;
      const recoveredArtist = await this.artistModelService.activateArtist(artistId);
      console.log(`Artist recovered: ${recoveredArtist.name}`);
      return recoveredArtist;
    } catch (error) {
      if (error instanceof ArtistException) {
        throw error;
      }
      console.error('Unexpected error in artist recoverOne:', error);
      throw new ArtistException({
        message: 'Failed to recover artist',
        originalError: error
      });
    }
  }
}
```

#### Module Configuration:

```typescript
// artist.module.ts
@Module({
  imports: [
    TypeOrmModule.forFeature([ArtistEntity]),
    TypeOrmExtModule.forFeature({
      artist: { entity: ArtistEntity },
    }),
  ],
  controllers: [ArtistCrudController],
  providers: [
    ArtistTypeOrmCrudAdapter,
    ArtistModelService,
    ArtistCrudService,
    ArtistAccessQueryService,
  ],
  exports: [ArtistModelService, ArtistTypeOrmCrudAdapter],
})
export class ArtistModule {}
```

---

## Pattern 2: ConfigurableCrudBuilder ⚠️ **LEGACY**

### When to Use:
- ⚠️ **Legacy codebases only**
- ⚠️ Dynamic configuration of DTOs or adapters
- ⚠️ Configuration comes from external sources  
- ⚠️ Complex CRUD scenarios requiring flexibility

**⚠️ Note: This pattern is considered legacy. Use Direct CRUD for all new implementations.**

### Complete Implementation:

```typescript
// artist-crud.builder.ts
import { ConfigurableCrudBuilder } from '@concepta/nestjs-crud';
import { ApiTags } from '@nestjs/swagger';
import { Inject } from '@nestjs/common';
import { ArtistEntity } from './artist.entity';
import { ArtistDto, ArtistCreateDto, ArtistUpdateDto, ArtistPaginatedDto } from './artist.dto';
import { ArtistTypeOrmCrudAdapter } from './artist-typeorm-crud.adapter';
import { ArtistModelService } from './artist-model.service';
import { ArtistException, ArtistNameAlreadyExistsException } from './artist.exception';

export const ARTIST_CRUD_SERVICE_TOKEN = Symbol('__ARTIST_CRUD_SERVICE_TOKEN__');

// Configure the CRUD builder
const crudBuilder = new ConfigurableCrudBuilder<
  ArtistEntity,
  ArtistCreateDto,
  ArtistUpdateDto
>({
  service: {
    adapter: ArtistTypeOrmCrudAdapter,
    injectionToken: ARTIST_CRUD_SERVICE_TOKEN,
  },
  controller: {
    path: 'artists',
    model: {
      type: ArtistDto,
      paginatedType: ArtistPaginatedDto,
    },
    extraDecorators: [ApiTags('artists')],
  },
  getMany: {},
  getOne: {},
  createOne: { dto: ArtistCreateDto },
  updateOne: { dto: ArtistUpdateDto },
  deleteOne: {},
});

const { ConfigurableServiceClass, ConfigurableControllerClass } = crudBuilder.build();

// Service with custom business logic
export class ArtistCrudService extends ConfigurableServiceClass {
  constructor(
    @Inject(ArtistTypeOrmCrudAdapter)
    protected readonly crudAdapter: ArtistTypeOrmCrudAdapter,
    private readonly artistModelService: ArtistModelService,
  ) {
    super(crudAdapter);
  }

  // Override createOne with business logic
  async createOne(req, dto: ArtistCreateDto, options) {
    try {
      // Business validation
      const isUnique = await this.artistModelService.isNameUnique(dto.name);
      if (!isUnique) {
        throw new ArtistNameAlreadyExistsException({
          message: `Artist with name "${dto.name}" already exists`,
        });
      }

      const createData = { ...dto, status: dto.status || ArtistStatus.ACTIVE };
      const result = await super.createOne(req, createData, options);
      console.log(`Artist created: ${result.name}`);
      return result;
    } catch (error) {
      // Proper error handling pattern
      if (error instanceof ArtistException) {
        throw error; // Known business exceptions
      }
      console.error('Unexpected error in artist createOne:', error);
      throw new ArtistException({
        message: 'Failed to create artist',
        originalError: error
      });
    }
  }

  // Additional overrides...
}

// Controller (minimal - business logic is in service)
export class ArtistController extends ConfigurableControllerClass {}
```

---

## Shared Components

Both patterns use these same supporting files:

### TypeORM CRUD Adapter:

```typescript
// artist-typeorm-crud.adapter.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TypeOrmCrudAdapter } from '@concepta/nestjs-crud';
import { ArtistEntity } from './artist.entity';

@Injectable()
export class ArtistTypeOrmCrudAdapter extends TypeOrmCrudAdapter<ArtistEntity> {
  constructor(
    @InjectRepository(ArtistEntity)
    artistRepository: Repository<ArtistEntity>,
  ) {
    super(artistRepository);
  }
}
```

### Resource Types:

```typescript
// artist.types.ts
export const ArtistResource = {
  One: 'artist-one',
  Many: 'artist-many',
} as const;

export type ArtistResourceType = typeof ArtistResource[keyof typeof ArtistResource];
```

---

## Constructor Pattern

**Always use this constructor pattern for CRUD services:**

```typescript
constructor(
  @Inject(EntityTypeOrmCrudAdapter)
  protected readonly crudAdapter: EntityTypeOrmCrudAdapter,
  private readonly entityModelService: EntityModelService,
) {
  super(crudAdapter);
}
```

### Key Points:
- ✅ **Inject the adapter**: Use `@Inject()` for the CRUD adapter
- ✅ **Pass to super**: Call `super(crudAdapter)` in constructor
- ✅ **Access modifier**: Use `protected readonly` for adapter
- ✅ **Model service**: Inject model service for business logic

---

## Error Handling Pattern

Both patterns use the same error handling approach:

```typescript
try {
  // Business logic here
  const result = await super.methodName(req, dto, options);
  console.log('Operation successful');
  return result;
} catch (error) {
  // Check if it's a known entity exception
  if (error instanceof EntityException) {
    throw error; // Let known business exceptions bubble up
  }
  
  // Handle unexpected errors
  console.error('Unexpected error in operation:', error);
  throw new EntityException({
    message: 'Operation failed',
    originalError: error
  });
}
```

---

## Pattern Comparison

| Aspect | Direct CRUD | ConfigurableCrudBuilder |
|--------|-------------|------------------------|
| **Code Volume** | More explicit code | Less boilerplate |
| **Flexibility** | Medium - fixed structure | High - configurable |
| **Readability** | All endpoints visible | Controllers are minimal |
| **Debugging** | Easier to debug | Harder to trace |
| **Configuration** | Static configuration | Dynamic configuration |
| **Learning Curve** | Gentler | Steeper |
| **Recommended** | ✅ **YES** | ⚠️ **Legacy Only** |

---

## When to Choose Which Pattern

### ✅ Choose Direct CRUD when:
- ✅ **Building any new CRUD module** (RECOMMENDED)
- ✅ Simple, straightforward CRUD operations
- ✅ Fixed DTOs and endpoints
- ✅ Want explicit control over each endpoint
- ✅ Team prefers explicit over implicit code
- ✅ Debugging and tracing is important

### ⚠️ Choose ConfigurableCrudBuilder when:
- ⚠️ **Maintaining existing legacy code only**
- ⚠️ Building reusable CRUD modules
- ⚠️ Configuration comes from external sources
- ⚠️ Need dynamic endpoint configuration
- ⚠️ Want minimal controller code

**Recommendation: Use Direct CRUD for all new implementations. ConfigurableCrudBuilder should only be used for maintaining existing legacy code.**