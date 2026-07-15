# Code Conventions Guide

> **For AI Tools**: This guide contains project-wide code standards and conventions. Use this to ensure consistent code style across all modules and files.

## 📋 **Quick Reference**

| Category | Section |
|----------|---------|
| File naming | [File Naming Conventions](#file-naming-conventions) |
| Code structure | [Code Structure](#code-structure) |
| TypeScript patterns | [TypeScript Conventions](#typescript-conventions) |
| Error handling | [Error Handling Standards](#error-handling-standards) |
| Documentation | [Documentation Standards](#documentation-standards) |

---

## File Naming Conventions

### Directory Structure

```
src/
├── modules/
│   └── {entity}/                    # kebab-case, singular
│       ├── {entity}.entity.ts       # entity definition
│       ├── {entity}.interface.ts    # all interfaces + enums
│       ├── {entity}.dto.ts          # API DTOs
│       ├── {entity}.exception.ts    # business exceptions
│       ├── {entity}-model.service.ts # business logic
│       ├── {entity}-typeorm-crud.adapter.ts # database adapter
│       ├── {entity}.crud.service.ts # CRUD operations
│       ├── {entity}.crud.controller.ts # API endpoints
│       ├── {entity}-access-query.service.ts # access control
│       ├── {entity}.types.ts        # resource types
│       ├── {entity}.module.ts       # module configuration
│       └── index.ts                 # exports
├── common/
│   ├── filters/                     # exception filters
│   ├── guards/                      # custom guards
│   ├── decorators/                  # custom decorators
│   └── interceptors/                # custom interceptors
├── config/
│   ├── database.config.ts           # database configuration
│   └── app.config.ts               # application configuration
└── main.ts                         # application bootstrap
```

### File Naming Patterns

| File Type | Pattern | Example |
|-----------|---------|---------|
| Entity | `{entity}.entity.ts` | `artist.entity.ts` |
| Interface | `{entity}.interface.ts` | `artist.interface.ts` |
| DTO | `{entity}.dto.ts` | `artist.dto.ts` |
| Exception | `{entity}.exception.ts` | `artist.exception.ts` |
| Model Service | `{entity}-model.service.ts` | `artist-model.service.ts` |
| CRUD Service | `{entity}.crud.service.ts` | `artist.crud.service.ts` |
| Controller | `{entity}.crud.controller.ts` | `artist.crud.controller.ts` |
| Adapter | `{entity}-typeorm-crud.adapter.ts` | `artist-typeorm-crud.adapter.ts` |
| Access Control | `{entity}-access-query.service.ts` | `artist-access-query.service.ts` |
| Types | `{entity}.types.ts` | `artist.types.ts` |
| Module | `{entity}.module.ts` | `artist.module.ts` |

### Import/Export Conventions

```typescript
// ✅ CORRECT - Use barrel exports via index.ts
export * from './artist.entity';
export * from './artist.interface';
export * from './artist.dto';
export * from './artist.exception';
export * from './artist-model.service';
export * from './artist-typeorm-crud.adapter';
export * from './artist.crud.service';
export * from './artist.crud.controller';
export * from './artist-access-query.service';
export * from './artist.types';
export * from './artist.module';

// ✅ CORRECT - Import from index when using external modules
import { ArtistModule, ArtistEntity } from '../artist';

// WRONG - Don't import directly from individual files
import { ArtistEntity } from '../artist/artist.entity';
```

---

## Code Structure

### Class Declaration Order

```typescript
// Standard order for all classes
import statements
↓
decorators (@Injectable, @Entity, etc.)
↓
class declaration
↓
properties (public first, then private)
↓
constructor
↓ 
public methods
↓
private methods
```

### Service Class Structure

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
  ArtistUpdatableInterface,
  ArtistModelServiceInterface,
  ArtistStatus,
} from './artist.interface';
import { ArtistCreateDto, ArtistUpdateDto } from './artist.dto';
import { 
  ArtistNotFoundException,
  ArtistNameAlreadyExistsException
} from './artist.exception';

// Constants for the module
export const ARTIST_MODULE_ARTIST_ENTITY_KEY = 'artist';

/**
 * Artist Model Service
 * 
 * Handles business logic and data access for Artist entities.
 * Implements business rules and validation.
 */
@Injectable()
export class ArtistModelService
  extends ModelService<
    ArtistEntityInterface,
    ArtistCreatableInterface,
    ArtistUpdatableInterface
  >
  implements ArtistModelServiceInterface
{
  protected createDto = ArtistCreateDto;
  protected updateDto = ArtistUpdateDto;

  constructor(
    @InjectDynamicRepository(ARTIST_MODULE_ARTIST_ENTITY_KEY)
    repo: RepositoryInterface<ArtistEntityInterface>,
  ) {
    super(repo);
  }

  // Public methods first, alphabetically ordered
  async findByName(name: string): Promise<ArtistEntityInterface | null> {
    return this.repo.findOne({ 
      where: { name } 
    });
  }

  async getActiveArtists(): Promise<ArtistEntityInterface[]> {
    return this.repo.find({
      where: { status: ArtistStatus.ACTIVE },
      order: { name: 'ASC' },
    });
  }

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

  // Override create method to add business validation
  async create(data: ArtistCreatableInterface): Promise<ArtistEntityInterface> {
    // Validate name uniqueness
    const isUnique = await this.isNameUnique(data.name);
    if (!isUnique) {
      throw new ArtistNameAlreadyExistsException({
        message: `Artist with name "${data.name}" already exists`,
      });
    }

    return super.create({ ...data, status: data.status || ArtistStatus.ACTIVE });
  }
}
```

### Controller Class Structure

```typescript
// artist.crud.controller.ts
import { ApiTags } from '@nestjs/swagger';
import {
  AccessControlCreateOne,
  AccessControlDeleteOne,
  AccessControlReadMany,
  AccessControlReadOne,
  AccessControlUpdateOne,
} from '@concepta/nestjs-access-control';
import {
  CrudBody,
  CrudController,
  CrudCreateOne,
  CrudDeleteOne,
  CrudReadMany,
  CrudReadOne,
  CrudRequest,
  CrudRequestInterface,
  CrudUpdateOne,
} from '@concepta/nestjs-crud';
import { ArtistCreateDto, ArtistUpdateDto, ArtistDto, ArtistPaginatedDto } from './artist.dto';
import { ArtistCrudService } from './artist.crud.service';
import { ArtistResource } from './artist.types';
import { ArtistEntityInterface, ArtistCreatableInterface, ArtistUpdatableInterface } from './artist.interface';

/**
 * Artist CRUD Controller
 * 
 * Provides REST API endpoints for Artist management.
 * Implements role-based access control.
 */
@CrudController({
  path: 'artists',
  model: {
    type: ArtistDto,
    paginatedType: ArtistPaginatedDto,
  },
})
@ApiTags('artists')
export class ArtistCrudController {
  constructor(private readonly artistCrudService: ArtistCrudService) {}

  // HTTP methods in REST order: GET (many), GET (one), POST, PATCH, DELETE
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

---

## TypeScript Conventions

### Type Definitions

```typescript
// ✅ CORRECT - Strong typing
export interface ArtistInterface extends CommonEntityInterface {
  name: string;
  status: ArtistStatus;
  notes?: string;
}

export interface ArtistCreatableInterface {
  name: string;
  status?: ArtistStatus;
  notes?: string;
}

// ✅ CORRECT - Enum definitions
export enum ArtistStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}

// WRONG - Never use any
export interface BadInterface {
  data: any; // DON'T DO THIS
}
```

### Generic Type Usage

```typescript
// ✅ CORRECT - ModelService extends base class
export class ArtistModelService
  extends ModelService<
    ArtistEntityInterface,
    ArtistCreatableInterface,
    ArtistUpdatableInterface
  >
  implements ArtistModelServiceInterface
{
  protected createDto = ArtistCreateDto;
  protected updateDto = ArtistUpdateDto;
  // Implementation
}

// ✅ CORRECT - Generic method signatures
async createOne<TRequest extends CrudRequestInterface<T>>(
  request: TRequest,
  dto: C,
): Promise<T> {
  // Implementation
}

// WRONG - Unconstrained generics
export class BadService<T> {
  async create(data: T): Promise<T> {
    // Too generic, no type safety
  }
}
```

### Optional vs Required Fields

```typescript
// ✅ CORRECT - Clear optional/required distinction
export interface SongInterface {
  // Required fields
  id: string;
  title: string;
  artistId: string;
  status: SongStatus;
  
  // Optional fields with ?
  albumId?: string;
  duration?: number;
  releaseDate?: Date;
  notes?: string;
}

// ✅ CORRECT - Use Partial for updates
export interface SongUpdatableInterface extends Partial<
  Pick<SongInterface, 'title' | 'albumId' | 'duration' | 'releaseDate' | 'notes'>
> {}
```

### Import Organization

```typescript
// Import order - organize by source
// 1. Node modules (third-party packages)
import { Injectable } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Repository } from 'typeorm';

// 2. @concepta packages
import { InjectDynamicRepository } from '@concepta/nestjs-typeorm-ext';
import { AccessControlReadMany } from '@concepta/nestjs-access-control';

// 3. SDK packages
import { RocketsServerUserDto } from '@bitwild/rockets-server';

// 4. Relative imports (same module)
import { ArtistEntity } from './artist.entity';
import { ArtistStatus } from './artist.interface';
import { ArtistNotFoundException } from './artist.exception';

// 5. Relative imports (other modules)
import { SongEntity } from '../song/song.entity';
import { AlbumEntity } from '../album/album.entity';
```

---

## Error Handling Standards

### Exception Hierarchy

```typescript
// ✅ CORRECT - Base exception per entity
export class ArtistException extends RuntimeException {
  constructor(options?: RuntimeExceptionOptions) {
    super(options);
    this.errorCode = 'ARTIST_ERROR';
  }
}

// ✅ CORRECT - Specific exceptions extend base
export class ArtistNotFoundException extends ArtistException {
  constructor(options?: RuntimeExceptionOptions) {
    super({
      message: 'Artist not found',
      httpStatus: HttpStatus.NOT_FOUND,
      ...options,
    });
    this.errorCode = 'ARTIST_NOT_FOUND_ERROR';
  }
}

// ✅ CORRECT - Consistent error handling pattern
async createArtist(data: CreateData): Promise<ArtistEntity> {
  try {
    // Business validation
    await this.validateArtistData(data);
    
    // Create operation
    return await this.artistRepository.save(data);
  } catch (error) {
    // Check if it's a known business exception
    if (error instanceof ArtistException) {
      throw error;
    }
    
    // Handle unexpected errors
    console.error('Unexpected error in createArtist:', error);
    throw new InternalServerErrorException('Failed to create artist', { cause: error });
  }
}
```

### Error Messages

```typescript
// ✅ CORRECT - User-friendly messages
throw new ArtistNotFoundException({
  message: 'The requested artist could not be found',
});

throw new ArtistNameAlreadyExistsException({
  message: `An artist with the name "${name}" already exists`,
});

// WRONG - Technical messages exposed to users
throw new Error('Unique constraint violation on artists.name');
```

---

## Documentation Standards

### Class Documentation

```typescript
/**
 * Artist Model Service
 * 
 * Handles business logic and data access for Artist entities.
 * Provides methods for validation, relationships, and complex queries.
 * 
 * BUSINESS RULES IMPLEMENTED:
 * - Artist names must be unique
 * - Cannot delete while referenced by songs/albums
 * - Status transitions must follow business rules
 * 
 * @example
 * ```typescript
 * const artist = await artistModelService.getArtistById('123');
 * const isUnique = await artistModelService.isNameUnique('New Artist');
 * ```
 */
@Injectable()
export class ArtistModelService
  extends ModelService<
    ArtistEntityInterface,
    ArtistCreatableInterface,
    ArtistUpdatableInterface
  >
  implements ArtistModelServiceInterface
{
  protected createDto = ArtistCreateDto;
  protected updateDto = ArtistUpdateDto;
  // Implementation
}
```

### Method Documentation

```typescript
/**
 * Check if artist name is unique
 * 
 * BUSINESS RULE: Artist names must be unique across the system
 * 
 * @param name - Artist name to check
 * @param excludeId - Optional ID to exclude from uniqueness check (for updates)
 * @returns Promise<boolean> - true if name is unique, false otherwise
 * 
 * @throws ArtistException - If database error occurs during validation
 * 
 * @example
 * ```typescript
 * const isUnique = await isNameUnique('Frank Sinatra');
 * const isUniqueForUpdate = await isNameUnique('Frank Sinatra', 'artist-id-123');
 * ```
 */
async isNameUnique(name: string, excludeId?: string): Promise<boolean> {
  // Implementation
}
```

### DTO Documentation

```typescript
export class ArtistCreateDto {
  @ApiProperty({
    description: 'Artist name - must be unique',
    example: 'Frank Sinatra',
    minLength: 1,
    maxLength: 255,
  })
  @IsString()
  @IsNotEmpty({ message: 'Artist name is required' })
  @MinLength(1, { message: 'Artist name must be at least 1 character' })
  @MaxLength(255, { message: 'Artist name cannot exceed 255 characters' })
  name!: string;

  @ApiProperty({
    description: 'Artist status',
    example: ArtistStatus.ACTIVE,
    enum: ArtistStatus,
    required: false,
  })
  @IsOptional()
  @IsEnum(ArtistStatus, { message: 'Invalid artist status' })
  status?: ArtistStatus;
}
```

---

## Naming Conventions

### Variable Naming

```typescript
// ✅ CORRECT - camelCase for variables and methods
const artistName = 'Frank Sinatra';
const isNameUnique = true;
const songDurationInSeconds = 180;

async function getArtistById(id: string): Promise<ArtistEntity> {
  // Implementation
}

// ✅ CORRECT - PascalCase for classes, interfaces, types
export class ArtistModelService {}
export interface ArtistInterface {}
export type ArtistResourceType = string;

// ✅ CORRECT - UPPER_SNAKE_CASE for constants
export const MAX_ARTIST_NAME_LENGTH = 255;
export const DEFAULT_PAGINATION_LIMIT = 20;

// ✅ CORRECT - kebab-case for file names
// artist-model.service.ts
// artist.crud.controller.ts
```

### Database Naming

```typescript
// ✅ CORRECT - Database naming conventions
@Entity('artist')        // snake_case table names
export class ArtistEntity {
  @Column({ name: 'artist_name' })  // snake_case column names
  name!: string;
  
  @JoinColumn({ name: 'artist_id' }) // snake_case foreign keys
  artist?: ArtistEntity;
}

// ✅ CORRECT - Junction table names
@JoinTable({
  name: 'song_genre',                    // entity1_entity2
  joinColumn: { name: 'song_id' },       // entity1_id
  inverseJoinColumn: { name: 'genre_id' }, // entity2_id
})
genres?: GenreEntity[];
```

---

## Code Quality Standards

### Method Length and Complexity

```typescript
// ✅ CORRECT - Methods should be focused and concise
async createArtist(dto: ArtistCreateDto): Promise<ArtistEntity> {
  await this.validateArtistCreation(dto);
  const artist = await this.saveArtist(dto);
  await this.logArtistCreation(artist);
  return artist;
}

// ✅ CORRECT - Extract complex logic into separate methods
private async validateArtistCreation(dto: ArtistCreateDto): Promise<void> {
  const isUnique = await this.isNameUnique(dto.name);
  if (!isUnique) {
    throw new ArtistNameAlreadyExistsException({
      message: `Artist with name "${dto.name}" already exists`,
    });
  }
}

// WRONG - Methods that are too long and do too much
async createArtistBadExample(dto: ArtistCreateDto): Promise<ArtistEntity> {
  // 50+ lines of validation, creation, logging, etc. - too much!
}
```

### Boolean Logic

```typescript
// ✅ CORRECT - Clear boolean expressions
const canDelete = await this.canArtistBeDeleted(artistId);
if (!canDelete) {
  throw new ArtistCannotBeDeletedException();
}

// ✅ CORRECT - Use meaningful variable names
const hasAssociatedSongs = songCount > 0;
const hasAssociatedAlbums = albumCount > 0;
const cannotBeDeleted = hasAssociatedSongs || hasAssociatedAlbums;

// WRONG - Complex nested conditions
if (!(await this.songRepository.count({ where: { artistId } })) === 0 && 
    !(await this.albumRepository.count({ where: { artistId } })) === 0) {
  // Hard to understand
}
```

---

## Testing Conventions

### Test File Structure

```typescript
// artist-model.service.spec.ts
describe('ArtistModelService', () => {
  let service: ArtistModelService;
  let repository: Repository<ArtistEntity>;

  beforeEach(async () => {
    // Setup
  });

  describe('getArtistById', () => {
    it('should return artist when found', async () => {
      // Arrange
      const artistId = 'test-id';
      const expectedArtist = createMockArtist({ id: artistId });
      jest.spyOn(repository, 'findOne').mockResolvedValue(expectedArtist);

      // Act
      const result = await service.getArtistById(artistId);

      // Assert
      expect(result).toEqual(expectedArtist);
    });

    it('should throw ArtistNotFoundException when not found', async () => {
      // Arrange
      const artistId = 'non-existent-id';
      jest.spyOn(repository, 'findOne').mockResolvedValue(null);

      // Act & Assert
      await expect(service.getArtistById(artistId)).rejects.toThrow(
        ArtistNotFoundException
      );
    });
  });
});
```

---

## Performance Guidelines

### Database Query Optimization

```typescript
// ✅ CORRECT - Select only needed fields
async getArtistSummaries(): Promise<ArtistSummary[]> {
  return await this.artistRepository
    .createQueryBuilder('artist')
    .select(['artist.id', 'artist.name', 'artist.status'])
    .getMany();
}

// ✅ CORRECT - Use appropriate indexes
@Index('idx_artist_name_status', ['name', 'status'])
@Entity('artist')
export class ArtistEntity {
  // Implementation
}

// WRONG - Loading unnecessary data
async getArtistSummaries(): Promise<ArtistEntity[]> {
  return await this.artistRepository.find({
    relations: ['songs', 'albums', 'genres'], // Unnecessary for summary
  });
}
```

### Memory Management

```typescript
// ✅ CORRECT - Use streaming for large datasets
async processLargeDataset(): Promise<void> {
  const stream = await this.artistRepository
    .createQueryBuilder('artist')
    .stream();

  stream.on('data', (artist) => {
    this.processArtist(artist);
  });
}

// ✅ CORRECT - Use pagination for large results
async getArtistsPaginated(page: number, limit: number): Promise<{
  artists: ArtistEntity[];
  total: number;
}> {
  const [artists, total] = await this.artistRepository.findAndCount({
    skip: (page - 1) * limit,
    take: limit,
  });

  return { artists, total };
}
```

---

## Security Guidelines

### Input Validation

```typescript
// ✅ CORRECT - Validate all inputs
@IsString()
@IsNotEmpty()
@MinLength(1)
@MaxLength(255)
@Matches(/^[a-zA-Z0-9\s\-'\.]+$/, {
  message: 'Artist name contains invalid characters'
})
name!: string;

// ✅ CORRECT - Sanitize database queries
async searchArtists(searchTerm: string): Promise<ArtistEntity[]> {
  return await this.artistRepository
    .createQueryBuilder('artist')
    .where('LOWER(artist.name) LIKE LOWER(:searchTerm)', { 
      searchTerm: `%${searchTerm}%` // Parameterized query
    })
    .getMany();
}

// WRONG - Raw string interpolation (SQL injection risk)
async searchArtistsBad(searchTerm: string): Promise<ArtistEntity[]> {
  return await this.artistRepository.query(
    `SELECT * FROM artist WHERE name LIKE '%${searchTerm}%'` // DANGEROUS!
  );
}
```

### Error Information Disclosure

```typescript
// ✅ CORRECT - Don't expose internal details
catch (error) {
  if (error instanceof ArtistException) {
    throw error; // Safe business exceptions
  }
  
  console.error('Internal error:', error); // Log full details internally
  throw new InternalServerErrorException('Operation failed'); // Generic message to user
}

// WRONG - Exposing internal details
catch (error) {
  throw new InternalServerErrorException(error.message); // May expose DB schema, etc.
}
```

Following these conventions ensures consistent, maintainable, and secure code across the entire project.