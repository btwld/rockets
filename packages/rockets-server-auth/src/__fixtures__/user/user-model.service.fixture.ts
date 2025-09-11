import { Injectable } from '@nestjs/common';
import {
  ReferenceIdInterface,
  ReferenceSubject,
} from '@concepta/nestjs-common';
import { AuthJwtUserModelServiceInterface } from '@concepta/nestjs-auth-jwt';

@Injectable()
export class UserModelServiceFixture
  implements AuthJwtUserModelServiceInterface
{
  async bySubject(subject: ReferenceSubject): Promise<ReferenceIdInterface> {
    throw new Error(`Method not implemented, cant get ${subject}.`);
  }
}
