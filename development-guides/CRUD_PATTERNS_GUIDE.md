# 🔄 CRUD PATTERNS GUIDE

> **For AI Tools**: This guide contains CRUD implementation patterns for Rockets SDK. Use this when building entities that need CRUD operations with the latest API patterns.

## 📋 **Quick Reference**

| Pattern | When to Use | Complexity | Recommended |
|---------|-------------|------------|-------------|
| [Direct CRUD](#direct-crud-pattern) | Standard CRUD, fixed DTOs, explicit control | Low | ✅ **RECOMMENDED** |
| [Custom Controllers](#custom-controllers) | Special business logic, non-standard operations | Medium | ⚠️ *As needed* |

---

## ✅ Prerequisite: Initialize CrudModule in the root AppModule

Before using any CRUD decorators or calling `CrudModule.forFeature(...)` in feature modules, you must initialize the CRUD infrastructure once at the application root with `CrudModule.forRoot({})`.

```typescript
// app.module.ts
@Module({
  imports: [
    CrudModule.forRoot({}),
    // ...other modules
  ],
})
export class AppModule {}
```

If you skip this, NestJS will fail to resolve `CRUD_MODULE_SETTINGS_TOKEN` and show an error mentioning `Symbol(__CRUD_MODULE_RAW_OPTIONS_TOKEN__)` in the `CrudModule` context.

## 🎯 **Pattern Decision Tree**

```
Need CRUD operations for your entity?
├── Yes → **RECOMMENDED: Use Direct CRUD Pattern**
│   ├── ✅ Explicit control over all endpoints
│   ├── ✅ Clear business logic placement
│   ├── ✅ Easy debugging and maintenance
│   ├── ✅ Access control integration
│   └── ✅ Full error handling
└── Special requirements → Custom Controllers

Use Direct CRUD for all standard entity operations.
```

---

## 🚀 **Direct CRUD Pattern** ⭐ **RECOMMENDED**

### **When to Use:**
- ✅ **All new CRUD implementations** 
- ✅ Standard entity operations (Create, Read, Update, Delete)
- ✅ Fixed DTOs and adapters
- ✅ Explicit control over endpoints
- ✅ Access control integration
- ✅ Business validation requirements

### **Architecture Overview:**

```
Controller → CRUD Service → Model Service → Adapter → Database
     ↑            ↑              ↑           ↑
Access Control | Business Logic | Validation | TypeORM
```

### **Complete Implementation:**

#### **1. Controller Layer**

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
import { ArtistResource } from './artist.constants'; // Updated import
import { ArtistCrudService } from './artist.crud.service';
import { 
  ArtistEntityInterface, 
  ArtistCreatableInterface, 
  ArtistUpdatableInterface 
} from './artist.interface';
import { AuthPublic } from '@concepta/nestjs-authentication'; // New import

/**
 * Artist CRUD Controller
 * 
 * Provides REST API endpoints for artist management using the latest patterns.
 * Handles CRUD operations with proper access control and validation.
 * 
 * BUSINESS RULES:
 * - All operations require appropriate role access (enforced by access control)
 * - Artist names must be unique (enforced by service layer)
 * - Uses soft deletion when hard deletion is not possible
 */
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
@AuthPublic() // Remove this if authentication is required
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

#### **2. CRUD Service Layer**

```typescript
// artist.crud.service.ts
import { Inject, Injectable } from '@nestjs/common';
import { CrudService } from '@concepta/nestjs-crud';
import { CrudRequestInterface } from '@concepta/nestjs-crud';
import { ArtistEntityInterface } from './artist.interface';
import { ArtistTypeOrmCrudAdapter } from './artist-typeorm-crud.adapter';
import { ArtistModelService } from './artist-model.service';
import { 
  ArtistCreateDto, 
  ArtistUpdateDto, 
  ArtistCreateManyDto 
} from './artist.dto';
import { 
  ArtistException 
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

  /**
   * Create one artist with business validation
   */
  async createOne(
    req: CrudRequestInterface<ArtistEntityInterface>,
    dto: ArtistCreateDto,
    options?: Record<string, unknown>,
  ): Promise<ArtistEntityInterface> {
    try {
      return await super.createOne(req, dto, options);
    } catch (error) {
      if (error instanceof ArtistException) {
        throw error;
      }
      throw new ArtistException('Failed to create artist', { originalError: error });
    }
  }

  /**
   * Update one artist with business validation
   */
  async updateOne(
    req: CrudRequestInterface<ArtistEntityInterface>,
    dto: ArtistUpdateDto,
    options?: Record<string, unknown>,
  ): Promise<ArtistEntityInterface> {
    try {
      return await super.updateOne(req, dto, options);
    } catch (error) {
      if (error instanceof ArtistException) {
        throw error;
      }
      throw new ArtistException('Failed to update artist', { originalError: error });
    }
  }

  /**
   * Delete one artist with business validation
   */
  async deleteOne(
    req: CrudRequestInterface<ArtistEntityInterface>,
    options?: Record<string, unknown>,
  ): Promise<void | ArtistEntityInterface> {
    try {
      return await super.deleteOne(req, options);
    } catch (error) {
      if (error instanceof ArtistException) {
        throw error;
      }
      throw new ArtistException('Failed to delete artist', { originalError: error });
    }
  }

  /**
   * Create many artists with business validation
   */
  async createMany(
    req: CrudRequestInterface<ArtistEntityInterface>,
    dto: ArtistCreateManyDto,
    options?: Record<string, unknown>,
  ): Promise<ArtistEntityInterface[]> {
    try {
      return await super.createMany(req, dto, options);
    } catch (error) {
      if (error instanceof ArtistException) {
        throw error;
      }
      throw new ArtistException('Failed to create artists', { originalError: error });
    }
  }
}
```

#### **3. Model Service Layer**

```typescript
// artist-model.service.ts
import { Injectable } from '@nestjs/common';
import {
  RepositoryInterface,
  ModelService,
  InjectDynamicRepository,
} from '@concepta/nestjs-common';
import { Not } from 'typeorm';
import { 
  ArtistEntityInterface, 
  ArtistCreatableInterface, 
  ArtistModelUpdatableInterface, 
  ArtistModelServiceInterface,
  ArtistStatus,
} from './artist.interface';
import { ArtistCreateDto, ArtistModelUpdateDto } from './artist.dto';
import { 
  ArtistNotFoundException, 
  ArtistNameAlreadyExistsException 
} from './artist.exception';
import { ARTIST_MODULE_ARTIST_ENTITY_KEY } from './artist.constants';

/**
 * Artist Model Service
 * 
 * Provides business logic for artist operations.
 * Extends the base ModelService and implements custom artist-specific methods.
 */
@Injectable()
export class ArtistModelService
  extends ModelService<
    ArtistEntityInterface,
    ArtistCreatableInterface,
    ArtistModelUpdatableInterface
  >
  implements ArtistModelServiceInterface
{
  protected createDto = ArtistCreateDto;
  protected updateDto = ArtistModelUpdateDto;

  constructor(
    @InjectDynamicRepository(ARTIST_MODULE_ARTIST_ENTITY_KEY)
    repo: RepositoryInterface<ArtistEntityInterface>,
  ) {
    super(repo);
  }

  /**
   * Find artist by name
   */
  async findByName(name: string): Promise<ArtistEntityInterface | null> {
    return this.repo.findOne({ 
      where: { name } 
    });
  }

  /**
   * Check if artist name is unique (excluding specific ID)
   */
  async isNameUnique(name: string, excludeId?: string): Promise<boolean> {
    const whereCondition: any = { name };
    
    if (excludeId) {
      whereCondition.id = Not(excludeId);
    }

    const existingArtist = await this.repo.findOne({
      where: whereCondition,
    });

    return !existingArtist;
  }

  /**
   * Get all active artists
   */
  async getActiveArtists(): Promise<ArtistEntityInterface[]> {
    return this.repo.find({
      where: { status: ArtistStatus.ACTIVE },
      order: { name: 'ASC' },
    });
  }

  /**
   * Override create method to add business validation
   */
  async create(data: ArtistCreatableInterface): Promise<ArtistEntityInterface> {
    // Validate name uniqueness
    const isUnique = await this.isNameUnique(data.name);
    if (!isUnique) {
      throw new ArtistNameAlreadyExistsException({
        message: `Artist with name "${data.name}" already exists`,
      });
    }

    // Set default status if not provided
    const artistData: ArtistCreatableInterface = {
      ...data,
      status: data.status || ArtistStatus.ACTIVE,
    };

    return super.create(artistData);
  }

  /**
   * Override update method to add business validation
   */
  async update(data: ArtistModelUpdatableInterface): Promise<ArtistEntityInterface> {
    const id = data.id;
    if (!id) {
      throw new Error('ID is required for update operation');
    }

    // Check if artist exists
    const existingArtist = await this.byId(id);
    if (!existingArtist) {
      throw new ArtistNotFoundException({
        message: `Artist with ID ${id} not found`,
      });
    }

    // Validate name uniqueness if name is being updated
    if (data.name && data.name !== existingArtist.name) {
      const isUnique = await this.isNameUnique(data.name, id);
      if (!isUnique) {
        throw new ArtistNameAlreadyExistsException({
          message: `Artist with name "${data.name}" already exists`,
        });
      }
    }

    return super.update(data);
  }
}
```

#### **4. TypeORM Adapter Layer**

```typescript
// artist-typeorm-crud.adapter.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TypeOrmCrudAdapter } from '@concepta/nestjs-crud';
import { ArtistEntity } from './artist.entity';

/**
 * Artist TypeORM CRUD Adapter
 * 
 * Simple adapter that extends TypeOrmCrudAdapter.
 * Provides database access layer for artist operations.
 */
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

---

## 🔧 **Key Patterns Explained**

### **1. Layered Architecture**

```typescript
// Clear separation of concerns
Controller  → API endpoints + access control
CRUD Service → CRUD operations + error handling  
Model Service → Business logic + validation
Adapter → Database operations
```

### **2. Error Handling Pattern**

```typescript
// Consistent error handling across all operations
try {
  return await super.createOne(req, dto, options);
} catch (error) {
  if (error instanceof ArtistException) {
    throw error; // Re-throw business exceptions
  }
  throw new ArtistException('Failed to create artist', { originalError: error });
}
```

### **3. Business Validation**

```typescript
// Business rules in model service
async create(data: ArtistCreatableInterface): Promise<ArtistEntityInterface> {
  // 1. Validate business rules (name uniqueness)
  const isUnique = await this.isNameUnique(data.name);
  if (!isUnique) {
    throw new ArtistNameAlreadyExistsException();
  }

  // 2. Set defaults
  const artistData = {
    ...data,
    status: data.status || ArtistStatus.ACTIVE,
  };

  // 3. Call parent method
  return super.create(artistData);
}
```

### **4. Access Control Integration**

```typescript
// Every endpoint has access control
@CrudReadMany()
@AccessControlReadMany(ArtistResource.Many) // Resource from constants
async getMany(@CrudRequest() crudRequest: CrudRequestInterface<ArtistEntityInterface>) {
  return this.artistCrudService.getMany(crudRequest);
}
```

### **5. Constants Usage**

```typescript
// Import resources from constants file
import { ArtistResource } from './artist.constants';

// Use in decorators
@AccessControlReadMany(ArtistResource.Many)

// Constants file structure
export const ArtistResource = {
  One: 'artist-one',
  Many: 'artist-many',
} as const;
```

---

## 🎯 **Custom Controllers** (When Needed)

### **When to Use Custom Controllers:**
- ✅ Special business operations not covered by CRUD
- ✅ Complex data transformations
- ✅ Multi-entity operations
- ✅ File uploads or downloads
- ✅ Reporting endpoints

### **Example: Custom Business Endpoint**

```typescript
// artist.custom.controller.ts
@Controller('artists')
@ApiTags('artists-custom')
export class ArtistCustomController {
  constructor(private artistModelService: ArtistModelService) {}

  @Get('active')
  @ApiOperation({ summary: 'Get all active artists' })
  async getActiveArtists(): Promise<ArtistDto[]> {
    const artists = await this.artistModelService.getActiveArtists();
    return artists.map(artist => new ArtistDto(artist));
  }

  @Post(':id/deactivate')
  @ApiOperation({ summary: 'Deactivate an artist' })
  async deactivateArtist(
    @Param('id') id: string
  ): Promise<ArtistDto> {
    const artist = await this.artistModelService.deactivateArtist(id);
    return new ArtistDto(artist);
  }

  @Get('search')
  @ApiOperation({ summary: 'Search artists by name' })
  async searchArtists(
    @Query('name') name: string
  ): Promise<ArtistDto[]> {
    // Custom search logic
    const artists = await this.artistModelService.searchByName(name);
    return artists.map(artist => new ArtistDto(artist));
  }
}
```

---

## 📊 **CRUD vs Custom Decision Matrix**

| Operation | Use CRUD | Use Custom |
|-----------|----------|------------|
| Get all entities | ✅ `getMany()` | ❌ |
| Get entity by ID | ✅ `getOne()` | ❌ |
| Create entity | ✅ `createOne()` | ❌ |
| Update entity | ✅ `updateOne()` | ❌ |
| Delete entity | ✅ `deleteOne()` | ❌ |
| Bulk create | ✅ `createMany()` | ❌ |
| Search/filter | ✅ Query params | ⚠️ Complex searches |
| Get active only | ❌ | ✅ Custom endpoint |
| Bulk operations | ❌ | ✅ Custom endpoint |
| File uploads | ❌ | ✅ Custom endpoint |
| Reports/analytics | ❌ | ✅ Custom endpoint |
| Multi-entity ops | ❌ | ✅ Custom endpoint |

---

## ✅ **Best Practices**

### **1. Always Use Direct CRUD for Standard Operations**
```typescript
// ✅ Good - Standard CRUD
@CrudController({ path: 'artists' })
export class ArtistCrudController implements CrudControllerInterface {}

// ❌ Avoid - Custom implementation of standard CRUD
@Controller('artists')
export class ArtistController {
  @Get() getAllArtists() {} // Don't reinvent CRUD
}
```

### **2. Put Business Logic in Model Service**
```typescript
// ✅ Good - Business logic in model service
async create(data: ArtistCreatableInterface) {
  const isUnique = await this.isNameUnique(data.name);
  if (!isUnique) throw new ArtistNameAlreadyExistsException();
  return super.create(data);
}

// ❌ Avoid - Business logic in controller
@Post()
async createArtist(@Body() dto: ArtistCreateDto) {
  // Don't put validation logic here
}
```

### **3. Handle Errors Consistently**
```typescript
// ✅ Good - Consistent error handling
try {
  return await super.createOne(req, dto, options);
} catch (error) {
  if (error instanceof ArtistException) throw error;
  throw new ArtistException('Failed to create artist', { originalError: error });
}
```

### **4. Use Constants for Resources**
```typescript
// ✅ Good - Import from constants
import { ArtistResource } from './artist.constants';
@AccessControlReadMany(ArtistResource.Many)

// ❌ Avoid - Hard-coded strings
@AccessControlReadMany('artist-many')
```

### **5. Keep Adapters Simple**
```typescript
// ✅ Good - Simple adapter
export class ArtistTypeOrmCrudAdapter extends TypeOrmCrudAdapter<ArtistEntity> {
  constructor(@InjectRepository(ArtistEntity) repo: Repository<ArtistEntity>) {
    super(repo);
  }
}

// ❌ Avoid - Complex logic in adapter
```

---

## 🚀 **Integration with Module System**

### **Module Configuration:**
```typescript
// artist.module.ts
@Module({
  imports: [
    TypeOrmModule.forFeature([ArtistEntity]),
    TypeOrmExtModule.forFeature({
      [ARTIST_MODULE_ARTIST_ENTITY_KEY]: { entity: ArtistEntity },
    }),
  ],
  controllers: [
    ArtistCrudController,
    ArtistCustomController, // Add custom controller if needed
  ],
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

## ⚡ **Performance Tips**

### **1. Use Eager Loading for Relationships**
```typescript
// In entity definition
@ManyToOne(() => GenreEntity, { eager: true })
genre: GenreEntity;
```

### **2. Implement Proper Indexing**
```typescript
// In entity definition
@Index(['name']) // Add database index
@Column({ unique: true })
name: string;
```

### **3. Use Query Optimization**
```typescript
// In model service - Use QueryBuilder for complex queries
async findActiveWithAlbums(): Promise<ArtistEntityInterface[]> {
  return this.repo.createQueryBuilder('artist')
    .leftJoinAndSelect('artist.albums', 'album')
    .where('artist.status = :status', { status: ArtistStatus.ACTIVE })
    .orderBy('artist.name', 'ASC')
    .getMany();
}
```

---

## 🎯 **Success Metrics**

**Your CRUD implementation is optimized when:**
- ✅ All standard operations use Direct CRUD pattern
- ✅ Business logic is centralized in model service
- ✅ Error handling is consistent across all operations
- ✅ Access control is properly implemented
- ✅ Custom endpoints only for non-standard operations
- ✅ Adapters are simple and focused
- ✅ Constants are used for all resource definitions

**🚀 Build robust CRUD operations with the Direct CRUD pattern!**

---

## 🔗 **CRUD Relations Patterns**

CRUD Relations enable you to automatically fetch related data when querying your main entity. Instead of making separate requests for each relation, you get nested JSON responses with all related data included.

### **🎯 What CRUD Relations Solve**

**Without Relations** (N+1 Problem):
```typescript
// Multiple API calls needed
const pet = await fetch('/pets/123');
const vaccinations = await fetch('/pets/123/vaccinations');
const appointments = await fetch('/pets/123/appointments');
```

**With Relations** (Single Request):
```typescript
// One API call gets everything
const petWithRelations = await fetch('/pets/123');
// Returns: { id, name, vaccinations: [...], appointments: [...] }
```

### **📋 Relations Quick Reference**

| Pattern | When to Use | Complexity | Registry Required |
|---------|-------------|------------|-------------------|
| [ConfigurableCrudBuilder](#configurablecrudbuilder-relations-pattern) | Complex admin interfaces, custom service logic | High | ✅ Manual |
| [Direct @CrudController](#direct-crudcontroller-relations-pattern) | Simple entity relations, straightforward operations | Low | ❌ Automatic |

### **💡 Important: Adapter-Agnostic Relations**

**CRUD Relations work with ANY data source**, not just databases:

```typescript
// ✅ Works with TypeORM (database)
@OneToMany(() => PetVaccinationEntity, (v) => v.pet)
vaccinations?: PetVaccinationEntity[];

// ✅ Works with JSON files (file system)
// No TypeORM decorators needed - just the interface
interface Pet {
  id: string;
  vaccinations?: PetVaccination[];
}

// ✅ Works with Supabase (REST API)
// ✅ Works with Firebase (NoSQL)
// ✅ Works with any custom adapter
```

**Key insight**: TypeORM decorators (`@OneToMany`, `@ManyToOne`, etc.) are **only needed for TypeORM database mapping**. The CRUD Relations system uses the **service adapters** to fetch related data, regardless of the underlying data source.

### **🔍 How to Set Up CRUD Relations**

Here's the step-by-step process to configure relations for any entity:

#### **Step 1: Show CRUD Relations Configuration**

You can configure CRUD Relations in two ways:

**Option A: Directly on @CrudController**
```typescript
@CrudController({ path: 'pets' })
@CrudRelations<PetEntity, [PetVaccinationEntity, PetAppointmentEntity]>({
  rootKey: 'id',
  relations: [
    {
      join: 'LEFT',
      cardinality: 'many',
      service: PetVaccinationCrudService,
      property: 'vaccinations',
      primaryKey: 'id',
      foreignKey: 'petId',
    },
    {
      join: 'LEFT',
      cardinality: 'many',
      service: PetAppointmentCrudService,
      property: 'appointments',
      primaryKey: 'id',
      foreignKey: 'petId',
    }
  ],
})
export class PetCrudController { }
```

**Option B: On extraDecorators with ConfigurableCrudBuilder**
```typescript
const builder = new ConfigurableCrudBuilder({
  controller: {
    path: 'admin/pets',
    extraDecorators: [
      CrudRelations<PetEntity, [PetVaccinationEntity, PetAppointmentEntity]>({
        rootKey: 'id',
        relations: [
          {
            join: 'LEFT',
            cardinality: 'many',
            service: PetVaccinationCrudService,
            property: 'vaccinations',
            primaryKey: 'id',
            foreignKey: 'petId',
          },
          {
            join: 'LEFT',
            cardinality: 'many',
            service: PetAppointmentCrudService,
            property: 'appointments',
            primaryKey: 'id',
            foreignKey: 'petId',
          }
        ],
      }),
    ],
  },
});
```

#### **Step 2: Register Services in Providers**

All relation services must be available through dependency injection:

```typescript
// In your module providers array:
providers: [
  PetCrudService,                // Main entity service
  PetVaccinationCrudService,     // ← Relation service (required)
  PetAppointmentCrudService,     // ← Relation service (required)
  // ... other providers
]
```

#### **Step 3: Configure Relation Registry (Always Required)**

You **always** need to configure the relation registry with the standard token pattern:

```typescript
// Always required - relation registry configuration
{
  provide: 'PET_RELATION_REGISTRY',
  inject: [PetVaccinationCrudService, PetAppointmentCrudService],
  useFactory: (
    vaccinationService: PetVaccinationCrudService,
    appointmentService: PetAppointmentCrudService,
  ) => {
    const registry = new CrudRelationRegistry<
      PetEntityInterface,
      [PetVaccinationEntity, PetAppointmentEntity]
    >();
    
    // Register each relation service
    registry.register(vaccinationService);
    registry.register(appointmentService);
    
    return registry;
  },
}
```

**Then inject it into your CRUD service constructor:**
```typescript
@Injectable()
export class PetCrudService extends CrudService<PetEntityInterface> {
  constructor(
    @Inject(PetTypeOrmCrudAdapter)
    protected readonly crudAdapter: PetTypeOrmCrudAdapter,
    @Inject('PET_RELATION_REGISTRY') // ← Always inject the registry
    protected readonly relationRegistry: CrudRelationRegistry,
  ) {
    super(crudAdapter, relationRegistry);
  }

  // Business logic methods would go here
  async createOne(req, dto) {
    // Custom validation logic would be here
    return super.createOne(req, dto);
  }

  async updateOne(req, dto) {
    // Custom business rules would be here
    return super.updateOne(req, dto);
  }
}
```

### **🎯 Relationship Configuration Reference**

| Field | Description | Example Values |
|-------|-------------|----------------|
| `join` | SQL JOIN type | `'LEFT'`, `'INNER'` |
| `cardinality` | Relationship type | `'one'` (single object), `'many'` (array) |
| `service` | CRUD service class | `PetVaccinationCrudService` |
| `property` | JSON property name | `'vaccinations'`, `'medicalRecord'` |
| `primaryKey` | Main entity key | `'id'` |
| `foreignKey` | Related entity key | `'petId'`, `'userId'` |

### **Configuration Examples:**

```typescript
CrudRelations<PetEntity, [PetVaccinationEntity, PetAppointmentEntity]>({
  rootKey: 'id',
  relations: [
    // One-to-Many: Pet has many Vaccinations
    {
      join: 'LEFT',
      cardinality: 'many',
      service: PetVaccinationCrudService,
      property: 'vaccinations',
      primaryKey: 'id',
      foreignKey: 'petId',
    },
    // One-to-Many: Pet has many Appointments
    {
      join: 'LEFT',
      cardinality: 'many',
      service: PetAppointmentCrudService,
      property: 'appointments',
      primaryKey: 'id',
      foreignKey: 'petId',
    },
  ],
})
```

### **⚡ Key Benefits**

- **🚀 Performance**: Fetch all related data in optimized queries
- **🎯 Simplicity**: Declarative configuration, no manual query building
- **📘 Type Safety**: Full TypeScript support with proper typing
- **🔄 Consistency**: Relations work the same across different CRUD services
- **🛡️ Flexibility**: Services can use different adapters (database, files, APIs)

---

## 🏗️ **Pattern Selection Guide**

| Requirement | ConfigurableCrudBuilder | Direct @CrudController |
|-------------|-------------------------|------------------------|
| **Complexity** | High (admin interfaces) | Low (standard operations) |
| **Business Logic** | Complex validation, transformation | Simple CRUD with relations |
| **Configuration** | Dynamic, flexible | Fixed, declarative |
| **Registry Setup** | Manual (full control) | Automatic (convention) |
| **Learning Curve** | Steep | Gentle |
| **Use Cases** | Admin panels, complex workflows | User-facing APIs, simple relations |

**🎯 Quick Decision:**
- **ConfigurableCrudBuilder**: Complex business logic, dynamic configuration, fine-grained control
- **Direct @CrudController**: Standard CRUD operations with relations (recommended for most cases)

---

## 🏗️ **ConfigurableCrudBuilder Relations Pattern**

### **Real Example: Pet with Vaccinations (ConfigurableCrudBuilder)**

Here's how to implement the same Pet entity using ConfigurableCrudBuilder pattern:

```typescript
// pet-admin.module.ts - Alternative implementation with ConfigurableCrudBuilder
import {
  ConfigurableCrudBuilder,
  CrudRequestInterface,
  CrudResponsePaginatedDto,
  CrudRelationRegistry,
  CrudService,
  CrudAdapter,
} from '@concepta/nestjs-crud';
import { CrudRelations } from '@concepta/nestjs-crud/dist/crud/decorators/routes/crud-relations.decorator';

@Module({})
export class PetAdminModule {
  static register(): DynamicModule {
    // Create paginated response DTO
    @Exclude()
    class PetPaginatedDto extends CrudResponsePaginatedDto<PetEntityInterface> {
      @Expose()
      @ApiProperty({
        type: PetResponseDto,
        isArray: true,
        description: 'Array of Pets',
      })
      @Type(() => PetResponseDto)
      data: PetEntityInterface[] = [];
    }

    // Build CRUD controller with relations using ConfigurableCrudBuilder
    const builder = new ConfigurableCrudBuilder<
      PetEntityInterface,
      PetCreatableInterface,
      PetUpdatableInterface
    >({
      service: {
        adapter: PetTypeOrmCrudAdapter,
        injectionToken: 'PET_CRUD_SERVICE_TOKEN',
      },
      controller: {
        path: 'admin/pets',
        model: {
          type: PetResponseDto,
          paginatedType: PetPaginatedDto,
        },
        extraDecorators: [
          ApiTags('admin'),
          UseGuards(AdminGuard),
          ApiBearerAuth(),
          // 👇 CRUD Relations Configuration
          CrudRelations<PetEntity, [PetVaccinationEntity, PetAppointmentEntity]>({
            rootKey: 'id',
            relations: [
              {
                join: 'LEFT',
                cardinality: 'many', // ← One pet has many vaccinations
                service: PetVaccinationCrudService, // ← Must be registered in providers
                property: 'vaccinations',
                primaryKey: 'id',
                foreignKey: 'petId',
              },
              {
                join: 'LEFT',
                cardinality: 'many', // ← One pet has many appointments
                service: PetAppointmentCrudService, // ← Must be registered in providers
                property: 'appointments',
                primaryKey: 'id',
                foreignKey: 'petId',
              },
            ],
          }),
        ],
      },
      getMany: {},
      getOne: {},
      createOne: {
        dto: PetCreateDto,
      },
      updateOne: {
        dto: PetUpdateDto,
      },
    });

    const { ConfigurableControllerClass } = builder.build();

    // 👇 Custom CRUD service with relations support and business logic
    class PetAdminCrudService extends CrudService<
      PetEntityInterface,
      [PetVaccinationEntity, PetAppointmentEntity]
    > {
      constructor(
        @Inject(PetTypeOrmCrudAdapter)
        protected readonly crudAdapter: PetTypeOrmCrudAdapter,
        @Inject('PET_RELATION_REGISTRY')
        protected readonly relationRegistry: CrudRelationRegistry<
          PetEntityInterface,
          [PetVaccinationEntity, PetAppointmentEntity]
        >,
        private readonly petModelService: PetModelService,
      ) {
        super(crudAdapter, relationRegistry);
      }

      // Custom business logic for pet creation
      async createOne(
        req: CrudRequestInterface<PetEntityInterface>,
        dto: PetCreateDto,
      ): Promise<PetEntityInterface> {
        // Add business validation
        if (dto.age < 0 || dto.age > 30) {
          throw new BadRequestException('Pet age must be between 0 and 30 years');
        }

        // Ensure pet name is unique for this user
        const existingPet = await this.petModelService.findByNameAndUser(dto.name, dto.userId);
        if (existingPet) {
          throw new BadRequestException(`Pet named "${dto.name}" already exists for this user`);
        }

        // Set default status
        const petData = {
          ...dto,
          status: dto.status || PetStatus.ACTIVE,
        };

        return super.createOne(req, petData);
      }

      // Custom business logic for pet updates
      async updateOne(
        req: CrudRequestInterface<PetEntityInterface>,
        dto: PetUpdateDto,
      ): Promise<PetEntityInterface> {
        // Add business validation
        if (dto.age && (dto.age < 0 || dto.age > 30)) {
          throw new BadRequestException('Pet age must be between 0 and 30 years');
        }

        return super.updateOne(req, dto);
      }
    }

    // Controller extends ConfigurableControllerClass
    class PetAdminCrudController extends ConfigurableControllerClass {}

    return {
      module: PetAdminModule,
      controllers: [PetAdminCrudController],
      providers: [
        PetTypeOrmCrudAdapter,
        PetModelService,
        // 👇 CRITICAL: Register CrudRelationRegistry with all relation services
        {
          provide: 'PET_RELATION_REGISTRY',
          inject: [PetVaccinationCrudService, PetAppointmentCrudService],
          useFactory: (
            vaccinationService: PetVaccinationCrudService,
            appointmentService: PetAppointmentCrudService,
          ) => {
            const registry = new CrudRelationRegistry<
              PetEntityInterface,
              [PetVaccinationEntity, PetAppointmentEntity]
            >();
            registry.register(vaccinationService);
            registry.register(appointmentService);
            return registry;
          },
        },
        PetAdminCrudService,
        {
          provide: 'PET_CRUD_SERVICE_TOKEN',
          useClass: PetAdminCrudService,
        },
      ],
      exports: [PetAdminCrudService, PetTypeOrmCrudAdapter],
    };
  }
}
```

### **Key Features of ConfigurableCrudBuilder Pattern:**

1. **Advanced Configuration**: Uses `ConfigurableCrudBuilder` for complex setup
2. **Custom Business Logic**: Extended service class with validation and custom methods
3. **Manual Registry**: Explicit registration of relation services in `CrudRelationRegistry`
4. **Dynamic Module**: Flexible module configuration with injectable tokens
5. **Full Control**: Complete control over each CRUD operation and relation handling

---

## 🎯 **Direct @CrudController Relations Pattern**

### **When to Use:**
- ✅ Simple entity relations (pet with vaccinations and appointments)
- ✅ Straightforward CRUD operations with automatic relation loading
- ✅ Minimal configuration required
- ✅ Standard access control patterns
- ✅ Quick development without complex business logic

### **Real Example: Pet with Vaccinations and Appointments**

Based on `examples/sample-server-auth/src/modules/pet/domains/pet/pet.crud.controller.ts`:

```typescript
// pet.crud.controller.ts
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import {
  AccessControlCreateMany,
  AccessControlCreateOne,
  AccessControlDeleteOne,
  AccessControlGuard,
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
import { CrudRelations } from '@concepta/nestjs-crud/dist/crud/decorators/routes/crud-relations.decorator';
import { 
  PetCreateManyDto, 
  PetCreateDto, 
  PetPaginatedDto, 
  PetUpdateDto, 
  PetResponseDto 
} from './pet.dto';
import { PetAccessQueryService } from './pet-access-query.service';
import { PetResource } from './pet.types';
import { PetCrudService } from './pet.crud.service';
import { 
  PetEntityInterface, 
  PetCreatableInterface, 
  PetUpdatableInterface 
} from './pet.interface';
import { PetEntity } from './pet.entity';
import { PetVaccinationEntity, PetVaccinationCrudService } from '../pet-vaccination';
import { PetAppointmentEntity, PetAppointmentCrudService } from '../pet-appointment';
import { AuthorizedUser } from '@bitwild/rockets';
import { AuthUser } from '@concepta/nestjs-authentication';
import { UseGuards } from '@nestjs/common';
import { AuthJwtGuard } from '@concepta/nestjs-auth-jwt';
import { AppRole } from '../../../../app.acl';

// 👇 Direct decorator approach with multiple relations
@CrudController({
  path: 'pets',
  model: {
    type: PetResponseDto,
    paginatedType: PetPaginatedDto,
  },
})
@CrudRelations<PetEntity, [PetVaccinationEntity, PetAppointmentEntity]>({
  rootKey: 'id',
  relations: [
    {
      join: 'LEFT',
      cardinality: 'many', // ← One pet has many vaccinations
      service: PetVaccinationCrudService,
      property: 'vaccinations',
      primaryKey: 'id',
      foreignKey: 'petId',
    },
    {
      join: 'LEFT',
      cardinality: 'many', // ← One pet has many appointments
      service: PetAppointmentCrudService,
      property: 'appointments',
      primaryKey: 'id',
      foreignKey: 'petId',
    },
  ],
})
@AccessControlQuery({
  service: PetAccessQueryService,
})
@UseGuards(AccessControlGuard)
@ApiTags('Pets')
@ApiBearerAuth()
export class PetCrudController implements CrudControllerInterface<
  PetEntity,
  PetCreatableInterface,
  PetUpdatableInterface
> {
  constructor(private petCrudService: PetCrudService) {}

  @CrudReadMany()
  @AccessControlReadMany(PetResource.Many)
  async getMany(
    @CrudRequest() crudRequest: CrudRequestInterface<PetEntity>,
    @AuthUser() user: AuthorizedUser,
  ) {
    // Custom logic for ownership-based access control
    const roleNames = user.userRoles?.map(ur => ur.role.name) || [];
    const hasOnlyUserRole = roleNames.includes(AppRole.User) && 
                            !roleNames.includes(AppRole.Admin) && 
                            !roleNames.includes(AppRole.Manager);
    
    if (hasOnlyUserRole) {
      // Add userId filter to ensure user only sees their own pets
      const modifiedRequest: CrudRequestInterface<PetEntity> = {
        ...crudRequest,
        parsed: {
          ...(crudRequest.parsed || {}),
          filter: [
            ...((crudRequest.parsed?.filter as Array<{ field: string; operator: string; value: unknown }>) || []),
            { field: 'userId', operator: '$eq', value: user.id }
          ],
        } as typeof crudRequest.parsed,
      };
      return this.petCrudService.getMany(modifiedRequest);
    }
    
    // Admins and managers can see all pets
    return this.petCrudService.getMany(crudRequest); 
  }

  @CrudReadOne()
  @AccessControlReadOne(PetResource.One)
  async getOne(@CrudRequest() crudRequest: CrudRequestInterface<PetEntity>) {
    return this.petCrudService.getOne(crudRequest);
  }

  @CrudCreateOne({
    dto: PetCreateDto
  })
  @AccessControlCreateOne(PetResource.One)
  async createOne(
    @CrudRequest() crudRequest: CrudRequestInterface<PetEntity>,
    @CrudBody() petCreateDto: PetCreateDto,
    @AuthUser() user: AuthorizedUser,
  ) {
    // Assign userId from authenticated user
    petCreateDto.userId = user.id;
    return this.petCrudService.createOne(crudRequest, petCreateDto);
  }

  @CrudUpdateOne({
    dto: PetUpdateDto
  })
  @AccessControlUpdateOne(PetResource.One)
  async updateOne(
    @CrudRequest() crudRequest: CrudRequestInterface<PetEntity>,
    @CrudBody() petUpdateDto: PetUpdateDto,
  ) {
    return this.petCrudService.updateOne(crudRequest, petUpdateDto);
  }

  @CrudDeleteOne()
  @AccessControlDeleteOne(PetResource.One)
  async deleteOne(
    @CrudRequest() crudRequest: CrudRequestInterface<PetEntity>,
    @AuthUser() user: AuthorizedUser,
  ) {
    console.log('Delete attempt by user:', user.id);
    console.log('User roles:', user.userRoles?.map(ur => ur.role.name));
    return this.petCrudService.deleteOne(crudRequest);
  }

  @CrudRecoverOne()
  @AccessControlRecoverOne(PetResource.One)
  async recoverOne(@CrudRequest() crudRequest: CrudRequestInterface<PetEntity>) {
    return this.petCrudService.recoverOne(crudRequest);
  }
}
```

### **Module Registration for Direct Pattern:**

```typescript
// pet.module.ts
@Module({
  imports: [
    CrudModule.forRoot({}), // Required for CRUD functionality
    TypeOrmModule.forFeature([
      PetEntity, 
      PetVaccinationEntity, 
      PetAppointmentEntity
    ]),
  ],
  controllers: [PetCrudController],
  providers: [
    PetCrudService,
    PetVaccinationCrudService, // ← Relations services must be provided
    PetAppointmentCrudService, // ← Relations services must be provided
    PetAccessQueryService,
    
    // Note: In Direct Pattern, the CrudRelationRegistry is handled automatically
    // by the @CrudRelations decorator, but the services must still be available
    // through dependency injection
  ],
})
export class PetModule {}
```

### **Key Features of Direct @CrudController Pattern:**

1. **Simple Configuration**: Direct use of `@CrudController` and `@CrudRelations` decorators
2. **Multiple Relations**: Easy to define multiple related entities (vaccinations, appointments)
3. **Automatic Registry**: No manual `CrudRelationRegistry` registration needed
4. **Access Control Integration**: Works seamlessly with access control guards and ownership filtering
5. **Standard CRUD Service**: Uses standard `PetCrudService` without complex customization

---

---


## ⚠️ **Common CRUD Relations Mistakes**

### **❌ Mistake 1: Missing @Type() Decorator**

```typescript
// ❌ WRONG: No @Type decorator
export class PetDto {
  @ApiPropertyOptional()
  @Expose()
  vaccinations?: PetVaccinationDto[];
}

// ✅ CORRECT: With @Type decorator
export class PetDto {
  @ApiPropertyOptional({ type: [PetVaccinationDto] })
  @Expose()
  @Type(() => PetVaccinationDto)  // ← CRITICAL for serialization
  @ValidateNested({ each: true })
  vaccinations?: PetVaccinationDto[];
}
```

### **❌ Mistake 2: Not Registering Related Service**

```typescript
// ❌ WRONG: Service not registered in registry
{
  provide: 'PET_RELATION_REGISTRY',
  useFactory: () => new CrudRelationRegistry(),
  // Missing: registry.register(vaccinationService)
}

// ✅ CORRECT: Service properly registered
{
  provide: 'PET_RELATION_REGISTRY',
  inject: [PetVaccinationCrudService],
  useFactory: (vaccinationService: PetVaccinationCrudService) => {
    const registry = new CrudRelationRegistry();
    registry.register(vaccinationService);  // ← REQUIRED
    return registry;
  },
}
```

### **❌ Mistake 3: Swapped Primary/Foreign Keys**

```typescript
// ❌ WRONG: Keys are swapped
{
  primaryKey: 'petId',    // This is on related entity!
  foreignKey: 'id',       // This is on root entity!
}

// ✅ CORRECT: Proper key mapping
{
  primaryKey: 'id',       // Pet.id (root entity)
  foreignKey: 'petId',    // PetVaccination.petId (related entity)
}
```

### **❌ Mistake 4: Wrong Cardinality**

```typescript
// ❌ WRONG: Cardinality doesn't match TypeORM relationship
@OneToMany(() => PetVaccinationEntity, (v) => v.pet)
vaccinations?: PetVaccinationEntity[];

@CrudRelations({
  relations: [{ 
    cardinality: 'one'  // WRONG! Should be 'many'
  }],
})

// ✅ CORRECT: Matching cardinality
@CrudRelations({
  relations: [{ 
    cardinality: 'many'  // Matches @OneToMany
  }],
})
```

### **❌ Mistake 5: Missing Entity Registration**

```typescript
// ❌ WRONG: Only root entity registered
@Module({
  imports: [
    TypeOrmModule.forFeature([PetEntity])  // Missing related entities!
  ],
})

// ✅ CORRECT: All entities registered
@Module({
  imports: [
    TypeOrmModule.forFeature([
      PetEntity,
      PetVaccinationEntity,      // ← Required for relations
      PetAppointmentEntity,      // ← Required for relations
    ])
  ],
})
```

### **❌ Mistake 6: Not Re-fetching After Update**

```typescript
// ❌ WRONG: Returns stale data
async updateOne(req, dto) {
  const { vaccinations, ...petData } = dto;
  const pet = await super.updateOne(req, petData);
  
  if (vaccinations) {
    await this.vaccinationService.updateMany(vaccinations);
  }
  
  return pet;  // Vaccinations are not updated in response!
}

// ✅ CORRECT: Re-fetch to get fresh relations
async updateOne(req, dto) {
  const { vaccinations, ...petData } = dto;
  const pet = await super.updateOne(req, petData);
  
  if (vaccinations) {
    await this.vaccinationService.updateMany(vaccinations);
  }
  
  return super.getOne(req);  // Fresh data with updated relations
}
```

### **❌ Mistake 7: Circular Dependency**

```typescript
// ❌ WRONG: Direct circular dependency
@Module({
  providers: [
    PetCrudService,
    PetVaccinationCrudService,
    // This creates circular dependency
  ],
})

// ✅ CORRECT: Use forwardRef
@Module({
  providers: [
    PetCrudService,
    {
      provide: 'PET_RELATION_REGISTRY',
      inject: [forwardRef(() => PetVaccinationCrudService)],
      useFactory: (service) => {
        const registry = new CrudRelationRegistry();
        registry.register(service);
        return registry;
      },
    },
  ],
})
```

---

## 🔍 **CRUD Relations Troubleshooting Checklist**

When relations don't work, check these items:

### **📋 Setup Checklist**

- [ ] **All entities registered in TypeORM?**
  ```typescript
  TypeOrmModule.forFeature([RootEntity, RelatedEntity])
  ```

- [ ] **Related service registered in registry?**
  ```typescript
  registry.register(relatedCrudService);
  ```

- [ ] **Registry injected into main service?**
  ```typescript
  @Inject('RELATION_REGISTRY_TOKEN')
  protected readonly relationRegistry: CrudRelationRegistry
  ```

- [ ] **@CrudRelations decorator on controller?**
  ```typescript
  @CrudRelations<RootEntity, [RelatedEntity]>({ ... })
  ```

- [ ] **Correct primaryKey/foreignKey mapping?**
  ```typescript
  primaryKey: 'id',      // Root entity field
  foreignKey: 'rootId',  // Related entity field
  ```

- [ ] **@Type() decorator on DTO properties?**
  ```typescript
  @Type(() => RelatedDto)
  relatedData?: RelatedDto;
  ```

### **🐛 Common Error Messages**

| Error | Likely Cause | Solution |
|-------|--------------|----------|
| "Cannot resolve dependency" | Service not in registry | Add service to registry factory |
| "Relations not appearing" | Missing @Type() decorator | Add @Type(() => RelatedDto) |
| "Circular dependency" | Module dependency loop | Use forwardRef() |
| "Entity not found" | Missing TypeORM registration* | Add to TypeOrmModule.forFeature() |
| "primaryKey/foreignKey" | Swapped key configuration | Check key mapping direction |

*_Only applies when using TypeORM adapter. Other adapters (JSON, Supabase, etc.) have different registration patterns._

### **🔧 Debug Steps**

1. **Check Network Tab**: Are related entities being fetched?
2. **Check Logs**: Any errors during service resolution?
3. **Check Registry**: Is the related service actually registered?
4. **Check DTOs**: Do they have proper decorators?
5. **Check Module**: Are all entities and services provided?

---

## 📋 **Quick Copy-Paste Templates**

> **Note**: These examples use TypeORM decorators for demonstration, but CRUD Relations work with **any data source**. If you're using JSON files, Supabase, or other adapters, you only need the interfaces and service configuration - no TypeORM decorators required.

### **One-to-One Relationship Template (TypeORM Example)**

```typescript
// 1. Entity Setup
@Entity('users')
export class UserEntity {
  @OneToOne(() => UserProfileEntity, (profile) => profile.user)
  profile?: UserProfileEntity;
}

@Entity('user_profiles')
export class UserProfileEntity {
  @Column()
  userId!: string;
  
  @OneToOne(() => UserEntity, (user) => user.profile)
  @JoinColumn({ name: 'userId' })
  user?: UserEntity;
}

// 2. Controller Configuration
@CrudController({ path: 'users' })
@CrudRelations<UserEntity, [UserProfileEntity]>({
  rootKey: 'id',
  relations: [{
    join: 'LEFT',
    cardinality: 'one',
    service: UserProfileCrudService,
    property: 'profile',
    primaryKey: 'id',
    foreignKey: 'userId',
  }],
})
export class UserCrudController { }

// 3. DTO Setup
export class UserDto {
  @ApiPropertyOptional({ type: UserProfileDto })
  @Expose()
  @Type(() => UserProfileDto)
  @ValidateNested()
  profile?: UserProfileDto;
}

// 4. Module Setup
@Module({
  imports: [TypeOrmModule.forFeature([UserEntity, UserProfileEntity])],
  providers: [
    UserCrudService,
    UserProfileCrudService,
    {
      provide: 'USER_RELATION_REGISTRY',
      inject: [UserProfileCrudService],
      useFactory: (service) => {
        const registry = new CrudRelationRegistry();
        registry.register(service);
        return registry;
      },
    },
  ],
})
export class UserModule {}
```

### **One-to-Many Relationship Template (TypeORM Example)**

```typescript
// 1. Entity Setup
@Entity('pets')
export class PetEntity {
  @OneToMany(() => PetVaccinationEntity, (vaccination) => vaccination.pet)
  vaccinations?: PetVaccinationEntity[];
}

@Entity('pet_vaccinations')
export class PetVaccinationEntity {
  @Column()
  petId!: string;
  
  @ManyToOne(() => PetEntity, (pet) => pet.vaccinations)
  @JoinColumn({ name: 'petId' })
  pet?: PetEntity;
}

// 2. Controller Configuration
@CrudController({ path: 'pets' })
@CrudRelations<PetEntity, [PetVaccinationEntity]>({
  rootKey: 'id',
  relations: [{
    join: 'LEFT',
    cardinality: 'many',
    service: PetVaccinationCrudService,
    property: 'vaccinations',
    primaryKey: 'id',
    foreignKey: 'petId',
  }],
})
export class PetCrudController { }

// 3. DTO Setup (Array)
export class PetDto {
  @ApiPropertyOptional({ type: [PetVaccinationDto] })
  @Expose()
  @Type(() => PetVaccinationDto)
  @ValidateNested({ each: true })
  @IsArray()
  vaccinations?: PetVaccinationDto[];
}

// 4. Service with Create Logic
@Injectable()
export class PetCrudService extends CrudService<PetEntity> {
  async createOne(req, dto) {
    const { vaccinations, ...petData } = dto;
    
    // Create pet first
    const pet = await super.createOne(req, petData);
    
    // Create vaccinations
    if (vaccinations?.length) {
      await Promise.all(
        vaccinations.map(v => 
          this.vaccinationService.createOne(req, { ...v, petId: pet.id })
        )
      );
    }
    
    return pet; // Relations auto-hydrated
  }
}
```

---

## ⚡ **Relations Best Practices**

### **1. Service Registration**

**ConfigurableCrudBuilder Pattern** (Manual Registration Required):
```typescript
// ✅ Always register all relation services in CrudRelationRegistry
{
  provide: PET_RELATION_REGISTRY_TOKEN,
  inject: [PetVaccinationCrudService, PetAppointmentCrudService],
  useFactory: (vaccinationService, appointmentService) => {
    const registry = new CrudRelationRegistry<
      PetEntityInterface,
      [PetVaccinationEntity, PetAppointmentEntity]
    >();
    registry.register(vaccinationService);
    registry.register(appointmentService);
    return registry;
  },
}
```

**Direct @CrudController Pattern** (Automatic Registration):
```typescript
// ✅ Just provide the services in the module
providers: [
  PetCrudService,
  PetVaccinationCrudService, // ← Must be provided for relations to work
  PetAppointmentCrudService, // ← Must be provided for relations to work
]
```

### **2. Pattern Selection**

**ConfigurableCrudBuilder**: Complex business logic, custom service methods, admin interfaces
**Direct @CrudController**: Simple CRUD operations, straightforward relations, quick development

### **3. Performance Considerations**

- **Avoid deep nesting** of relations (max 2-3 levels)
- **Use LEFT JOIN** to include records even when related data doesn't exist
- **Consider pagination** for endpoints that return many related records
- **Monitor query performance** and optimize as needed

### **4. Error Handling**

```typescript
// ConfigurableCrudBuilder: Custom error handling in service
async updateOne(req, dto) {
  try {
    const result = await super.updateOne(req, userDto);
    
    if (metadata) {
      await this.metadataService.createOrUpdate(result.id, metadata);
    }
    
    return await super.getOne(req);
  } catch (error) {
    this.logger.error('Update with relations failed', { error: error.message });
    throw new BadRequestException('Update failed');
  }
}

// Direct @CrudController: Framework handles most errors automatically
```

---


---

## 📈 **CRUD Relations Success Criteria**

### **✅ Implementation Checklist**

**Your CRUD relations implementation is correct when:**

#### **Setup Requirements:**
- ✅ All entities registered in `TypeOrmModule.forFeature([...])`
- ✅ All relation services registered in `CrudRelationRegistry`
- ✅ Registry injected into main CRUD service constructor
- ✅ `@CrudRelations` decorator properly configured on controller
- ✅ Correct `primaryKey`/`foreignKey` mapping (not swapped)
- ✅ Cardinality matches TypeORM relationships ('one' vs 'many')

#### **DTO Requirements:**
- ✅ `@Type(() => RelatedDto)` decorator on nested properties
- ✅ `@ValidateNested()` decorator for validation
- ✅ `@IsArray()` and `{ each: true }` for array relationships
- ✅ Proper Swagger documentation with nested types

#### **Functional Requirements:**
- ✅ **GET requests** return entities with nested relations
- ✅ **POST requests** create entities with nested data successfully
- ✅ **PATCH requests** update entities and relations correctly
- ✅ **DELETE requests** handle related data appropriately
- ✅ No TypeScript compilation errors
- ✅ All tests pass

#### **Runtime Verification:**
- ✅ Relations appear in API responses (check with Postman/browser)
- ✅ Create operations with nested data work
- ✅ Update operations refresh relation data
- ✅ Error handling works gracefully for relation failures
- ✅ Performance is acceptable (no N+1 query problems)

### **🎯 API Testing Checklist**

Test these scenarios to verify your implementation:

```bash
# 1. Create with relations
POST /pets
{
  "name": "Buddy",
  "species": "dog",
  "vaccinations": [
    { "vaccineName": "Rabies", "administeredDate": "2024-01-15" }
  ]
}

# 2. Read with relations
GET /pets/123
# Should return: { id, name, vaccinations: [...] }

# 3. Update with relations
PATCH /pets/123
{
  "name": "Buddy Updated",
  "vaccinations": [
    { "vaccineName": "DHPP", "administeredDate": "2024-02-15" }
  ]
}

# 4. List with relations
GET /pets
# Should return array with nested relations

# 5. Error handling
POST /pets
{ "invalidData": true }
# Should return proper validation errors
```

### **🚨 Common Issues and Quick Fixes**

| Issue | Quick Fix |
|-------|-----------|
| Relations not appearing | Check `@Type(() => RelatedDto)` on DTO |
| "Cannot resolve dependency" | Add service to registry factory |
| TypeScript errors | Verify generic types match entities |
| Stale data after update | Use `return super.getOne(req)` |
| Circular dependency | Use `forwardRef()` in registry |

**🚀 Build powerful CRUD operations with automatic relation loading!**

---

## 🔗 **Related Guides**

- [TESTING_GUIDE.md](./TESTING_GUIDE.md) - Test CRUD operations
- [ACCESS_CONTROL_GUIDE.md](./ACCESS_CONTROL_GUIDE.md) - Secure CRUD endpoints
- [AI_TEMPLATES_GUIDE.md](./AI_TEMPLATES_GUIDE.md) - Generate complete modules
- [ROCKETS_AI_INDEX.md](./ROCKETS_AI_INDEX.md) - Navigation hub