import { Global, Module } from '@nestjs/common';
import { IssueTokenServiceFixture } from './services/issue-token.service.fixture';
import { VerifyTokenServiceFixture } from './services/verify-token.service.fixture';
import { ValidateTokenServiceFixture } from './services/validate-token.service.fixture';

@Global()
@Module({
  providers: [
    IssueTokenServiceFixture,
    VerifyTokenServiceFixture,
    ValidateTokenServiceFixture,
  ],
  exports: [
    IssueTokenServiceFixture,
    VerifyTokenServiceFixture,
    ValidateTokenServiceFixture,
  ],
})
export class GlobalModuleFixture {}
