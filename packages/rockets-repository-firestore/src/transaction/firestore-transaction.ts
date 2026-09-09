import { Logger } from '@nestjs/common';
import type { TransactionInterface } from '@concepta/nestjs-repository';

import { FirestoreTransactionAbortedException } from '../exceptions/firestore-transaction-aborted.exception';
import { FirestoreTransactionRetryUnsupportedException } from '../exceptions/firestore-transaction-retry-unsupported.exception';
import type { FirestoreBackend } from '../interfaces/firestore-backend.interface';
import type { FirestoreTransactionHandle } from '../interfaces/firestore-transaction-handle.interface';

/**
 * Imperative bridge from Rockets' `TransactionInterface` onto Firestore's
 * callback-shaped `runTransaction`.
 *
 * Firestore may retry the native attempt under contention. This bridge
 * **refuses** a second attempt (throws
 * {@link FirestoreTransactionRetryUnsupportedException}) instead of
 * committing an empty write set and reporting success. Contended
 * read-modify-write must use {@link FirestoreRepository.transaction} /
 * {@link runInFirestoreTransaction} so the handler body lives inside the
 * retryable callback.
 */
export class FirestoreTransaction implements TransactionInterface {
  private static readonly logger = new Logger(FirestoreTransaction.name);
  private static warnedAboutRetryLimit = false;

  private handle: FirestoreTransactionHandle | null = null;
  private attemptCount = 0;
  private runPromise: Promise<void> | null = null;
  private resolveCompletion: (() => void) | null = null;
  private rejectCompletion: ((error: unknown) => void) | null = null;

  constructor(private readonly backend: FirestoreBackend) {}

  get isActive(): boolean {
    return this.handle !== null;
  }

  async start(): Promise<void> {
    if (!FirestoreTransaction.warnedAboutRetryLimit) {
      FirestoreTransaction.warnedAboutRetryLimit = true;
      FirestoreTransaction.logger.warn(
        "TransactionScope / transactional:true uses Firestore's imperative " +
          'bridge, which refuses SDK retries under contention ' +
          '(FIRESTORE_TRANSACTION_RETRY_UNSUPPORTED). Prefer ' +
          'FirestoreRepository.transaction() or runInFirestoreTransaction() ' +
          'for contended read-modify-write.',
      );
    }

    if (this.handle !== null || this.runPromise !== null) {
      throw new FirestoreTransactionRetryUnsupportedException(
        'Firestore transaction already started',
      );
    }

    let resolveReady!: () => void;
    const ready = new Promise<void>((resolve) => {
      resolveReady = resolve;
    });

    const completion = new Promise<void>((resolve, reject) => {
      this.resolveCompletion = resolve;
      this.rejectCompletion = reject;
    });

    // Prevent unhandled rejection if start() fails before commit/rollback.
    let runFailure: unknown;
    this.runPromise = this.backend
      .runTransaction(async (tx) => {
        this.attemptCount += 1;
        if (this.attemptCount > 1) {
          throw new FirestoreTransactionRetryUnsupportedException();
        }
        this.handle = tx;
        resolveReady();
        await completion;
      })
      .then(() => undefined)
      .catch((error: unknown) => {
        runFailure = error;
        throw error;
      });

    // If runTransaction rejects before invoking the callback (credentials,
    // project id, sync validation), ready never resolves — race it.
    await Promise.race([
      ready,
      this.runPromise.then(() => {
        throw (
          runFailure ??
          new FirestoreTransactionRetryUnsupportedException(
            'Firestore transaction ended before start completed',
          )
        );
      }),
    ]);
  }

  async commit(): Promise<void> {
    if (!this.resolveCompletion || !this.runPromise) {
      throw new FirestoreTransactionRetryUnsupportedException(
        'No active Firestore transaction to commit',
      );
    }
    try {
      this.resolveCompletion();
      await this.runPromise;
    } finally {
      this.cleanup();
    }
  }

  async rollback(): Promise<void> {
    if (!this.rejectCompletion || !this.runPromise) {
      return;
    }
    try {
      this.rejectCompletion(new FirestoreTransactionAbortedException());
      try {
        await this.runPromise;
      } catch (error: unknown) {
        if (!(error instanceof FirestoreTransactionAbortedException)) {
          throw error;
        }
      }
    } finally {
      this.cleanup();
    }
  }

  getClient<T = unknown>(): T {
    if (!this.handle) {
      throw new FirestoreTransactionRetryUnsupportedException(
        'No active Firestore transaction — cannot get client',
      );
    }
    return this.handle as T;
  }

  private cleanup(): void {
    this.handle = null;
    this.attemptCount = 0;
    this.runPromise = null;
    this.resolveCompletion = null;
    this.rejectCompletion = null;
  }
}
