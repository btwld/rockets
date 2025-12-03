# Sample Server Auth - RocketsAuth SDK Example

This sample application demonstrates the full capabilities of the RocketsAuth SDK, including authentication, authorization, user management, and invitation flows.

## Features

- 🔐 **JWT Authentication** - Secure token-based authentication
- 👥 **User Management** - Full CRUD operations for users and metadata
- 📧 **Invitation System** - Invite users with role assignment and metadata collection
- 🛡️ **Role-Based Access Control (RBAC)** - Fine-grained permissions using AccessControl
- 🔑 **OTP Verification** - One-time password for secure operations
- 🔄 **OAuth Integration** - Support for federated authentication
- 📝 **User Metadata** - Extensible user profile data with validation

## Quick Start

### Prerequisites

- Node.js >= 16
- Yarn package manager

### Installation

From the root of the monorepo:

```bash
yarn install
yarn build
```

### Running the Application

```bash
cd examples/sample-server-auth
yarn start
```

The server will start on `http://localhost:3000`

### Running Tests

```bash
# From the monorepo root
yarn test:e2e invitation  # Invitation flow tests
yarn test role-based      # RBAC tests
```

## Documentation

- [Invitation Flow Guide](./INVITATION_FLOW_GUIDE.md) - Complete guide for invitation acceptance
- [Role-Based Access Control Guide](./ROLE_ACCESS_CONTROL_GUIDE.md) - RBAC implementation details

## Configuration

### Database

Uses SQLite in-memory database for demonstration. Configuration in `app.module.ts`:

```typescript
TypeOrmExtModule.forRoot({
  type: 'sqlite',
  database: ':memory:',
  entities: [/* ... */],
  synchronize: true,
})
```

### Authentication

JWT-based authentication with configurable settings:

```typescript
RocketsAuthModule.forRootAsync({
  enableGlobalJWTGuard: false, // Using RocketsModule guard
  // ... other settings
})
```

### User Metadata

User metadata is configured with DTOs for validation:

```typescript
userCrud: {
  userMetadataConfig: {
    createDto: UserMetadataCreateDto,
    updateDto: UserMetadataUpdateDto, // Used for invitation acceptance
  },
}
```

## API Endpoints

### Public Endpoints (No Auth)

- `POST /signup` - User registration
- `POST /login` - User login
- `PATCH /invitation-acceptance/:code` - Accept invitation (OTP protected)

### Protected Endpoints (JWT Required)

- `GET /admin/users` - List users (Admin only)
- `POST /admin/users` - Create user (Admin only)
- `POST /admin/invitations` - Create invitation (Admin only)
- `GET /pets` - List pets
- `POST /pets` - Create pet

### Role-Based Endpoints

Access control is enforced using the `@Auth()` decorator with AccessControl rules:

```typescript
@Auth({ resource: 'pet', action: 'create' })
async createPet() { ... }
```

See [ROLE_ACCESS_CONTROL_GUIDE.md](./ROLE_ACCESS_CONTROL_GUIDE.md) for details.

## Project Structure

```
sample-server-auth/
├── assets/                      # Email templates
│   ├── invitation.template.hbs
│   ├── invitation-accepted.template.hbs
│   └── send-otp.template.hbs
├── src/
│   ├── modules/
│   │   ├── user/               # User domain
│   │   │   ├── entities/
│   │   │   ├── dto/
│   │   │   └── adapters/
│   │   ├── role/               # Role domain
│   │   └── pet/                # Example domain for RBAC
│   ├── app.module.ts           # Main application module
│   ├── app.acl.ts              # Access control rules
│   ├── access-control.service.ts
│   └── main.ts
└── test/
    └── role-based-access.e2e-spec.ts
```

## Key Concepts

### Module Definition Pattern

This sample uses the **module definition pattern** for invitation acceptance:

1. **Module Definition File** - Contains all logic (controllers, listeners, providers)
2. **Module File** - Thin wrapper with `forRoot()`/`forRootAsync()` methods
3. **KISS Principle** - Factory methods create classes dynamically

See the [Invitation Flow Guide](./INVITATION_FLOW_GUIDE.md) for implementation details.

### Metadata Validation

User metadata is validated during:
- Signup
- Admin user creation
- **Invitation acceptance** ✨

The same `UserMetadataUpdateDto` is used across all flows, ensuring consistency.

### Security Features

1. **Role Assignment** - Admin-controlled via invitation constraints
2. **Mass Assignment Protection** - Only whitelisted fields accepted
3. **OTP Validation** - Secure invitation acceptance
4. **JWT Tokens** - Stateless authentication
5. **Access Control** - Fine-grained permissions

## Example Flows

### 1. Signup Flow

```bash
# User signs up
curl -X POST http://localhost:3000/signup \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "username": "user@example.com",
    "password": "SecureP@ss123",
    "userMetadata": {
      "firstName": "John",
      "lastName": "Doe"
    }
  }'

# Login
curl -X POST http://localhost:3000/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "user@example.com",
    "password": "SecureP@ss123"
  }'
```

### 2. Invitation Flow

```bash
# Admin creates invitation
curl -X POST http://localhost:3000/admin/invitations \
  -H "Authorization: Bearer {ADMIN_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "newuser@example.com",
    "constraints": {
      "roleId": "{USER_ROLE_ID}"
    }
  }'

# User accepts invitation
curl -X PATCH http://localhost:3000/invitation-acceptance/{CODE} \
  -H "Content-Type: application/json" \
  -d '{
    "passcode": "123456",
    "payload": {
      "password": "NewUserP@ss123",
      "userMetadata": {
        "firstName": "Jane",
        "lastName": "Smith"
      }
    }
  }'
```

See [INVITATION_FLOW_GUIDE.md](./INVITATION_FLOW_GUIDE.md) for complete examples.

## Customization

### Adding Custom Metadata Fields

1. Update `UserMetadataUpdateDto`:

```typescript
export class UserMetadataUpdateDto {
  @IsString()
  @IsOptional()
  firstName?: string;

  @IsString()
  @IsOptional()
  lastName?: string;

  @IsString()
  @IsOptional()
  phoneNumber?: string; // New field
}
```

2. Update entity:

```typescript
@Entity()
export class UserMetadataEntity extends RocketsAuthUserMetadataSqliteEntity {
  @Column({ nullable: true })
  phoneNumber?: string;
}
```

3. Fields are now validated in invitation acceptance automatically!

### Custom Access Control Rules

Update `app.acl.ts`:

```typescript
export const acRules = new AccessControl()
  .grant('user')
    .createOwn('pet')
    .readOwn('pet')
  .grant('admin')
    .extend('user')
    .deleteAny('pet'); // Admin can delete any pet
```

## Troubleshooting

### Issue: Invitation acceptance fails with validation error

**Solution**: Ensure `UserMetadataUpdateDto` is configured in `userCrud.userMetadataConfig.updateDto`

### Issue: Role not assigned after invitation acceptance

**Solution**: 
1. Set `settings.role.defaultUserRoleName` in RocketsAuthModule
2. Or provide `constraints.roleId` when creating invitation

### Issue: Email not sent

**Solution**: This sample uses a mock email service. Configure a real `mailerService` in production.

## Production Considerations

1. **Database**: Replace SQLite with PostgreSQL/MySQL
2. **Email Service**: Integrate real email provider (SendGrid, AWS SES, etc.)
3. **Environment Variables**: Use `.env` files for configuration
4. **Security**: Enable HTTPS, configure CORS properly
5. **Logging**: Add structured logging (Winston, Pino)
6. **Monitoring**: Add health checks and metrics

## Related Documentation

- [RocketsAuth Package](../../packages/rockets-server-auth/README.md)
- [Rockets Server Package](../../packages/rockets-server/README.md)
- [Invitation Flow Guide](./INVITATION_FLOW_GUIDE.md)
- [RBAC Guide](./ROLE_ACCESS_CONTROL_GUIDE.md)

## License

MIT

---

**Note**: This is a sample application for demonstration purposes. Do not use in production without proper security hardening.

