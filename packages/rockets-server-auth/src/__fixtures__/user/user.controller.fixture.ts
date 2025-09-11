import { AuthJwtGuard } from '@concepta/nestjs-auth-jwt';
import { Controller, Get, UseGuards } from '@nestjs/common';

@Controller('user')
@UseGuards(AuthJwtGuard)
export class UserControllerFixtures {
  /**
   * Status
   */
  @Get('status')
  getStatus(): boolean {
    return true;
  }
}
