import { Logger } from '@nestjs/common';

export interface ErrorDetails {
  readonly errorMessage: string;
  readonly errorStack?: string;
}

export function getErrorDetails(error: unknown): ErrorDetails {
  const errorMessage = error instanceof Error ? error.message : 'Unknown error';
  const errorStack = error instanceof Error ? error.stack : undefined;

  return { errorMessage, errorStack };
}

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
