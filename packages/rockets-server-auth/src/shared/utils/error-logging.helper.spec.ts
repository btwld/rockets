import { Logger } from '@nestjs/common';
import { getErrorDetails, logAndGetErrorDetails } from './error-logging.helper';

describe('error-logging.helper', () => {
  describe('getErrorDetails', () => {
    it('extracts message and stack from Error instance', () => {
      const err = new Error('boom');
      const details = getErrorDetails(err);
      expect(details.errorMessage).toBe('boom');
      expect(details.errorStack).toContain('Error: boom');
    });

    it('returns "Unknown error" for non-Error values', () => {
      expect(getErrorDetails('a string').errorMessage).toBe('Unknown error');
      expect(getErrorDetails(undefined).errorMessage).toBe('Unknown error');
      expect(getErrorDetails(null).errorMessage).toBe('Unknown error');
      expect(getErrorDetails({ msg: 'x' }).errorMessage).toBe('Unknown error');
    });

    it('returns undefined stack for non-Error values', () => {
      expect(getErrorDetails('x').errorStack).toBeUndefined();
      expect(getErrorDetails(42).errorStack).toBeUndefined();
    });
  });

  describe('logAndGetErrorDetails', () => {
    let logger: jest.Mocked<Pick<Logger, 'error'>>;

    beforeEach(() => {
      logger = { error: jest.fn() };
    });

    it('logs prefixed message + stack + context', () => {
      const err = new Error('db down');
      const ctx = { userId: 'u1' };
      const details = logAndGetErrorDetails(
        err,
        logger as unknown as Logger,
        'OTP send failed',
        ctx,
      );
      expect(details.errorMessage).toBe('db down');
      expect(logger.error).toHaveBeenCalledWith(
        'OTP send failed: db down',
        expect.stringContaining('Error: db down'),
        ctx,
      );
    });

    it('handles non-Error values', () => {
      const details = logAndGetErrorDetails(
        'oops',
        logger as unknown as Logger,
        'custom',
      );
      expect(details.errorMessage).toBe('Unknown error');
      expect(details.errorStack).toBeUndefined();
      expect(logger.error).toHaveBeenCalledWith(
        'custom: Unknown error',
        undefined,
        undefined,
      );
    });
  });
});
