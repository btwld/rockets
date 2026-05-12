/**
 * ⚠️ SAMPLE / DEMO CODE — NOT FOR PRODUCTION ⚠️
 *
 * This file is part of `examples/sample-server`, a private (un-published)
 * package whose only purpose is to show how to wire `RocketsModule`
 * end-to-end. To keep the example readable, it deliberately:
 *
 *  - Hardcodes the JWT secret (`JWT_SECRET` literal below).
 *  - Stores user passwords in plaintext on the entity.
 *  - Compares passwords with `===` instead of a constant-time hash check.
 *
 * In a real application:
 *  - Load secrets from environment / a secrets manager.
 *  - Hash passwords with `argon2` / `bcrypt` before persisting.
 *  - Compare with the library's verify function (constant-time).
 *  - Add `aud` / `iss` claims and rotate keys.
 *
 * Do not copy this adapter verbatim into production.
 */
import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import {
  InjectDynamicRepository,
  RepositoryInterface,
  Where,
} from '@bitwild/rockets-repository';
import { sign, verify } from 'jsonwebtoken';
import type { AuthAdapterInterface, AuthorizedUser } from '@bitwild/rockets';
import { UserEntity, UserRole } from './user.entity';

// Hardcoded for demo only — see file header.
const JWT_SECRET = 'sample-server-secret-do-not-use-in-production';

@Injectable()
export class SampleAuthAdapter implements AuthAdapterInterface {
  constructor(
    @InjectDynamicRepository(UserEntity)
    private readonly userRepo: RepositoryInterface<UserEntity>,
  ) {}

  async validateToken(token: string): Promise<AuthorizedUser> {
    try {
      const payload = verify(token, JWT_SECRET) as {
        sub: string;
        email: string;
      };

      const user = await this.userRepo.findOne({
        where: Where.eq<UserEntity>('id', payload.sub),
      });

      if (!user) {
        throw new UnauthorizedException('User not found');
      }

      return {
        id: user.id,
        sub: user.id,
        email: user.email,
        userRoles: [{ role: { name: user.role ?? UserRole.USER } }],
        claims: { email: user.email, name: user.name, role: user.role },
      };
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      throw new UnauthorizedException('Invalid token');
    }
  }

  async signup(
    email: string,
    password: string,
    name?: string,
    role?: UserRole,
  ): Promise<{ user: UserEntity; accessToken: string }> {
    const taken = await this.userRepo.findOne({
      where: Where.eq<UserEntity>('email', email),
    });
    if (taken) {
      throw new ConflictException('An account with this email already exists');
    }

    const user = await this.userRepo.create({
      email,
      password,
      name,
      role: role ?? UserRole.USER,
    });
    const accessToken = this.createToken(user);
    return { user, accessToken };
  }

  async login(
    email: string,
    password: string,
  ): Promise<{ accessToken: string }> {
    const user = await this.userRepo.findOne({
      where: Where.eq<UserEntity>('email', email),
    });
    if (!user || user.password !== password) {
      throw new UnauthorizedException('Invalid credentials');
    }
    return { accessToken: this.createToken(user) };
  }

  private createToken(user: UserEntity): string {
    return sign({ sub: user.id, email: user.email }, JWT_SECRET, {
      expiresIn: '1h',
    });
  }
}
