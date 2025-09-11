# Swagger Documentation Generator

This module provides a script to automatically generate Swagger (OpenAPI)
documentation from the controllers in the Rockets Server.

## Usage

### Using the NPM script

The easiest way to generate Swagger documentation is to use the provided npm
script:

```bash
# From the rockets-server package directory
npm run generate-swagger

# Or using yarn
yarn generate-swagger
```

This will generate a `swagger.json` file in the `swagger` directory at the root
of your project.

### Programmatic Usage

You can also use the generator programmatically in your own code:

```typescript
import { generateSwaggerJson } from '@concepta/rockets-server-auth';

// Generate the Swagger documentation
generateSwaggerJson()
  .then(() => console.log('Swagger generation complete'))
  .catch(err => console.error('Error generating Swagger:', err));
```

## Output

The generator will create a `swagger.json` file in the `swagger` directory.
This file can be used with Swagger UI or other OpenAPI tools to visualize and
interact with your API documentation.

## Customization

The generator uses NestJS's `SwaggerModule` and `DocumentBuilder` to create the
documentation. If you need to customize the output, you can modify the
`generate-swagger.ts` file in the `src` directory.

Key customization points:

```typescript
// Change the API metadata
const options = new DocumentBuilder()
  .setTitle('Rockets API')
  .setDescription('API documentation for Rockets Server')
  .setVersion('1.0')
  .addBearerAuth()
  // Add tags, security definitions, etc.
  .build();
```

## Adding Documentation to Controllers and DTOs

The quality of the generated documentation depends on the annotations in your
controllers and DTOs. Make sure to use NestJS Swagger decorators to properly
document your API:

```typescript
import { Controller, Post, Body } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBody,
} from '@nestjs/swagger';

@ApiTags('users')
@Controller('users')
export class UsersController {
  @Post()
  @ApiOperation({ summary: 'Create user' })
  @ApiResponse({ status: 201, description: 'User created successfully.' })
  @ApiResponse({ status: 400, description: 'Bad request.' })
  @ApiBody({ type: CreateUserDto })
  async create(@Body() createUserDto: CreateUserDto) {
    // ...
  }
}
```

For more information on how to document your API, see the
[NestJS Swagger documentation](https://docs.nestjs.com/openapi/introduction).
