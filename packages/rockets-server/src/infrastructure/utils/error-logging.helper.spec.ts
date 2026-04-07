import { Logger } from '@nestjs/common';
import {
  logAndGetErrorDetails,
  getErrorDetails,
  ErrorDetails,
} from './error-logging.helper';

describe('ErrorLoggingHelper', () => {
  let mockLogger: jest.Mocked<
    Pick<Logger, 'error' | 'log' | 'warn' | 'debug' | 'verbose'>
  >;

  beforeEach(() => {
    mockLogger = {
      error: jest.fn(),
      log: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
      verbose: jest.fn(),
    };
  });

  describe('logAndGetErrorDetails', () => {
    it('should handle Error instance correctly', () => {
      const error = new Error('Test error message');
      const customMessage = 'Operation failed';
      const context = { userId: 'user-123', operation: 'test' };

      const result = logAndGetErrorDetails(
        error,
        mockLogger as unknown as Logger,
        customMessage,
        context,
      );

      expect(result.errorMessage).toBe('Test error message');
      expect(result.errorStack).toBe(error.stack);
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Operation failed: Test error message',
        error.stack,
        context,
      );
    });

    it('should handle non-Error objects correctly', () => {
      const error = 'String error';
      const customMessage = 'Operation failed';
      const context = { userId: 'user-123' };

      const result = logAndGetErrorDetails(
        error,
        mockLogger as unknown as Logger,
        customMessage,
        context,
      );

      expect(result.errorMessage).toBe('Unknown error');
      expect(result.errorStack).toBeUndefined();
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Operation failed: Unknown error',
        undefined,
        context,
      );
    });

    it('should handle null/undefined errors correctly', () => {
      const error = null;
      const customMessage = 'Operation failed';

      const result = logAndGetErrorDetails(
        error,
        mockLogger as unknown as Logger,
        customMessage,
      );

      expect(result.errorMessage).toBe('Unknown error');
      expect(result.errorStack).toBeUndefined();
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Operation failed: Unknown error',
        undefined,
        undefined,
      );
    });

    it('should work without context parameter', () => {
      const error = new Error('Test error');
      const customMessage = 'Operation failed';

      const result = logAndGetErrorDetails(
        error,
        mockLogger as unknown as Logger,
        customMessage,
      );

      expect(result.errorMessage).toBe('Test error');
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Operation failed: Test error',
        error.stack,
        undefined,
      );
    });
  });

  describe('getErrorDetails', () => {
    it('should extract details from Error instance without logging', () => {
      const error = new Error('Test error message');

      const result = getErrorDetails(error);

      expect(result.errorMessage).toBe('Test error message');
      expect(result.errorStack).toBe(error.stack);
      expect(mockLogger.error).not.toHaveBeenCalled();
    });

    it('should handle non-Error objects without logging', () => {
      const error = { message: 'Object error' };

      const result = getErrorDetails(error);

      expect(result.errorMessage).toBe('Unknown error');
      expect(result.errorStack).toBeUndefined();
      expect(mockLogger.error).not.toHaveBeenCalled();
    });

    it('should handle Error with custom properties', () => {
      class CustomError extends Error {
        constructor(message: string, public code: string) {
          super(message);
          this.name = 'CustomError';
        }
      }
      const error = new CustomError('Custom error message', 'ERR_001');

      const result = getErrorDetails(error);

      expect(result.errorMessage).toBe('Custom error message');
      expect(result.errorStack).toBe(error.stack);
    });
  });

  describe('ErrorDetails interface', () => {
    it('should have correct type structure', () => {
      const error = new Error('Test');

      const result: ErrorDetails = getErrorDetails(error);

      expect(typeof result.errorMessage).toBe('string');
      expect(
        typeof result.errorStack === 'string' ||
          result.errorStack === undefined,
      ).toBe(true);
    });
  });
});
