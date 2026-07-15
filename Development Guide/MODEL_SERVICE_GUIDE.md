# Model Service Guide

> **For AI Tools**: This guide contains the complete ModelService pattern for business logic layer. Use this when creating services that handle complex business validation and data access.

## 📋 **Quick Reference**

| Task | Section |
|------|---------|
| Create ModelService for new entity | [Basic ModelService Pattern](#basic-modelservice-pattern) |
| Add business validation methods | [Business Logic Methods](#business-logic-methods) |
| Handle entity relationships | [Relationship Methods](#relationship-methods) |
| Implement error handling | [Error Handling in ModelService](#error-handling-in-modelservice) |
| Understand injection patterns | [Dependency Injection](#dependency-injection) |

---

## Core Concepts

### What is ModelService?

**ModelService is the business logic layer** that sits between CRUD services and the database. It provides:

1. **Business Validation**: Check business rules before data operations
2. **Entity Relationships**: Handle complex queries across multiple entities
3. **Data Abstraction**: Abstract away ORM-specific operations
4. **Reusable Logic**: Share common business operations across services

### Architecture Flow

```
Controller → CRUD Service → ModelService → Repository/Database
```

**Why this pattern?**
- ✅ **ORM Agnostic**: Can switch from TypeORM to Prisma without changing business logic
- ✅ **Testable**: Business logic is isolated and easily testable
- ✅ **Reusable**: Same ModelService can be used by multiple controllers/services
- ✅ **Maintainable**: Business rules are centralized in one place

---

## Basic ModelService Pattern

### Standard Implementation

```typescript
// artist-model.service.ts
import { Injectable } from '@nestjs/common';
import {
  RepositoryInterface,
  ModelService,
  InjectDynamicRepository,
} from '@concepta/nestjs-common';
import { Like, Not } from 'typeorm';
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
}
```

---


### Custom Implementation

```typescript
// artist-model.service.ts
import { Injectable } from '@nestjs/common';
import {
  RepositoryInterface,
  ModelService,
  InjectDynamicRepository,
} from '@concepta/nestjs-common';
import { Like, Not } from 'typeorm';
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
 * Provides business logic for artist operations.
 * Extends the base ModelService and implements custom artist-specific methods.
 * 
 * BUSINESS RULES IMPLEMENTED:
 * - Artist names must be unique
 * - Cannot delete while referenced by songs/albums
 * - Status transitions must follow business rules
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
  async update(data: ArtistUpdatableInterface): Promise<ArtistEntityInterface> {
    // For this implementation, we'll need to extract the ID from the data
    const id = (data as any).id;
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

  /**
   * Get artist by ID with proper error handling
   */
  async getArtistById(id: string): Promise<ArtistEntityInterface> {
    const artist = await this.byId(id);
    
    if (!artist) {
      throw new ArtistNotFoundException({
        message: `Artist with ID ${id} not found`,
      });
    }
    
    return artist;
  }
  }

  /**
   * Deactivate an artist (soft delete by changing status)
   */
  async deactivateArtist(id: string): Promise<ArtistEntityInterface> {
    return this.update({ id, status: ArtistStatus.INACTIVE } as ArtistUpdatableInterface);
  }

  /**
   * Activate an artist
   */
  async activateArtist(id: string): Promise<ArtistEntityInterface> {
    return this.update({ id, status: ArtistStatus.ACTIVE } as ArtistUpdatableInterface);
  }
}
```

---


## Dependency Injection

### Critical Pattern: @InjectDynamicRepository

**Always use `@InjectDynamicRepository` for ModelServices:**

```typescript
// ✅ CORRECT - ModelService pattern
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
}
```

**Why not `@InjectRepository`?**

```typescript
// WRONG - Don't use standard injection in ModelServices
@Injectable()
export class ArtistModelService {
  constructor(
    @InjectRepository(ArtistEntity)  // This is for CRUD adapters only
    private readonly artistRepository: Repository<ArtistEntity>,
  ) {}
}
```

**WRONG - Old Pattern Without Extending ModelService**

```typescript
// Don't create ModelServices that don't extend the base ModelService
@Injectable()
export class ArtistModelService {
  constructor(
    @InjectDynamicRepository('artist')
    private readonly artistRepository: Repository<ArtistEntity>,
  ) {}
  
  // Custom methods only - missing base CRUD operations
}
```

### Module Setup Required

For `@InjectDynamicRepository` to work, you need **both** TypeORM imports:

```typescript
// artist.module.ts
@Module({
  imports: [
    // Standard TypeORM - for CRUD adapters
    TypeOrmModule.forFeature([ArtistEntity]),
    
    // Extended TypeORM - for ModelServices (REQUIRED!)
    TypeOrmExtModule.forFeature({
      artist: { entity: ArtistEntity },  // This creates the dynamic token
    }),
  ],
  providers: [
    ArtistModelService,  // Uses @InjectDynamicRepository('artist')
    ArtistTypeOrmCrudAdapter,  // Uses @InjectRepository(ArtistEntity)
  ],
})
export class ArtistModule {}
```

---

## Business Logic Methods

### Validation Methods

```typescript
export class SongModelService {
  /**
   * Validate ISRC code format
   * BUSINESS RULE: ISRC must follow international standard format
   */
  async validateISRC(isrc: string): Promise<boolean> {
    const isrcPattern = /^[A-Z]{2}[A-Z0-9]{3}\d{2}\d{5}$/;
    return isrcPattern.test(isrc.toUpperCase());
  }

  /**
   * Check if ISRC is unique
   * BUSINESS RULE: ISRC codes must be globally unique
   */
  async isISRCUnique(isrc: string, excludeId?: string): Promise<boolean> {
    const query = this.songRepository
      .createQueryBuilder('song')
      .where('UPPER(song.isrc) = UPPER(:isrc)', { isrc });

    if (excludeId) {
      query.andWhere('song.id != :excludeId', { excludeId });
    }

    const existingSong = await query.getOne();
    return !existingSong;
  }

  /**
   * Validate BPM range
   * BUSINESS RULE: BPM must be between 60-200
   */
  async validateBPM(bpm: number): Promise<boolean> {
    return bpm >= 60 && bpm <= 200;
  }

  /**
   * Validate release date
   * BUSINESS RULE: Release date cannot be in the future
   */
  async validateReleaseDate(releaseDate: Date): Promise<boolean> {
    return releaseDate <= new Date();
  }
}
```

### Status Management

```typescript
export class ArtistModelService {
  /**
   * Check if status transition is allowed
   * BUSINESS RULE: Define allowed status transitions
   */
  async canTransitionStatus(
    currentStatus: ArtistStatus, 
    newStatus: ArtistStatus
  ): Promise<boolean> {
    const allowedTransitions = {
      [ArtistStatus.ACTIVE]: [ArtistStatus.INACTIVE],
      [ArtistStatus.INACTIVE]: [ArtistStatus.ACTIVE],
      [ArtistStatus.PENDING]: [ArtistStatus.ACTIVE, ArtistStatus.INACTIVE],
    };

    return allowedTransitions[currentStatus]?.includes(newStatus) ?? false;
  }

  /**
   * Update artist status with validation
   */
  async updateStatus(id: string, newStatus: ArtistStatus): Promise<ArtistEntity> {
    const artist = await this.getArtistById(id);
    
    const canTransition = await this.canTransitionStatus(artist.status, newStatus);
    if (!canTransition) {
      throw new ArtistInvalidStatusTransitionException({
        message: `Cannot transition from ${artist.status} to ${newStatus}`,
      });
    }
    
    await this.artistRepository.update(
      { id },
      { status: newStatus }
    );
    
    return await this.getArtistById(id);
  }
}
```

---

## Relationship Methods

### Loading Related Entities

```typescript
export class SongModelService {
  /**
   * Get song with all relationships loaded
   */
  async getSongWithRelations(id: string): Promise<SongEntity> {
    const song = await this.songRepository
      .createQueryBuilder('song')
      .leftJoinAndSelect('song.artist', 'artist')
      .leftJoinAndSelect('song.album', 'album')
      .leftJoinAndSelect('song.genres', 'genre')
      .leftJoinAndSelect('song.writers', 'writer')
      .where('song.id = :id', { id })
      .getOne();

    if (!song) {
      throw new SongNotFoundException({
        message: `Song with ID ${id} not found`,
      });
    }

    return song;
  }

  /**
   * Get songs by artist
   */
  async getSongsByArtist(artistId: string): Promise<SongEntity[]> {
    return await this.songRepository.find({
      where: { artistId },
      relations: ['album', 'genres'],
      order: { releaseDate: 'DESC' },
    });
  }

  /**
   * Check if user is assigned to song (for ImprintArtist role)
   */
  async isUserAssignedToSong(userId: string, songId: string): Promise<boolean> {
    // TODO: Implement when song assignment logic is defined
    // This might check a junction table or a field on the song entity
    
    const song = await this.songRepository
      .createQueryBuilder('song')
      .where('song.id = :songId', { songId })
      .andWhere('song.assignedUserId = :userId', { userId })  // Example field
      .getOne();

    return !!song;
  }

  /**
   * Get assigned song IDs for a user (for filtering)
   */
  async getAssignedSongIds(userId: string): Promise<string[]> {
    const songs = await this.songRepository
      .createQueryBuilder('song')
      .select('song.id')
      .where('song.assignedUserId = :userId', { userId })
      .getMany();

    return songs.map(song => song.id);
  }
}
```

### Complex Queries

```typescript
export class PlaylistModelService {
  /**
   * Get playlist with song count and duration
   */
  async getPlaylistStats(playlistId: string): Promise<{
    playlist: PlaylistEntity;
    songCount: number;
    totalDuration: number;
  }> {
    const playlist = await this.playlistRepository.findOne({ 
      where: { id: playlistId } as any,
      relations: ['songs']
    });

    if (!playlist) {
      throw new PlaylistNotFoundException({
        message: `Playlist with ID ${playlistId} not found`,
      });
    }

    const songCount = playlist.songs?.length || 0;
    const totalDuration = playlist.songs?.reduce((sum, song) => sum + (song.duration || 0), 0) || 0;

    return {
      playlist,
      songCount,
      totalDuration,
    };
  }

  /**
   * Search playlists with filters
   */
  async searchPlaylists(filters: {
    name?: string;
    genreId?: string;
    createdBy?: string;
    isPublic?: boolean;
  }): Promise<PlaylistEntity[]> {
    const query = this.playlistRepository.createQueryBuilder('playlist');

    if (filters.name) {
      query.andWhere('LOWER(playlist.name) LIKE LOWER(:name)', { 
        name: `%${filters.name}%` 
      });
    }

    if (filters.createdBy) {
      query.andWhere('playlist.createdBy = :createdBy', { 
        createdBy: filters.createdBy 
      });
    }

    if (filters.isPublic !== undefined) {
      query.andWhere('playlist.isPublic = :isPublic', { 
        isPublic: filters.isPublic 
      });
    }

    if (filters.genreId) {
      query.innerJoin('playlist.songs', 'song')
           .innerJoin('song.genres', 'genre')
           .andWhere('genre.id = :genreId', { genreId: filters.genreId });
    }

    return await query.getMany();
  }
}
```

---

## Error Handling in ModelService

### When to Throw vs Return Null

```typescript
export class ArtistModelService {
  /**
   * Use this pattern when you EXPECT the entity to exist
   * Throws exception if not found - for required operations
   */
  async getArtistById(id: string): Promise<ArtistEntity> {
    const artist = await this.artistRepository.findOne({ where: { id } as any });
    
    if (!artist) {
      throw new ArtistNotFoundException({
        message: `Artist with ID ${id} not found`,
      });
    }
    
    return artist;
  }

  /**
   * Use this pattern when the entity might not exist
   * Returns null if not found - for optional operations
   */
  async findArtistById(id: string): Promise<ArtistEntity | null> {
    return await this.artistRepository.findOne({ where: { id } as any });
  }

  /**
   * Business validation method - throws specific exceptions
   */
  async validateArtistForUpdate(id: string, name: string): Promise<void> {
    // Check if artist exists
    const artist = await this.findArtistById(id);
    if (!artist) {
      throw new ArtistNotFoundException({
        message: `Artist with ID ${id} not found`,
      });
    }

    // Check name uniqueness
    if (name !== artist.name) {
      const isUnique = await this.isNameUnique(name, id);
      if (!isUnique) {
        throw new ArtistNameAlreadyExistsException({
          message: `Artist with name "${name}" already exists`,
        });
      }
    }
  }
}
```

### Error Propagation

```typescript
// ModelService methods should let business exceptions bubble up
export class SongModelService {
  async createSong(data: SongCreateData): Promise<SongEntity> {
    try {
      // Business validations - these throw specific exceptions
      await this.validateISRC(data.isrc);
      await this.validateArtistExists(data.artistId);
      
      // Database operation
      const song = this.songRepository.create(data);
      return await this.songRepository.save(song);
    } catch (error) {
      // Re-throw business exceptions as-is
      if (error instanceof SongException) {
        throw error;
      }
      
      // Log and wrap unexpected errors
      console.error('Unexpected error in createSong:', error);
      throw error; // Let CRUD service handle wrapping
    }
  }
  
  private async validateISRC(isrc: string): Promise<void> {
    const isValid = await this.validateISRCFormat(isrc);
    if (!isValid) {
      throw new SongInvalidISRCException({
        message: `Invalid ISRC format: ${isrc}`,
      });
    }
    
    const isUnique = await this.isISRCUnique(isrc);
    if (!isUnique) {
      throw new SongISRCAlreadyExistsException({
        message: `ISRC ${isrc} already exists`,
      });
    }
  }
}
```

---

## Advanced Patterns

### Transaction Support

```typescript
export class SongModelService {
  /**
   * Create song with related entities in transaction
   */
  async createSongWithRelations(
    songData: SongCreateData,
    genreIds: string[],
    writerIds: string[]
  ): Promise<SongEntity> {
    return await this.songRepository.manager.transaction(async (manager) => {
      // Create song
      const song = manager.create(SongEntity, songData);
      const savedSong = await manager.save(song);

      // Add genre relationships
      if (genreIds.length > 0) {
        const genres = await manager.findByIds(GenreEntity, genreIds);
        savedSong.genres = genres;
        await manager.save(savedSong);
      }

      // Add writer relationships
      if (writerIds.length > 0) {
        const writers = await manager.findByIds(WriterEntity, writerIds);
        savedSong.writers = writers;
        await manager.save(savedSong);
      }

      return savedSong;
    });
  }
}
```

### Batch Operations

```typescript
export class ArtistModelService {
  /**
   * Bulk validate artist names for batch creation
   */
  async validateNamesForBulkCreate(names: string[]): Promise<string[]> {
    const duplicates: string[] = [];
    
    for (const name of names) {
      const isUnique = await this.isNameUnique(name);
      if (!isUnique) {
        duplicates.push(name);
      }
    }
    
    return duplicates;
  }

  /**
   * Bulk create artists with validation
   */
  async bulkCreateArtists(artistsData: ArtistCreateData[]): Promise<ArtistEntity[]> {
    // Validate all names first
    const names = artistsData.map(data => data.name);
    const duplicates = await this.validateNamesForBulkCreate(names);
    
    if (duplicates.length > 0) {
      throw new ArtistBulkValidationException({
        message: `Duplicate artist names found: ${duplicates.join(', ')}`,
      });
    }
    
    // Create all artists
    const artists = this.artistRepository.create(artistsData);
    return await this.artistRepository.save(artists);
  }
}
```

---

## Best Practices:

- **ALWAYS extend ModelService base class**: Every ModelService must extend the base class for consistent CRUD operations
- **USE @InjectDynamicRepository**: Always use @InjectDynamicRepository for ModelServices to get proper dependency injection
- **IMPLEMENT service interface**: Always implement a service interface to define your contract and ensure type safety
- **SET protected DTOs**: Define createDto and updateDto properties to enable validation and type checking
- **CALL super() methods**: Use super.create(), super.update() after validation to leverage base CRUD functionality
- **FOLLOW consistent patterns**: All ModelServices should follow the same pattern for maintainability and consistency

**This pattern ensures consistent business logic, type safety, and maintainability across your entire application.**