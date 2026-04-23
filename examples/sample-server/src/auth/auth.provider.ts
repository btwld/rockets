import { Injectable, UnauthorizedException } from '@nestjs/common';
import {
  InjectDynamicRepository,
  RepositoryInterface,
  Where,
} from '@bitwild/rockets-repository';
import { sign, verify } from 'jsonwebtoken';
import type { AuthProviderInterface, AuthorizedUser } from '@bitwild/rockets';
import { UserEntity, UserRole } from './user.entity';
import { USER_ENTITY_KEY } from './auth.constants';

const JWT_SECRET = 'sample-server-secret-do-not-use-in-production';

@Injectable()
export class SampleAuthProvider implements AuthProviderInterface {
  constructor(
    @InjectDynamicRepository(USER_ENTITY_KEY)
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
