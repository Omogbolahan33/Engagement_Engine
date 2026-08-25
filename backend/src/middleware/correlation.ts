import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';

/**
 * Correlation ID Middleware
 * Assigns a unique ID to every request for distributed tracing
 * Propagates through logs, queue jobs, and webhook deliveries
 */

declare global {
  namespace Express {
    interface Request {
      correlationId?: string;
    }
  }
}

export function correlationId() {
  return (req: Request, res: Response, next: NextFunction): void => {
    // Use client-provided ID or generate one
    const id = (req.headers['x-correlation-id'] as string) || randomUUID();
    req.correlationId = id;

    // Set response header
    res.setHeader('X-Correlation-Id', id);

    next();
  };
}
