import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from './auth';
import { prisma } from '../config/database';
import { createContextLogger } from '../utils/logger';

const log = createContextLogger('audit');

export interface AuditContext {
  action: string;
  resource: string;
  resourceId?: string;
  details?: Record<string, any>;
}

/**
 * Log an audit event
 */
export async function auditLog(
  organizationId: string,
  userId: string | undefined,
  context: AuditContext,
  req?: AuthenticatedRequest
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        organizationId,
        userId,
        action: context.action,
        resource: context.resource,
        resourceId: context.resourceId,
        details: context.details || {},
        ipAddress: req?.ip || req?.socket?.remoteAddress,
        userAgent: req?.headers?.['user-agent'],
      },
    });
  } catch (error) {
    log.error('Failed to create audit log', { error, context });
  }
}

/**
 * Express middleware for automatic audit logging
 */
export function auditMiddleware(context: AuditContext) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    const originalSend = res.send.bind(res);

    res.send = function (body: any) {
      // Log after response
      if (req.user?.organizationId) {
        auditLog(req.user.organizationId, req.user.id, {
          ...context,
          details: {
            ...context.details,
            statusCode: res.statusCode,
            method: req.method,
            path: req.path,
          },
        }, req).catch(() => {});
      }
      return originalSend(body);
    };

    next();
  };
}
