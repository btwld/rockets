import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthUser } from '@concepta/nestjs-authentication';
import { AuthGuard, Public } from '../guards/auth.guard';
import type { AuthorizedUser } from '../interfaces/auth-user.interface';

@Controller('me')
@UseGuards(AuthGuard)
export class MeController {
  @Get()
  me(@AuthUser() user: AuthorizedUser) {
    //TODO: return rockets user
    // get with metadata
    // get profile by uId
    const metadata: Record<string, unknown> = {};
    return {
      // not in our database
      ...user,
      // in our database
      metadata
    };
  }

  @Get('public')
  @Public(true) // Example of public route
  publicEndpoint(): { message: string } {
    return {
      message: 'This is a public endpoint'
    };
  }
}