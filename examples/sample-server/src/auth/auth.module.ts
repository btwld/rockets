import { Module } from '@nestjs/common';
import { SampleAuthProvider } from './auth.provider';
import { AuthController } from './auth.controller';

@Module({
  controllers: [AuthController],
  providers: [SampleAuthProvider],
  exports: [SampleAuthProvider],
})
export class AuthModule {}
