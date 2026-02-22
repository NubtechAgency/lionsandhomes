// Servicio de audit logging — registra acciones para trazabilidad
import { Request } from 'express';
import prisma from '../lib/prisma';

interface AuditEntry {
  action: string;
  entityType?: string;
  entityId?: number;
  userId?: number;
  details?: Record<string, unknown>;
  ipAddress?: string;
}

/**
 * Registra una acción en la tabla AuditLog.
 * Envuelto en try/catch — NUNCA crashea la request principal.
 */
export async function logAudit(entry: AuditEntry): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        action: entry.action,
        entityType: entry.entityType || null,
        entityId: entry.entityId || null,
        userId: entry.userId || null,
        details: entry.details ? JSON.stringify(entry.details) : null,
        ipAddress: entry.ipAddress || null,
      },
    });
  } catch (error) {
    // Audit logging nunca debe crashear la request
    console.error('Audit log failed:', error);
  }
}

/**
 * Extrae la IP del cliente (funciona detrás de Traefik/proxy).
 */
export function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') return forwarded.split(',')[0].trim();
  return req.ip || req.socket.remoteAddress || 'unknown';
}
