import { randomUUID } from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import { requestContext } from '../context';

/** Creates the per-request context (request id, IP, device) for audit & logging. */
export function contextMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.header('x-request-id');
  const requestId = incoming && /^[A-Za-z0-9-]{8,64}$/.test(incoming) ? incoming : randomUUID();
  res.setHeader('X-Request-Id', requestId);
  requestContext.run(
    {
      requestId,
      ip: req.ip,
      device: req.header('user-agent') ?? undefined,
    },
    () => next(),
  );
}
