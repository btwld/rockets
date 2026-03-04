import { Logger } from '@nestjs/common';

/**
 * Interface for error details extracted from unknown error
 */
export interface ErrorDetails {
  errorMessage: string;
  errorStack?: string;
}

/**
 * Extract error details from an unknown error without logging.
 * Useful when you want to handle logging separately.
 *
 * @param error - Unknown error object
 * @returns Object containing errorMessage and errorStack
 */
export function getErrorDetails(error: unknown): ErrorDetails {
  const errorMessage = error instanceof Error ? error.message : 'Unknown error';
  const errorStack = error instanceof Error ? error.stack : undefined;

  return { errorMessage, errorStack };
}

/**
 * Extract error details from an unknown error and log them consistently.
 *
 * @param error - Unknown error object
 * @param logger - NestJS Logger instance
 * @param customMessage - Custom message to prefix the error
 * @param context - Additional context to include in the log
 * @returns Object containing errorMessage and errorStack
 */
export function logAndGetErrorDetails(
  error: unknown,
  logger: Logger,
  customMessage: string,
  context?: Record<string, unknown>,
): ErrorDetails {
  const details = getErrorDetails(error);
  logger.error(
    `${customMessage}: ${details.errorMessage}`,
    details.errorStack,
    context,
  );
  return details;
}
