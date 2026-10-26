import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import { DomainError, ERROR_MESSAGES_AR } from '../errors';
import { currentContext } from '../context';

/**
 * Global RFC 7807 problem+json error format.
 * { type, title, status, code, detail, errors?, requestId }
 */
@Catch()
export class ProblemFilter implements ExceptionFilter {
  private readonly logger = new Logger('Errors');

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    const req = host.switchToHttp().getRequest<Request>();
    const requestId = currentContext()?.requestId;

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_ERROR';
    let detail: string | undefined;
    let errors: unknown;

    if (exception instanceof DomainError) {
      status = exception.status;
      code = exception.code;
      detail = exception.message;
      errors = exception.details;
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse() as any;
      code = body?.code ?? this.codeForStatus(status);
      detail = typeof body === 'string' ? body : body?.message;
      errors = body?.errors;
    } else {
      this.logger.error(`[${requestId}] ${req.method} ${req.url}: ${(exception as Error)?.stack ?? exception}`);
    }

    // Never leak internals in 5xx responses
    if (status >= 500) detail = undefined;

    res
      .status(status)
      .type('application/problem+json')
      .json({
        type: `https://idham.erp/errors/${code}`,
        title: ERROR_MESSAGES_AR[code] ?? ERROR_MESSAGES_AR[code.split(' ')[0]] ?? code,
        status,
        code,
        detail,
        errors,
        requestId,
      });
  }

  private codeForStatus(status: number): string {
    switch (status) {
      case 400:
        return 'VALIDATION_FAILED';
      case 401:
        return 'UNAUTHENTICATED';
      case 403:
        return 'FORBIDDEN';
      case 404:
        return 'NOT_FOUND';
      case 409:
        return 'CONFLICT';
      case 429:
        return 'TOO_MANY_REQUESTS';
      default:
        return 'HTTP_ERROR';
    }
  }
}
