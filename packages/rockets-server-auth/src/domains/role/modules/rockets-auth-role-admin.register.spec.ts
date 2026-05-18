import { RocketsAuthRoleAdminModule } from './rockets-auth-role-admin.module';
import { RocketsAuthRoleDto } from '../infrastructure/dto/rockets-auth-role.dto';

describe('RocketsAuthRoleAdminModule.register', () => {
  it('builds CrudModule feature with paginated admin DTO', () => {
    const dynamic = RocketsAuthRoleAdminModule.register({
      imports: [],
      model: RocketsAuthRoleDto,
    });
    expect(dynamic.module).toBe(RocketsAuthRoleAdminModule);
    expect(Array.isArray(dynamic.imports)).toBe(true);
    expect((dynamic.imports ?? []).length).toBeGreaterThan(0);
  });
});
