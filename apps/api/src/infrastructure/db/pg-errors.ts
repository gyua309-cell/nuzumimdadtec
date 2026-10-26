import { HttpStatus } from '@nestjs/common';
import { DomainError } from '../../shared/errors';

/**
 * Translate PostgreSQL errors into stable domain errors.
 * - P0001 raised by our triggers: message starts with the error CODE.
 * - 23505 unique violation -> DUPLICATE (409)
 * - 23503 FK violation     -> REFERENCED / INVALID_REFERENCE
 * - 23514 check violation  -> VALIDATION_FAILED
 * - 23P01 exclusion        -> OVERLAPPING_PERIOD (effective dating)
 * - 40001 serialization    -> CONFLICT
 */
export function mapPgError(e: unknown): unknown {
  if (e instanceof DomainError) return e;
  const err = e as { code?: string; message?: string; constraint?: string; detail?: string; table?: string };
  if (!err || typeof err !== 'object' || !err.code) return e;

  switch (err.code) {
    case 'P0001': {
      const msg = err.message ?? '';
      const code = msg.split(/\s+/)[0] || 'BUSINESS_RULE_VIOLATION';
      return new DomainError(code, msg, HttpStatus.UNPROCESSABLE_ENTITY);
    }
    case '23505':
      return new DomainError('DUPLICATE', err.detail ?? err.message, HttpStatus.CONFLICT, { constraint: err.constraint });
    case '23503':
      return new DomainError(
        err.message?.includes('still referenced') || err.detail?.includes('is still referenced') ? 'REFERENCED' : 'INVALID_REFERENCE',
        err.detail ?? err.message,
        HttpStatus.CONFLICT,
        { constraint: err.constraint },
      );
    case '23514':
      return new DomainError('VALIDATION_FAILED', err.message, HttpStatus.UNPROCESSABLE_ENTITY, { constraint: err.constraint });
    case '23P01':
      return new DomainError('OVERLAPPING_PERIOD', err.detail ?? err.message, HttpStatus.CONFLICT, {
        constraint: err.constraint,
      });
    case '23502':
      return new DomainError('VALIDATION_FAILED', err.message, HttpStatus.UNPROCESSABLE_ENTITY);
    case '40001':
    case '40P01':
      return new DomainError('CONFLICT', err.message, HttpStatus.CONFLICT);
    case '22P02':
      return new DomainError('VALIDATION_FAILED', err.message, HttpStatus.BAD_REQUEST);
    default:
      return e;
  }
}
