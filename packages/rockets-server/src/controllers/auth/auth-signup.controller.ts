import { AuthPublic } from '@concepta/nestjs-authentication';
import {
  PasswordStorageService,
  PasswordStorageServiceInterface,
} from '@concepta/nestjs-password';
import { UserDto, UserModelService } from '@concepta/nestjs-user';
import { Body, Controller, Inject, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { plainToClass } from 'class-transformer';
import { RocketsServerUserCreateDto } from '../../dto/user/rockets-server-user-create.dto';
import { RocketsServerUserDto } from '../../dto/user/rockets-server-user.dto';

/**
 * Controller for user registration/signup
 * Allows creating new user accounts
 */
@Controller('signup-old')
@AuthPublic()
@ApiTags('auth')
export class AuthSignupController {
  constructor(
    @Inject(UserModelService)
    private readonly userModelService: UserModelService,
    @Inject(PasswordStorageService)
    protected readonly passwordStorageService: PasswordStorageServiceInterface,
  ) {}

  @ApiOperation({
    summary: 'Create a new user account',
    description:
      'Registers a new user in the system with email, username and password',
  })
  @ApiBody({
    type: RocketsServerUserCreateDto,
    description: 'User registration information',
    examples: {
      standard: {
        value: {
          email: 'user@example.com',
          username: 'user@example.com',
          password: 'StrongP@ssw0rd',
          active: true,
        },
        summary: 'Standard user registration',
      },
    },
  })
  @ApiCreatedResponse({
    description: 'User created successfully',
    type: RocketsServerUserDto,
  })
  @ApiBadRequestResponse({
    description: 'Bad request - Invalid input data or missing required fields',
  })
  @ApiConflictResponse({
    description: 'Email or username already exists',
  })
  @Post()
  async create(
    @Body() userCreateDto: RocketsServerUserCreateDto,
  ): Promise<UserDto> {
    const passwordHash = await this.passwordStorageService.hash(
      userCreateDto.password,
    );

    const result = await this.userModelService.create({
      ...userCreateDto,
      ...passwordHash,
    });

    return plainToClass(UserDto, result);
  }
}
