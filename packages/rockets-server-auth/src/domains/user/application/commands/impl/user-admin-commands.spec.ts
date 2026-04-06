import type { CrudContextInterface } from '@concepta/nestjs-crud';
import type { RepositoryContextInterface } from '@concepta/nestjs-repository';
import { AdminDeleteUserCommand } from './admin-delete-user.command';
import { AdminUpdateUserCommand } from './admin-update-user.command';
import { RemoveUserCommand } from './remove-user.command';
import type { RocketsAuthUserEntityInterface } from '../../../interfaces/rockets-auth-user-entity.interface';
import type { RocketsAuthUserUpdatableInterface } from '../../../interfaces/rockets-auth-user-updatable.interface';

describe('Admin / remove user commands (impl)', () => {
  it('AdminDeleteUserCommand stores context', () => {
    const ctx = { id: 'c1' } as unknown as CrudContextInterface<RocketsAuthUserEntityInterface>;
    const cmd = new AdminDeleteUserCommand(ctx);
    expect(cmd.context).toBe(ctx);
  });

  it('AdminUpdateUserCommand stores context and dto', () => {
    const ctx = { id: 'c1' } as unknown as CrudContextInterface<RocketsAuthUserEntityInterface>;
    const dto: RocketsAuthUserUpdatableInterface = { active: true };
    const cmd = new AdminUpdateUserCommand(ctx, dto);
    expect(cmd.context).toBe(ctx);
    expect(cmd.dto).toBe(dto);
  });

  it('RemoveUserCommand stores repository context and id', () => {
    const ctx = { entity: 'user' } as unknown as RepositoryContextInterface;
    const cmd = new RemoveUserCommand(ctx, 'user-9');
    expect(cmd.ctx).toBe(ctx);
    expect(cmd.id).toBe('user-9');
  });
});
