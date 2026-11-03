import { HttpException, Logger } from '@nestjs/common';
import { RealtimeErrorCode, type AckFailure, type OrderStatus } from '@app/shared';

export function validationFailure(issues: { message: string }[]): AckFailure {
  return {
    accepted: false,
    errorCode: RealtimeErrorCode.VALIDATION_ERROR,
    message: issues.map((issue) => issue.message).join(', '),
  };
}

/**
 * Exécute une action et traduit les refus métier (HttpException levées par les
 * services, avec leur `errorCode`) en accusé de réception négatif.
 */
export async function withAck<T>(
  logger: Logger,
  action: () => Promise<T>,
): Promise<T | AckFailure> {
  try {
    return await action();
  } catch (err) {
    if (err instanceof HttpException) {
      const response = err.getResponse();
      const body = typeof response === 'object' ? (response as Record<string, unknown>) : {};
      return {
        accepted: false,
        errorCode: (body.errorCode as RealtimeErrorCode | undefined) ?? RealtimeErrorCode.FORBIDDEN,
        message: typeof body.message === 'string' ? body.message : err.message,
        currentStatus: body.currentStatus as OrderStatus | undefined,
      };
    }
    logger.error(err);
    return {
      accepted: false,
      errorCode: RealtimeErrorCode.INTERNAL_ERROR,
      message: 'Erreur interne.',
    };
  }
}
