import { Logger } from '@nestjs/common';
import {
  getErrorDetails,
  logAndGetErrorDetails,
} from './error-logging.helper';

describe('error-logging.helper (e2e coverage)', () => {
  it('covers getErrorDetails for Error and non-Error values', () => {
    expect(getErrorDetails(new Error('e')).errorMessage).toBe('e');
    expect(getErrorDetails('plain').errorMessage).toBe('Unknown error');
  });

  it('covers logAndGetErrorDetails', () => {
    const logger = {
      error: jest.fn(),
    } as unknown as Logger;
    const out = logAndGetErrorDetails(
      new Error('x'),
      logger,
      'ctx',
      { id: '1' },
    );
    expect(out.errorMessage).toBe('x');
    expect(logger.error).toHaveBeenCalled();
  });
});
