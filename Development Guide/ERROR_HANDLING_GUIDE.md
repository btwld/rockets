# Error Handling Guide

> **For AI Tools**: This guide contains all exception handling patterns and error management strategies. Use this when implementing proper error handling in your modules.

## 📋 **Quick Reference**

| Task | Section |
|------|---------|
| Create base exception for entity | [Base Exception Pattern](#base-exception-pattern) |
| Add specific business exceptions | [Exception Templates](#exception-templates) |
| Handle errors in CRUD services | [CRUD Service Error Handling](#crud-service-error-handling) |
| Proper error flow control | [Error Flow Patterns](#error-flow-patterns) |

---

## Exception Hierarchy

### Base Exception Pattern

All module-specific exceptions should extend from a base entity exception:

```typescript
// artist.exception.ts
import { HttpStatus } from '@nestjs/common';
import { RuntimeException, RuntimeExceptionOptions } from '@concepta/nestjs-common';

/**
 * Base Artist Exception
 * All artist-related exceptions should extend from this class
 * This enables proper error handling in CRUD services
 */
export class ArtistException extends RuntimeException {
  constructor(options?: RuntimeExceptionOptions) {
    super(options);
    this.errorCode = 'ARTIST_ERROR';
  }
}

/**
 * Artist Not Found Exception
 * Thrown when an artist cannot be found by ID or other criteria
 */
export class ArtistNotFoundException extends ArtistException {
  constructor(options?: RuntimeExceptionOptions) {
    super({
      message: 'The artist was not found',
      httpStatus: HttpStatus.NOT_FOUND,
      ...options,
    });
    this.errorCode = 'ARTIST_NOT_FOUND_ERROR';
  }
}

/**
 * Artist Name Already Exists Exception
 * Thrown when attempting to create or update an artist with a name that already exists
 */
export class ArtistNameAlreadyExistsException extends ArtistException {
  constructor(options?: RuntimeExceptionOptions) {
    super({
      message: 'An artist with this name already exists',
      httpStatus: HttpStatus.CONFLICT,
      ...options,
    });
    this.errorCode = 'ARTIST_NAME_ALREADY_EXISTS_ERROR';
  }
}

/**
 * Artist Cannot Be Deleted Exception
 * Thrown when attempting to delete an artist that has associated records
 */
export class ArtistCannotBeDeletedException extends ArtistException {
  constructor(options?: RuntimeExceptionOptions) {
    super({
      message: 'Cannot delete artist because it has associated records',
      httpStatus: HttpStatus.CONFLICT,
      ...options,
    });
    this.errorCode = 'ARTIST_CANNOT_BE_DELETED_ERROR';
  }
}
```

---

## Exception Templates

### Template for Any Entity

Use this template for creating exceptions for any entity:

```typescript
// {entity}.exception.ts
import { HttpStatus } from '@nestjs/common';
import { RuntimeException, RuntimeExceptionOptions } from '@concepta/nestjs-common';

/**
 * Base {Entity} Exception
 * All {entity}-related exceptions should extend from this class
 */
export class {Entity}Exception extends RuntimeException {
  constructor(options?: RuntimeExceptionOptions) {
    super(options);
    this.errorCode = '{ENTITY}_ERROR';
  }
}

/**
 * {Entity} Not Found Exception
 */
export class {Entity}NotFoundException extends {Entity}Exception {
  constructor(options?: RuntimeExceptionOptions) {
    super({
      message: 'The {entity} was not found',
      httpStatus: HttpStatus.NOT_FOUND,
      ...options,
    });
    this.errorCode = '{ENTITY}_NOT_FOUND_ERROR';
  }
}

/**
 * {Entity} Name Already Exists Exception (if applicable)
 */
export class {Entity}NameAlreadyExistsException extends {Entity}Exception {
  constructor(options?: RuntimeExceptionOptions) {
    super({
      message: 'A {entity} with this name already exists',
      httpStatus: HttpStatus.CONFLICT,
      ...options,
    });
    this.errorCode = '{ENTITY}_NAME_ALREADY_EXISTS_ERROR';
  }
}

/**
 * {Entity} Cannot Be Deleted Exception
 */
export class {Entity}CannotBeDeletedException extends {Entity}Exception {
  constructor(options?: RuntimeExceptionOptions) {
    super({
      message: 'Cannot delete {entity} because it has associated records',
      httpStatus: HttpStatus.CONFLICT,
      ...options,
    });
    this.errorCode = '{ENTITY}_CANNOT_BE_DELETED_ERROR';
  }
}

/**
 * {Entity} Invalid Status Exception (if entity has status)
 */
export class {Entity}InvalidStatusException extends {Entity}Exception {
  constructor(options?: RuntimeExceptionOptions) {
    super({
      message: 'Invalid {entity} status provided',
      httpStatus: HttpStatus.BAD_REQUEST,
      ...options,
    });
    this.errorCode = '{ENTITY}_INVALID_STATUS_ERROR';
  }
}
```

### Replacement Guide:

| Placeholder | Example | Usage |
|-------------|---------|--------|
| `{Entity}` | `Artist` | PascalCase class names |
| `{entity}` | `artist` | Lowercase for messages |
| `{ENTITY}` | `ARTIST` | Uppercase for error codes |

---

## CRUD Service Error Handling

### Standard Error Handling Pattern

**Always use this pattern in CRUD service methods:**

```typescript
// In your CRUD service methods
async createOne(req, dto: EntityCreateDto, options) {
  try {
    // Business validation
    const isValid = await this.entityModelService.validateSomething(dto.field);
    if (!isValid) {
      throw new EntityValidationException({
        message: `Validation failed for field: ${dto.field}`,
      });
    }

    // Business logic
    const result = await super.createOne(req, dto, options);
    console.log(`Entity created: ${result.name}`);
    return result;
  } catch (error) {
    // Check if it's a known entity exception
    if (error instanceof EntityException) {
      throw error; // Let known business exceptions bubble up with proper HTTP status
    }
    
    // Handle unexpected errors
    console.error('Unexpected error in entity createOne:', error);
    throw new EntityException({
      message: 'Failed to create entity',
      originalError: error
    });
  }
}

async updateOne(req, dto: EntityUpdateDto, options) {
  try {
    // Business logic here
    const result = await super.updateOne(req, dto, options);
    return result;
  } catch (error) {
    if (error instanceof EntityException) {
      throw error;
    }
    console.error('Unexpected error in entity updateOne:', error);
    throw new EntityException({
      message: 'Failed to update entity',
      originalError: error
    });
  }
}

async deleteOne(req, options) {
  try {
    // Business logic here
    const result = await super.deleteOne(req, options);
    return result;
  } catch (error) {
    if (error instanceof EntityException) {
      throw error;
    }
    console.error('Unexpected error in entity deleteOne:', error);
    throw new EntityException({
      message: 'Failed to delete entity',
      originalError: error
    });
  }
}
```

### Complete Service Example

```typescript
// artist.crud.service.ts
import { Inject, Injectable, InternalServerErrorException } from '@nestjs/common';
import { CrudService } from '@concepta/nestjs-crud';
import { CrudRequestInterface } from '@concepta/nestjs-crud';
import { ArtistEntityInterface, ArtistStatus } from './artist.interface';
import { ArtistTypeOrmCrudAdapter } from './artist-typeorm-crud.adapter';
import { ArtistModelService } from './artist-model.service';
import { ArtistCreateDto, ArtistUpdateDto } from './artist.dto';
import { 
  ArtistException, 
  ArtistNotFoundException,
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

  async createOne(
    req: CrudRequestInterface<ArtistEntityInterface>,
    dto: ArtistCreateDto,
    options?: Record<string, unknown>,
  ): Promise<ArtistEntityInterface> {
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
      console.log(`Artist created: ${result.name} (ID: ${result.id})`);
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

  async updateOne(
    req: CrudRequestInterface<ArtistEntityInterface>,
    dto: ArtistUpdateDto,
    options?: Record<string, unknown>,
  ): Promise<ArtistEntityInterface> {
    try {
      const artistId = req.parsed.paramsFilter.find((p: any) => p.field === 'id')?.value as string;
      
      if (!artistId) {
        throw new ArtistNotFoundException({
          message: 'Artist ID is required for update',
        });
      }

      // Business validation - check if artist exists
      const existingArtist = await this.artistModelService.getArtistById(artistId);
      if (!existingArtist) {
        throw new ArtistNotFoundException({
          message: `Artist with ID ${artistId} not found`,
        });
      }

      // Business validation - check name uniqueness if name is being updated
      if (dto.name && dto.name !== existingArtist.name) {
        const isUnique = await this.artistModelService.isNameUnique(dto.name, artistId);
        if (!isUnique) {
          throw new ArtistNameAlreadyExistsException({
            message: `Artist with name "${dto.name}" already exists`,
          });
        }
      }

      const result = await super.updateOne(req, dto, options);
      console.log(`Artist updated: "${existingArtist.name}" → "${result.name}" (ID: ${result.id})`);
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

  async deleteOne(
    req: CrudRequestInterface<ArtistEntityInterface>,
    options?: Record<string, unknown>,
  ): Promise<void | ArtistEntityInterface> {
    try {
      const artistId = req.parsed.paramsFilter.find((p: any) => p.field === 'id')?.value as string;
      
      if (!artistId) {
        throw new ArtistNotFoundException({
          message: 'Artist ID is required for deletion',
        });
      }

      // Business validation - check if artist exists
      const artist = await this.artistModelService.getArtistById(artistId);
      if (!artist) {
        throw new ArtistNotFoundException({
          message: `Artist with ID ${artistId} not found`,
        });
      }

      // TODO: Business rule - check if artist can be deleted (not referenced by songs)
      // const canBeDeleted = await this.artistModelService.canBeDeleted(artistId);
      // if (!canBeDeleted) {
      //   throw new ArtistCannotBeDeletedException({
      //     message: `Cannot delete artist "${artist.name}" because it has associated songs`,
      //   });
      // }

      const result = await super.deleteOne(req, options);
      console.log(`Artist deleted: ${artist.name} (ID: ${artistId})`);
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
}
```

---

## Error Flow Patterns

### Controlled vs Unexpected Errors

```typescript
try {
  // Your business logic
  const result = await someOperation();
  return result;
} catch (error) {
  // 1. Check for controlled business exceptions
  if (error instanceof YourEntityException) {
    // These have proper HTTP status codes and user-friendly messages
    throw error;
  }
  
  // 2. Check for validation errors (from class-validator)
  if (error instanceof ValidationError) {
    throw new BadRequestException('Validation failed');
  }
  
  // 3. Check for database constraint violations
  if (error.code === '23505') { // PostgreSQL unique constraint
    throw new ConflictException('Resource already exists');
  }
  
  // 4. All other errors are unexpected - wrap and log
  console.error('Unexpected error:', error);
  throw new YourEntityException({
    message: 'Operation failed',
    originalError: error
  });
}
```

### Model Service Error Handling

Model services should throw business exceptions:

```typescript
// artist-model.service.ts
export class ArtistModelService {
  async getArtistById(id: string): Promise<ArtistEntity> {
    const artist = await this.repo.findOne({ where: { id } });
    
    if (!artist) {
      throw new ArtistNotFoundException({
        message: `Artist with ID ${id} not found`,
      });
    }
    
    return artist;
  }

  async isNameUnique(name: string, excludeId?: string): Promise<boolean> {
    try {
      const query = this.repo.createQueryBuilder('artist')
        .where('LOWER(artist.name) = LOWER(:name)', { name });

      if (excludeId) {
        query.andWhere('artist.id != :excludeId', { excludeId });
      }

      const existingArtist = await query.getOne();
      return !existingArtist;
    } catch (error) {
      // Database errors in model services should be logged and re-thrown
      console.error('Database error in isNameUnique:', error);
      throw error; // Let CRUD service handle wrapping
    }
  }
}
```

---

## HTTP Status Code Guidelines

### Common Business Exception Status Codes:

| Exception Type | HTTP Status | When to Use |
|----------------|-------------|-------------|
| `NotFoundException` | 404 | Entity not found by ID |
| `AlreadyExistsException` | 409 | Unique constraint violation |
| `CannotBeDeletedException` | 409 | Business rule prevents deletion |
| `InvalidStatusException` | 400 | Invalid enum value or state |
| `ValidationException` | 400 | Business validation failure |
| `ForbiddenException` | 403 | Access denied by business rules |

### Examples:

```typescript
// 404 - Resource not found
export class ArtistNotFoundException extends ArtistException {
  constructor(options?: RuntimeExceptionOptions) {
    super({
      message: 'Artist not found',
      httpStatus: HttpStatus.NOT_FOUND, // 404
      ...options,
    });
  }
}

// 409 - Conflict with existing resource
export class ArtistNameAlreadyExistsException extends ArtistException {
  constructor(options?: RuntimeExceptionOptions) {
    super({
      message: 'Artist name already exists',
      httpStatus: HttpStatus.CONFLICT, // 409
      ...options,
    });
  }
}

// 400 - Bad request/validation error
export class ArtistInvalidStatusException extends ArtistException {
  constructor(options?: RuntimeExceptionOptions) {
    super({
      message: 'Invalid artist status',
      httpStatus: HttpStatus.BAD_REQUEST, // 400
      ...options,
    });
  }
}
```

---

## Exception Testing

### Unit Testing Exceptions

```typescript
// artist.service.spec.ts
describe('ArtistCrudService', () => {
  it('should throw ArtistNameAlreadyExistsException when name is not unique', async () => {
    // Arrange
    const createDto = { name: 'Existing Artist' };
    jest.spyOn(artistModelService, 'isNameUnique').mockResolvedValue(false);

    // Act & Assert
    await expect(service.createOne(mockRequest, createDto)).rejects.toThrow(
      ArtistNameAlreadyExistsException
    );
  });

  it('should throw InternalServerErrorException for unexpected errors', async () => {
    // Arrange
    const createDto = { name: 'Test Artist' };
    jest.spyOn(artistModelService, 'isNameUnique').mockRejectedValue(new Error('Database error'));

    // Act & Assert
    await expect(service.createOne(mockRequest, createDto)).rejects.toThrow(
      InternalServerErrorException
    );
  });
});
```

---

## Key Principles

### ✅ Do:
- **Base Exception**: Create a base exception class for each entity module  
- **Specific Exceptions**: Extend base exception for specific business errors  
- **HTTP Status**: Set appropriate HTTP status codes in exceptions  
- **Error Codes**: Use consistent error code naming (`{ENTITY}_{ERROR_TYPE}_ERROR`)
- **Controlled Errors**: Check `instanceof BaseException` in catch blocks  
- **Unexpected Errors**: Wrap unknown errors in `InternalServerErrorException`  
- **Error Context**: Preserve original error with `cause` property  
- **Logging**: Log unexpected errors for debugging  

### Best Practices:
- **Wrap database errors**: Always catch and wrap database errors in appropriate business exceptions
- **Protect internal details**: Use generic error messages for clients while logging full details internally
- **Use specific exceptions**: Create and use specific business exception types for different error scenarios
- **Log everything**: Always log unexpected errors with full context for debugging and monitoring
- **Set proper status codes**: Ensure each exception type returns the appropriate HTTP status code
- **Maintain consistency**: Use the same error handling pattern across all services in your module

---

## Benefits of This Pattern

1. **Controlled Error Responses**: Known business exceptions return proper HTTP status codes and user-friendly messages
2. **Security**: Unexpected errors don't leak internal system details to clients  
3. **Debugging**: Unexpected errors are logged with full context for investigation
4. **Type Safety**: TypeScript ensures proper exception handling patterns
5. **Consistency**: All modules follow the same error handling approach
6. **Maintainability**: Easy to add new exception types and modify error handling
7. **Testability**: Clear patterns make unit testing error scenarios straightforward

This error handling pattern ensures your API provides consistent, secure, and debuggable error responses while maintaining clean separation between business logic errors and system errors.