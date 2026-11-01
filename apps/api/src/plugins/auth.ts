/**
 * Admin routes need a long random token (section 13). Empty ADMIN_TOKEN means
 * admin routes are closed, not open.
 */
import { timingSafeEqual } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { AppError } from '@railpulse/shared';

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function requireAdmin(adminToken: string) {
  return async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    if (!adminToken) {
      throw new AppError('UNAUTHORIZED', 'Admin routes are disabled. Set ADMIN_TOKEN.');
    }
    const header = request.headers['x-admin-token'];
    const bearer = request.headers.authorization?.replace(/^Bearer\s+/i, '');
    const presented = typeof header === 'string' ? header : bearer;
    if (!presented || !safeEqual(presented, adminToken)) {
      throw new AppError('UNAUTHORIZED', 'A valid admin token is required.');
    }
  };
}
