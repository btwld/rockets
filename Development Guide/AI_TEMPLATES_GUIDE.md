# AI Templates Guide

> **For AI Tools**: This guide provides copy-paste templates and workflows optimized for AI-assisted development. Use this when working with Claude, Cursor, GitHub Copilot, or other AI coding tools.

## 📋 **Quick Reference**

| Task | Section |
|------|---------|
| Generate complete entity module | [Full Module Template](#full-module-template) |
| Copy-paste individual files | [Individual File Templates](#individual-file-templates) |
| File creation order | [Development Workflow](#development-workflow) |
| Success criteria checklist | [Quality Checklist](#quality-checklist) |

---

## AI Development Workflow

### **Phase 1: Planning (1 prompt)**
```
Create a complete {Entity} module for Jangel Services using the Rockets Server SDK patterns.

Business Requirements:
- [List specific business rules from TECHNICAL_SPECIFICATION.md]
- [List validation requirements]
- [List relationships to other entities]

User Roles:
- Admin: Full CRUD access
- ImprintArtist: [Specify access level]
- Clerical: [Specify access level]

Use these existing modules as reference patterns:
- Artist module (Direct CRUD pattern)
- Subgenre module (Business validation)
- Error handling from ERROR_HANDLING_GUIDE.md
- Access control from ACCESS_CONTROL_GUIDE.md
```

### **Phase 2: File Generation Order**

**Prompt the AI to create files in this exact order:**

1. **Entity & Interfaces** (Foundation)
2. **DTOs** (API Contracts)  
3. **Exceptions** (Error Handling)
4. **Model Service** (Business Logic)
5. **Adapter** (Database Layer)
6. **CRUD Service** (Business Operations)
7. **Access Control** (Security)
8. **Controller** (API Endpoints)
9. **Module** (Dependency Injection)
10. **Types** (Resource Definitions)

---

## Full Module Template

### AI Prompt Template

```
Create a complete {Entity} module with the following files using Rockets Server SDK patterns:

BUSINESS CONTEXT:
- Entity: {Entity}
- Purpose: {Purpose description}
- Relationships: {List relationships}
- Business Rules: {List validation rules}
- Role Access: Admin (full), ImprintArtist ({access level}), Clerical ({access level})

TECHNICAL REQUIREMENTS:
- Use Direct CRUD pattern (like Artist module)
- Implement EntityException base class pattern
- Add proper business validation in model service
- Include access control with CanAccess interface
- Follow DTO patterns with validation decorators
- Use proper error handling flow (instanceof checks)

FILES TO CREATE:
1. {entity}.entity.ts - TypeORM entity
2. {entity}.interface.ts - Business interfaces
3. {entity}.dto.ts - API DTOs with validation
4. {entity}.exception.ts - Exception hierarchy
5. {entity}-model.service.ts - Business logic
6. {entity}-typeorm-crud.adapter.ts - Database adapter
7. {entity}.crud.service.ts - CRUD operations
8. {entity}-access-query.service.ts - Access control
9. {entity}.crud.controller.ts - API endpoints
10. {entity}.types.ts - Resource types
11. {entity}.module.ts - Module configuration

PATTERNS TO FOLLOW:
- Error handling: instanceof EntityException vs InternalServerErrorException
- Constructor pattern: @Inject(Adapter) + super(adapter) 
- DTO composition: PickType, PartialType for Create/Update DTOs
- Access control: CanAccess interface with role-based logic
- Validation: class-validator decorators with custom messages

Create each file with complete implementation following the established patterns.
```

---

## Individual File Templates

### 1. Entity Template

```typescript
// {entity}.entity.ts
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { {Entity}Interface, {Entity}Status } from './{entity}.interface';

@Entity('{entity}')
export class {Entity}Entity implements {Entity}Interface {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 255, nullable: false })
  name!: string;

  @Column({
    type: 'enum',
    enum: {Entity}Status,
    default: {Entity}Status.ACTIVE,
    nullable: false,
  })
  status!: {Entity}Status;

  // Add entity-specific columns here
  
  @CreateDateColumn({
    type: 'timestamptz',
    default: () => 'CURRENT_TIMESTAMP',
  })
  dateCreated!: Date;

  @UpdateDateColumn({
    type: 'timestamptz',
    default: () => 'CURRENT_TIMESTAMP',
  })
  dateUpdated!: Date;

  // Add relationships here
  // @ManyToOne(() => ParentEntity, parent => parent.{entity}s)
  // @JoinColumn({ name: 'parent_id' })
  // parent?: ParentEntity;
}
```

### 2. Interface Template

```typescript
// {entity}.interface.ts
import { CommonEntityInterface } from '@concepta/nestjs-common';

export enum {Entity}Status {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}

export interface {Entity}Interface extends CommonEntityInterface {
  name: string;
  status: {Entity}Status;
  // Add other entity-specific fields
}

export interface {Entity}CreatableInterface {
  name: string;
  status?: {Entity}Status;
  // Add other creatable fields
}

export interface {Entity}UpdatableInterface {
  name?: string;
  status?: {Entity}Status;
  // Add other updatable fields
}
```

### 3. DTO Template

```typescript
// {entity}.dto.ts
import { Exclude, Expose, Type } from 'class-transformer';
import {
  IsString,
  IsEnum,
  IsOptional,
  MaxLength,
  MinLength,
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

@Exclude()
export class {Entity}Dto extends CommonEntityDto implements {Entity}Interface {
  @Expose()
  @ApiProperty({
    description: '{Entity} name',
    example: 'Example {Entity}',
    maxLength: 255,
    minLength: 1,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(1, { message: '{Entity} name must be at least 1 character' })
  @MaxLength(255, { message: '{Entity} name cannot exceed 255 characters' })
  name!: string;

  @Expose()
  @ApiProperty({
    description: '{Entity} status',
    example: {Entity}Status.ACTIVE,
    enum: {Entity}Status,
  })
  @IsEnum({Entity}Status)
  status!: {Entity}Status;
}

export class {Entity}CreateDto 
  extends PickType({Entity}Dto, ['name', 'status'] as const) 
  implements {Entity}CreatableInterface {}

export class {Entity}CreateManyDto {
  @ApiProperty({
    type: [{Entity}CreateDto],
    description: 'Array of {entity}s to create',
  })
  @Type(() => {Entity}CreateDto)
  bulk!: {Entity}CreateDto[];
}

export class {Entity}UpdateDto implements {Entity}UpdatableInterface {
  @ApiProperty({
    description: '{Entity} name',
    example: 'Updated {Entity}',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
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

export class {Entity}PaginatedDto extends CrudResponsePaginatedDto<{Entity}Dto> {
  @ApiProperty({
    type: [{Entity}Dto],
    description: 'Array of {entity}s',
  })
  data!: {Entity}Dto[];
}
```

### 4. Exception Template

```typescript
// {entity}.exception.ts
import { HttpStatus } from '@nestjs/common';
import { RuntimeException, RuntimeExceptionOptions } from '@concepta/nestjs-common';

export class {Entity}Exception extends RuntimeException {
  constructor(options?: RuntimeExceptionOptions) {
    super(options);
    this.errorCode = '{ENTITY}_ERROR';
  }
}

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
```

### 5. Model Service Template

```typescript
// {entity}-model.service.ts
import { Injectable } from '@nestjs/common';
import { InjectDynamicRepository } from '@concepta/nestjs-typeorm-ext';
import { Repository } from 'typeorm';
import { {Entity}Entity } from './{entity}.entity';
import { {Entity}NotFoundException } from './{entity}.exception';

@Injectable()
export class {Entity}ModelService {
  constructor(
    @InjectDynamicRepository('{entity}')
    private readonly {entity}Repository: Repository<{Entity}Entity>,
  ) {}

  async get{Entity}ById(id: string): Promise<{Entity}Entity> {
    const {entity} = await this.{entity}Repository.findOne({ where: { id } });
    
    if (!{entity}) {
      throw new {Entity}NotFoundException({
        message: `{Entity} with ID ${id} not found`,
      });
    }
    
    return {entity};
  }

  async isNameUnique(name: string, excludeId?: string): Promise<boolean> {
    const query = this.{entity}Repository.createQueryBuilder('{entity}')
      .where('LOWER({entity}.name) = LOWER(:name)', { name });

    if (excludeId) {
      query.andWhere('{entity}.id != :excludeId', { excludeId });
    }

    const existing{Entity} = await query.getOne();
    return !existing{Entity};
  }

  async canBeDeleted(id: string): Promise<boolean> {
    // TODO: Add business logic to check if {entity} can be deleted
    // Example: check if it has associated records
    return true;
  }

  // Add other business logic methods here
}
```

### 6. Adapter Template

```typescript
// {entity}-typeorm-crud.adapter.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TypeOrmCrudAdapter } from '@concepta/nestjs-crud';
import { {Entity}Entity } from './{entity}.entity';

@Injectable()
export class {Entity}TypeOrmCrudAdapter extends TypeOrmCrudAdapter<{Entity}Entity> {
  constructor(
    @InjectRepository({Entity}Entity)
    {entity}Repository: Repository<{Entity}Entity>,
  ) {
    super({entity}Repository);
  }
}
```

### 7. CRUD Service Template

```typescript
// {entity}.crud.service.ts
import { Inject, Injectable, InternalServerErrorException } from '@nestjs/common';
import { CrudService } from '@concepta/nestjs-crud';
import { CrudRequestInterface } from '@concepta/nestjs-crud';
import { {Entity}EntityInterface, {Entity}Status } from './{entity}.interface';
import { {Entity}TypeOrmCrudAdapter } from './{entity}-typeorm-crud.adapter';
import { {Entity}ModelService } from './{entity}-model.service';
import { {Entity}CreateDto, {Entity}UpdateDto, {Entity}CreateManyDto } from './{entity}.dto';
import { 
  {Entity}Exception, 
  {Entity}NameAlreadyExistsException 
} from './{entity}.exception';

@Injectable()
export class {Entity}CrudService extends CrudService<{Entity}EntityInterface> {
  constructor(
    @Inject({Entity}TypeOrmCrudAdapter)
    protected readonly crudAdapter: {Entity}TypeOrmCrudAdapter,
    private readonly {entity}ModelService: {Entity}ModelService,
  ) {
    super(crudAdapter);
  }

  async createOne(
    req: CrudRequestInterface<{Entity}EntityInterface>,
    dto: {Entity}CreateDto,
    options?: Record<string, unknown>,
  ): Promise<{Entity}EntityInterface> {
    try {
      const isUnique = await this.{entity}ModelService.isNameUnique(dto.name);
      if (!isUnique) {
        throw new {Entity}NameAlreadyExistsException({
          message: `{Entity} with name "${dto.name}" already exists`,
        });
      }

      const createData = { ...dto, status: dto.status || {Entity}Status.ACTIVE };
      const result = await super.createOne(req, createData, options);
      console.log(`{Entity} created: ${result.name}`);
      return result;
    } catch (error) {
      if (error instanceof {Entity}Exception) {
        throw error;
      }
      console.error('Unexpected error in {entity} createOne:', error);
      throw new InternalServerErrorException('Failed to create {entity}', { cause: error });
    }
  }

  async updateOne(
    req: CrudRequestInterface<{Entity}EntityInterface>,
    dto: {Entity}UpdateDto,
    options?: Record<string, unknown>,
  ): Promise<{Entity}EntityInterface> {
    try {
      const {entity}Id = req.parsed.paramsFilter.find((p: any) => p.field === 'id')?.value as string;
      
      if (dto.name) {
        const existing{Entity} = await this.{entity}ModelService.get{Entity}ById({entity}Id);
        if (dto.name !== existing{Entity}.name) {
          const isUnique = await this.{entity}ModelService.isNameUnique(dto.name, {entity}Id);
          if (!isUnique) {
            throw new {Entity}NameAlreadyExistsException({
              message: `{Entity} with name "${dto.name}" already exists`,
            });
          }
        }
      }

      const result = await super.updateOne(req, dto, options);
      console.log(`{Entity} updated: ${result.name}`);
      return result;
    } catch (error) {
      if (error instanceof {Entity}Exception) {
        throw error;
      }
      console.error('Unexpected error in {entity} updateOne:', error);
      throw new InternalServerErrorException('Failed to update {entity}', { cause: error });
    }
  }

  async deleteOne(
    req: CrudRequestInterface<{Entity}EntityInterface>,
    options?: Record<string, unknown>,
  ): Promise<void | {Entity}EntityInterface> {
    try {
      const {entity}Id = req.parsed.paramsFilter.find((p: any) => p.field === 'id')?.value as string;
      const {entity} = await this.{entity}ModelService.get{Entity}ById({entity}Id);
      
      const result = await super.deleteOne(req, options);
      console.log(`{Entity} deleted: ${entity}.name`);
      return result;
    } catch (error) {
      if (error instanceof {Entity}Exception) {
        throw error;
      }
      console.error('Unexpected error in {entity} deleteOne:', error);
      throw new InternalServerErrorException('Failed to delete {entity}', { cause: error });
    }
  }
}
```

### 8. Access Control Template

```typescript
// {entity}-access-query.service.ts
import { Injectable } from '@nestjs/common';
import { AccessControlContextInterface, CanAccess } from '@concepta/nestjs-access-control';

@Injectable()
export class {Entity}AccessQueryService implements CanAccess {
  
  async canAccess(context: AccessControlContextInterface): Promise<boolean> {
    const user = context.getUser() as any;
    const query = context.getQuery();
    
    if (!user || !user.id) {
      console.log('Access denied: User not authenticated');
      return false;
    }

    if (user.status !== 'ACTIVE') {
      console.log(`Access denied: User ${user.id} status is ${user.status}`);
      return false;
    }

    const userRole = user.roles?.[0]?.name;
    const resource = query.resource;
    const action = query.action;

    console.log(`{Entity} access: ${userRole} requesting ${action} on ${resource}`);

    switch (userRole) {
      case 'Admin':
        return this.checkAdminAccess(resource, action);
      
      case 'ImprintArtist':
        return this.checkImprintArtistAccess(resource, action);
      
      case 'Clerical':
        return this.checkClericalAccess(resource, action);
      
      default:
        return false;
    }
  }

  private checkAdminAccess(resource: string, action: string): boolean {
    // Admin has full access
    return true;
  }

  private checkImprintArtistAccess(resource: string, action: string): boolean {
    // Define ImprintArtist permissions
    return action === 'read';
  }

  private checkClericalAccess(resource: string, action: string): boolean {
    // Define Clerical permissions
    return action === 'read';
  }
}
```

### 9. Controller Template

```typescript
// {entity}.crud.controller.ts
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
  {Entity}CreateManyDto, 
  {Entity}CreateDto, 
  {Entity}PaginatedDto, 
  {Entity}UpdateDto, 
  {Entity}Dto 
} from './{entity}.dto';
import { {Entity}AccessQueryService } from './{entity}-access-query.service';
import { {Entity}Resource } from './{entity}.types';
import { {Entity}CrudService } from './{entity}.crud.service';
import { 
  {Entity}EntityInterface, 
  {Entity}CreatableInterface, 
  {Entity}UpdatableInterface 
} from './{entity}.interface';

@CrudController({
  path: '{entity}s',
  model: {
    type: {Entity}Dto,
    paginatedType: {Entity}PaginatedDto,
  },
})
@AccessControlQuery({
  service: {Entity}AccessQueryService,
})
@ApiTags('{entity}s')
export class {Entity}CrudController implements CrudControllerInterface<
  {Entity}EntityInterface,
  {Entity}CreatableInterface,
  {Entity}UpdatableInterface
> {
  constructor(private {entity}CrudService: {Entity}CrudService) {}

  @CrudReadMany()
  @AccessControlReadMany({Entity}Resource.Many)
  async getMany(@CrudRequest() crudRequest: CrudRequestInterface<{Entity}EntityInterface>) {
    return this.{entity}CrudService.getMany(crudRequest);
  }

  @CrudReadOne()
  @AccessControlReadOne({Entity}Resource.One)
  async getOne(@CrudRequest() crudRequest: CrudRequestInterface<{Entity}EntityInterface>) {
    return this.{entity}CrudService.getOne(crudRequest);
  }

  @CrudCreateMany()
  @AccessControlCreateMany({Entity}Resource.Many)
  async createMany(
    @CrudRequest() crudRequest: CrudRequestInterface<{Entity}EntityInterface>,
    @CrudBody() {entity}CreateManyDto: {Entity}CreateManyDto,
  ) {
    return this.{entity}CrudService.createMany(crudRequest, {entity}CreateManyDto);
  }

  @CrudCreateOne({
    dto: {Entity}CreateDto
  })
  @AccessControlCreateOne({Entity}Resource.One)
  async createOne(
    @CrudRequest() crudRequest: CrudRequestInterface<{Entity}EntityInterface>,
    @CrudBody() {entity}CreateDto: {Entity}CreateDto,
  ) {
    return this.{entity}CrudService.createOne(crudRequest, {entity}CreateDto);
  }

  @CrudUpdateOne({
    dto: {Entity}UpdateDto
  })
  @AccessControlUpdateOne({Entity}Resource.One)
  async updateOne(
    @CrudRequest() crudRequest: CrudRequestInterface<{Entity}EntityInterface>,
    @CrudBody() {entity}UpdateDto: {Entity}UpdateDto,
  ) {
    return this.{entity}CrudService.updateOne(crudRequest, {entity}UpdateDto);
  }

  @CrudDeleteOne()
  @AccessControlDeleteOne({Entity}Resource.One)
  async deleteOne(@CrudRequest() crudRequest: CrudRequestInterface<{Entity}EntityInterface>) {
    return this.{entity}CrudService.deleteOne(crudRequest);
  }

  @CrudRecoverOne()
  @AccessControlRecoverOne({Entity}Resource.One)
  async recoverOne(@CrudRequest() crudRequest: CrudRequestInterface<{Entity}EntityInterface>) {
    return this.{entity}CrudService.recoverOne(crudRequest);
  }
}
```

### 10. Types Template

```typescript
// {entity}.types.ts
export const {Entity}Resource = {
  One: '{entity}-one',
  Many: '{entity}-many',
} as const;

export type {Entity}ResourceType = typeof {Entity}Resource[keyof typeof {Entity}Resource];
```

### 11. Module Template

```typescript
// {entity}.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TypeOrmExtModule } from '@concepta/nestjs-typeorm-ext';
import { {Entity}Entity } from './{entity}.entity';
import { {Entity}CrudController } from './{entity}.crud.controller';
import { {Entity}CrudService } from './{entity}.crud.service';
import { {Entity}ModelService } from './{entity}-model.service';
import { {Entity}TypeOrmCrudAdapter } from './{entity}-typeorm-crud.adapter';
import { {Entity}AccessQueryService } from './{entity}-access-query.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([{Entity}Entity]),
    TypeOrmExtModule.forFeature({
      {entity}: { entity: {Entity}Entity },
    }),
  ],
  controllers: [{Entity}CrudController],
  providers: [
    {Entity}TypeOrmCrudAdapter,
    {Entity}ModelService,
    {Entity}CrudService,
    {Entity}AccessQueryService,
  ],
  exports: [{Entity}ModelService, {Entity}TypeOrmCrudAdapter],
})
export class {Entity}Module {}
```

---

## Replacement Guide

When using templates, replace these placeholders:

| Placeholder | Example | Usage |
|-------------|---------|-------|
| `{Entity}` | `Publisher` | PascalCase class names |
| `{entity}` | `publisher` | Lowercase for variables, file names |
| `{ENTITY}` | `PUBLISHER` | Uppercase for error codes |
| `{Purpose description}` | `Music publisher management` | Brief description |
| `{access level}` | `read-only` or `full CRUD` | Role permissions |

---

## Quality Checklist

### ✅ Generated Code Must Have:

**File Structure:**
- [ ] All 11 files created in correct order
- [ ] Consistent naming conventions throughout
- [ ] Proper imports and dependencies

**Entity & Database:**
- [ ] TypeORM entity with proper decorators
- [ ] Primary key, timestamps, status enum
- [ ] Relationships properly defined
- [ ] Entity implements interface

**DTOs & Validation:**
- [ ] Base DTO extends CommonEntityDto
- [ ] Create/Update DTOs use PickType/manual implementation
- [ ] All fields have validation decorators
- [ ] ApiProperty documentation complete
- [ ] Pagination DTO extends CrudResponsePaginatedDto

**Error Handling:**
- [ ] Base exception extends RuntimeException
- [ ] Specific exceptions for business rules
- [ ] HTTP status codes set correctly
- [ ] Error codes follow naming convention

**Business Logic:**
- [ ] Model service with business validation methods
- [ ] CRUD service with proper error handling
- [ ] instanceof Exception checks vs InternalServerErrorException
- [ ] Console logging for operations

**Access Control:**
- [ ] Access service implements CanAccess
- [ ] Role-based permission logic
- [ ] Authentication and status checks
- [ ] Controller decorators applied

**Module Configuration:**
- [ ] Both TypeORM imports (standard + extended)
- [ ] All services registered in providers
- [ ] Proper exports for reusability
- [ ] Controller registered

### Common AI Generation Issues to Fix:

- **Missing constructor injection**: Ensure `@Inject(Adapter)` + `super(adapter)` for proper dependency injection
- **Wrong DTO patterns**: Use PickType correctly, not copy-paste fields to maintain consistency
- **Incomplete error handling**: Must have both business and unexpected error flows for robust error handling
- **Missing access control**: Every endpoint must have access decorators for security
- **Incorrect relationships**: Verify foreign key columns and decorators for proper database relationships
- **Missing validation**: Every DTO field needs appropriate validators for data integrity
- **Wrong file naming**: Follow kebab-case for files, PascalCase for classes for consistency

---

## AI Optimization Tips

### **Effective Prompting:**

1. **Be Specific**: Provide exact business rules and role permissions
2. **Reference Patterns**: Mention existing modules to follow as examples
3. **Request Order**: Ask for files in the specified order for dependencies
4. **Include Context**: Provide the entity's purpose and relationships
5. **Specify Patterns**: Mention Direct CRUD, EntityException, CanAccess explicitly

### **Iterative Improvements:**

1. **Generate Base Structure**: Get all files created first
2. **Add Business Logic**: Enhance validation and business rules
3. **Refine Access Control**: Add specific role-based logic
4. **Add Relationships**: Connect to other entities
5. **Enhance Testing**: Add unit tests and integration tests

### **Validation Prompts:**

```
Review the generated {Entity} module and ensure:
1. All files follow the established patterns from Artist and Subgenre modules
2. Error handling uses instanceof EntityException pattern
3. Access control implements proper role-based permissions
4. DTOs have complete validation and API documentation
5. Business logic is properly separated in model service
6. Module has correct TypeORM imports (standard + extended)

Fix any issues found and provide the corrected implementation.
```

---

## Success Metrics

**Generated code is AI-optimized when:**
- ✅ Zero manual fixes needed after generation
- ✅ All business rules implemented correctly
- ✅ Proper error handling throughout
- ✅ Access control works for all roles
- ✅ Code compiles without TypeScript errors
- ✅ Follows established patterns consistently
- ✅ Complete API documentation in Swagger

Use these templates and guidelines to achieve consistent, high-quality code generation with AI tools.