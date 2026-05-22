import { Injectable, UnauthorizedException } from '@nestjs/common';
import { randomBytes } from 'crypto';

interface PendingOAuthState {
  readonly userId: string;
  readonly createdAtMs: number;
}

const TTL_MS = 10 * 60 * 1000;

@Injectable()
export class GithubOAuthStateService {
  private readonly pending = new Map<string, PendingOAuthState>();

  create(userId: string): string {
    this.pruneExpired();
    const state = randomBytes(24).toString('hex');
    this.pending.set(state, { userId, createdAtMs: Date.now() });
    return state;
  }

  consume(state: string): string {
    this.pruneExpired();
    const entry = this.pending.get(state);
    this.pending.delete(state);
    if (!entry) {
      throw new UnauthorizedException('Invalid or expired OAuth state');
    }
    if (Date.now() - entry.createdAtMs > TTL_MS) {
      throw new UnauthorizedException('OAuth state expired — start connect again');
    }
    return entry.userId;
  }

  private pruneExpired(): void {
    const now = Date.now();
    for (const [key, entry] of this.pending) {
      if (now - entry.createdAtMs > TTL_MS) {
        this.pending.delete(key);
      }
    }
  }
}
