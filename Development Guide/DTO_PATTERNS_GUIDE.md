# DTO Patterns Guide

> **For AI Tools**: This guide contains all DTO creation patterns and validation strategies. Use this when building API contracts and validation schemas.

## 📋 **Quick Reference**

| Task | Section |
|------|---------|
| Create main entity DTO | [Base DTO Pattern](#base-dto-pattern) |
| Create/Update DTOs | [CRUD DTO Patterns](#crud-dto-patterns) |
| Add validation decorators | [Validation Patterns](#validation-patterns) |
| Paginated responses | [Pagination DTOs](#pagination-dtos) |

---

## Base DTO Pattern

### Main Entity DTO Structure

All entity DTOs should follow this pattern:

```typescript
// artist.dto.ts
import { Exclude, Expose, Type } from 'class-transformer';
import {
  IsString,
  IsEnum,
  IsOptional,
  MaxLength,
  MinLength,
  IsNotEmpty,
  IsUUID,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { CommonEntityDto } from '@concepta/nestjs-common';

/**
 * Main Entity DTO
 * Used for API responses showing entity data
 */
@Exclude() // Exclude all properties by default
export class EntityDto extends CommonEntityDto implements EntityInterface {
  @Expose() // Explicitly expose needed properties
  @ApiProperty({
    description: 'Entity name',
    example: 'Example Name',
    maxLength: 255,
    minLength: 1,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(1, { message: 'Name must be at least 1 character' })
  @MaxLength(255, { message: 'Name cannot exceed 255 characters' })
  name!: string;

  @Expose()
  @ApiProperty({
    description: 'Entity status',
    example: EntityStatus.ACTIVE,
    enum: EntityStatus,
  })
  @IsEnum(EntityStatus)
  status!: EntityStatus;

  @Expose()
  @ApiProperty({
    description: 'Optional notes',
    example: 'Additional information',
    required: false,
  })
  @IsOptional()
  @IsString()
  notes?: string;
}
```

### Key Points:

✅ **Extend CommonEntityDto**: Provides `id`, `dateCreated`, `dateUpdated`  
✅ **Use @Exclude()**: Start with exclusion, explicitly expose needed fields  
✅ **Implement Interface**: Ensure type safety with business interface  
✅ **ApiProperty**: Complete Swagger documentation for each field  
✅ **Validation Decorators**: Both class-validator and custom messages  

---

## CRUD DTO Patterns

### Create DTO

```typescript
/**
 * Entity Create DTO
 * Used for creating new entities
 */
export class EntityCreateDto 
  extends PickType(EntityDto, ['name'] as const) 
  implements EntityCreatableInterface {
  
  @ApiProperty({
    description: 'Entity status',
    example: EntityStatus.ACTIVE,
    enum: EntityStatus,
    required: false,
  })
  @IsOptional()
  @IsEnum(EntityStatus)
  status?: EntityStatus;

  @ApiProperty({
    description: 'Optional notes',
    example: 'Additional information',
    required: false,
  })
  @IsOptional()
  @IsString()
  notes?: string;
}
```

### Create Many DTO

```typescript
/**
 * Entity Create Many DTO
 * Used for bulk creation operations
 */
export class EntityCreateManyDto {
  @ApiProperty({
    type: [EntityCreateDto],
    description: 'Array of entities to create',
  })
  @Type(() => EntityCreateDto)
  bulk!: EntityCreateDto[];
}
```

### Update DTO

```typescript
/**
 * Entity Update DTO
 * Used for updating existing entities
 */
export class EntityUpdateDto 
  extends PickType(EntityDto, ['id'] as const) 
  implements EntityUpdatableInterface {
  
  // Override all fields as optional for updates
  @ApiProperty({
    description: 'Entity name',
    example: 'Updated Name',
    required: false,
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255, { message: 'Name cannot exceed 255 characters' })
  name?: string;

  @ApiProperty({
    description: 'Entity status',
    enum: EntityStatus,
    required: false,
  })
  @IsOptional()
  @IsEnum(EntityStatus)
  status?: EntityStatus;

  @ApiProperty({
    description: 'Optional notes',
    example: 'Additional information',
    required: false,
  })
  @IsOptional()
  @IsString()
  notes?: string;
}
```

### Alternative Update Pattern (Manual)

For more control over update fields:

```typescript
/**
 * Entity Update DTO - Manual Implementation
 * Use when you need different validation rules for updates
 */
export class EntityUpdateDto implements EntityUpdatableInterface {
  @ApiProperty({
    description: 'Entity name - must be unique within context',
    example: 'Updated Name',
    maxLength: 100,
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @ApiProperty({
    description: 'Entity status',
    example: EntityStatus.ACTIVE,
    enum: EntityStatus,
    required: false,
  })
  @IsOptional()
  @IsEnum(EntityStatus)
  status?: EntityStatus;
}
```

---

## Validation Patterns

### String Validation

```typescript
// Required string with length constraints
@ApiProperty({
  description: 'Required name field',
  example: 'Example Name',
  maxLength: 255,
  minLength: 1,
})
@IsString()
@IsNotEmpty()
@MinLength(1, { message: 'Name must be at least 1 character' })
@MaxLength(255, { message: 'Name cannot exceed 255 characters' })
name!: string;

// Optional string
@ApiProperty({
  description: 'Optional description',
  example: 'Some description',
  required: false,
})
@IsOptional()
@IsString()
description?: string;
```

### UUID Validation

```typescript
// Required UUID (for foreign keys)
@ApiProperty({
  description: 'Parent entity ID (UUID)',
  example: '123e4567-e89b-12d3-a456-426614174000',
  format: 'uuid',
})
@IsUUID('4')
parentId!: string;

// Optional UUID
@ApiProperty({
  description: 'Optional parent ID',
  example: '123e4567-e89b-12d3-a456-426614174000',
  format: 'uuid',
  required: false,
})
@IsOptional()
@IsUUID('4')
parentId?: string;
```

### Enum Validation

```typescript
// Required enum
@ApiProperty({
  description: 'Entity status',
  example: EntityStatus.ACTIVE,
  enum: EntityStatus,
})
@IsEnum(EntityStatus)
status!: EntityStatus;

// Optional enum with default
@ApiProperty({
  description: 'Entity status',
  example: EntityStatus.ACTIVE,
  enum: EntityStatus,
  required: false,
})
@IsOptional()
@IsEnum(EntityStatus)
status?: EntityStatus;
```

### Number Validation

```typescript
// Integer with range
@ApiProperty({
  description: 'BPM (Beats Per Minute)',
  example: 120,
  minimum: 60,
  maximum: 200,
})
@IsInt()
@Min(60, { message: 'BPM must be at least 60' })
@Max(200, { message: 'BPM cannot exceed 200' })
bpm!: number;

// Optional decimal
@ApiProperty({
  description: 'Rating score',
  example: 4.5,
  minimum: 0,
  maximum: 5,
  required: false,
})
@IsOptional()
@IsNumber({ maxDecimalPlaces: 2 })
@Min(0)
@Max(5)
rating?: number;
```

### Date Validation

```typescript
// Date validation
@ApiProperty({
  description: 'Release date',
  example: '2023-12-01',
  format: 'date',
})
@IsDateString()
@IsNotFutureDate({ message: 'Release date cannot be in the future' })
releaseDate!: string;
```

### Array Validation

```typescript
// Array of strings
@ApiProperty({
  description: 'List of tags',
  example: ['rock', 'classic'],
  type: [String],
})
@IsArray()
@IsString({ each: true })
@ArrayMinSize(1, { message: 'At least one tag is required' })
tags!: string[];

// Array of UUIDs
@ApiProperty({
  description: 'List of writer IDs',
  example: ['123e4567-e89b-12d3-a456-426614174000'],
  type: [String],
})
@IsArray()
@IsUUID('4', { each: true })
writerIds!: string[];
```

---

## Pagination DTOs

### Standard Pagination

```typescript
/**
 * Paginated Entity DTO for list responses
 */
export class EntityPaginatedDto extends CrudResponsePaginatedDto<EntityDto> {
  @ApiProperty({
    type: [EntityDto],
    description: 'Array of entities',
  })
  data!: EntityDto[];
}
```

### Custom Pagination with Meta

```typescript
/**
 * Custom Paginated Response
 */
export class CustomPaginatedDto<T> {
  @ApiProperty({ description: 'Response data array' })
  data!: T[];

  @ApiProperty({ description: 'Total count of items' })
  total!: number;

  @ApiProperty({ description: 'Current page' })
  page!: number;

  @ApiProperty({ description: 'Items per page' })
  limit!: number;

  @ApiProperty({ description: 'Total pages' })
  pages!: number;

  @ApiProperty({ description: 'Has next page' })
  hasNext!: boolean;

  @ApiProperty({ description: 'Has previous page' })
  hasPrevious!: boolean;
}
```

---

## Search and Filter DTOs

### Basic Search DTO

```typescript
/**
 * Entity Search DTO for filtering
 */
export class EntitySearchDto {
  @ApiProperty({
    description: 'Search by entity name (partial match)',
    example: 'search term',
    required: false,
  })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({
    description: 'Filter by entity status',
    example: EntityStatus.ACTIVE,
    enum: EntityStatus,
    required: false,
  })
  @IsOptional()
  @IsEnum(EntityStatus)
  status?: EntityStatus;

  @ApiProperty({
    description: 'Filter by parent entity ID',
    format: 'uuid',
    required: false,
  })
  @IsOptional()
  @IsUUID('4')
  parentId?: string;
}
```

### Advanced Search with Dates

```typescript
/**
 * Advanced Search DTO with date ranges
 */
export class AdvancedSearchDto {
  @ApiProperty({
    description: 'Search term',
    example: 'rock music',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiProperty({
    description: 'Created after date',
    example: '2023-01-01',
    format: 'date',
    required: false,
  })
  @IsOptional()
  @IsDateString()
  createdAfter?: string;

  @ApiProperty({
    description: 'Created before date',
    example: '2023-12-31',
    format: 'date',
    required: false,
  })
  @IsOptional()
  @IsDateString()
  createdBefore?: string;

  @ApiProperty({
    description: 'Sort field',
    example: 'name',
    required: false,
  })
  @IsOptional()
  @IsString()
  sortBy?: string;

  @ApiProperty({
    description: 'Sort order',
    example: 'ASC',
    enum: ['ASC', 'DESC'],
    required: false,
  })
  @IsOptional()
  @IsEnum(['ASC', 'DESC'])
  sortOrder?: 'ASC' | 'DESC';
}
```

---

## DTO Composition Utilities

### PickType Usage

```typescript
// Pick specific fields from base DTO
export class EntityCreateDto extends PickType(EntityDto, [
  'name',
  'status',
  'notes'
] as const) {}
```

### OmitType Usage

```typescript
// Omit fields from base DTO (useful for updates)
export class EntityUpdateDto extends OmitType(EntityDto, [
  'id',
  'dateCreated',
  'dateUpdated'
] as const) {}
```

### PartialType Usage

```typescript
// Make all fields optional
export class EntityPartialUpdateDto extends PartialType(EntityDto) {}
```

### IntersectionType Usage

```typescript
// Combine multiple DTOs
export class EntityWithMetaDto extends IntersectionType(
  EntityDto,
  EntityMetaDto,
) {}
```

---

## Nested DTO Patterns

### File Upload DTO

```typescript
/**
 * File Upload DTO
 */
export class FileUploadDto {
  @ApiProperty({
    description: 'File type',
    enum: ['MP3', 'WAV'],
  })
  @IsEnum(['MP3', 'WAV'])
  fileType!: string;

  @ApiProperty({
    description: 'File size in bytes',
    example: 5242880,
  })
  @IsInt()
  @Max(10485760, { message: 'File size cannot exceed 10MB' })
  fileSize!: number;

  @ApiProperty({
    description: 'File name',
    example: 'song.mp3',
  })
  @IsString()
  @MaxLength(255)
  fileName!: string;

  @ApiProperty({
    description: 'File buffer',
    type: 'string',
    format: 'binary',
  })
  file!: Buffer;
}
```

### Complex Nested DTO

```typescript
/**
 * Song with full details DTO
 */
export class SongDetailDto extends SongDto {
  @Expose()
  @ApiProperty({
    description: 'Song characteristics',
    type: () => SongCharacteristicsDto,
    required: false,
  })
  @IsOptional()
  @Type(() => SongCharacteristicsDto)
  characteristics?: SongCharacteristicsDto;

  @Expose()
  @ApiProperty({
    description: 'Copyright information',
    type: () => SongCopyrightDto,
    required: false,
  })
  @IsOptional()
  @Type(() => SongCopyrightDto)
  copyright?: SongCopyrightDto;

  @Expose()
  @ApiProperty({
    description: 'Source information',
    type: () => SongSourceDto,
    required: false,
  })
  @IsOptional()
  @Type(() => SongSourceDto)
  source?: SongSourceDto;
}
```

---

## Template for New Entity DTOs

Use this template when creating DTOs for new entities:

```typescript
// {entity}.dto.ts
import { Exclude, Expose, Type } from 'class-transformer';
import {
  IsString,
  IsEnum,
  IsOptional,
  MaxLength,
  IsUUID,
  IsNotEmpty,
} from 'class-validator';
import { ApiProperty, PickType } from '@nestjs/swagger';
import { CommonEntityDto } from '@concepta/nestjs-common';
import { CrudResponsePaginatedDto } from '@concepta/nestjs-crud';
import {
  {Entity}Interface,
  {Entity}CreatableInterface,
  {Entity}UpdatableInterface,
  {Entity}Status,
} from './{entity}.interface';

/**
 * Base {Entity} DTO
 */
@Exclude()
export class {Entity}Dto extends CommonEntityDto implements {Entity}Interface {
  @Expose()
  @ApiProperty({
    description: '{Entity} name',
    example: 'Example {Entity}',
    maxLength: 255,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name!: string;

  @Expose()
  @ApiProperty({
    description: '{Entity} status',
    example: {Entity}Status.ACTIVE,
    enum: {Entity}Status,
  })
  @IsEnum({Entity}Status)
  status!: {Entity}Status;

  // Add other entity-specific fields here
}

/**
 * {Entity} Create DTO
 */
export class {Entity}CreateDto 
  extends PickType({Entity}Dto, ['name'] as const) 
  implements {Entity}CreatableInterface {
  
  @ApiProperty({
    description: '{Entity} status',
    example: {Entity}Status.ACTIVE,
    enum: {Entity}Status,
    required: false,
  })
  @IsOptional()
  @IsEnum({Entity}Status)
  status?: {Entity}Status;
}

/**
 * {Entity} Update DTO
 */
export class {Entity}UpdateDto 
  extends PickType({Entity}Dto, ['id'] as const) 
  implements {Entity}UpdatableInterface {
  
  @ApiProperty({
    description: '{Entity} name',
    example: 'Updated {Entity}',
    required: false,
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255, { message: '{Entity} name cannot exceed 255 characters' })
  name?: string;

  @ApiProperty({
    description: '{Entity} status',
    enum: {Entity}Status,
    required: false,
  })
  @IsOptional()
  @IsEnum({Entity}Status)
  status?: {Entity}Status;
}

/**
 * Paginated {Entity} DTO
 */
export class {Entity}PaginatedDto extends CrudResponsePaginatedDto<{Entity}Dto> {
  @ApiProperty({
    type: [{Entity}Dto],
    description: 'Array of {entity}s',
  })
  data!: {Entity}Dto[];
}
```

### Replacement Guide:

| Placeholder | Example | Usage |
|-------------|---------|-------|
| `{Entity}` | `Artist` | PascalCase class names |
| `{entity}` | `artist` | Lowercase for descriptions |
| `{ENTITY}` | `ARTIST` | Uppercase for constants |

---

## Best Practices

### ✅ Do:

- **Extend CommonEntityDto**: Provides standard fields (`id`, timestamps)
- **Use @Exclude()/@Expose()**: Explicit control over serialization
- **Implement Interfaces**: Ensure type safety with business interfaces
- **Complete ApiProperty**: Include examples, descriptions, constraints
- **Validation Messages**: Provide clear, user-friendly error messages
- **Use PickType/OmitType**: Leverage composition over duplication
- **Optional Relationships**: Mark relationship DTOs as optional

### Best Practices:

- **Protect sensitive data**: Use @Exclude() for passwords, internal IDs, and sensitive fields
- **Validate everything**: Always include appropriate validation decorators for type safety
- **Use proper types**: Avoid `any` type - use specific interfaces and types instead
- **Handle nested objects**: Use @Type() decorators for proper nested object serialization
- **Keep DTOs focused**: DTOs should only handle data transfer, not business logic
- **Document thoroughly**: Include complete @ApiProperty descriptions and examples
- **Resolve circular dependencies**: Use proper relationship patterns to avoid circular reference issues

This pattern ensures consistent, well-documented, and properly validated DTOs across your entire application.