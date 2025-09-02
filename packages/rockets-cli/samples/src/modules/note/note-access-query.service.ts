import { Injectable } from '@nestjs/common';
import { AccessControlContextInterface, CanAccess } from '@concepta/nestjs-access-control';

@Injectable()
export class NoteAccessQueryService implements CanAccess {
  async canAccess(context: AccessControlContextInterface): Promise<boolean> {
    const user = context.getUser() as any;
    if (!user?.id) return false;
    if (user.status !== 'ACTIVE') return false;
    return true;
  }
}


