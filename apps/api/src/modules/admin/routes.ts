import type { FastifyInstance } from 'fastify';
import { adminSnapshotSchema, budgetResponseSchema } from '@railpulse/shared';
import type { AppDeps } from '../../lib/deps';
import { requireAdmin } from '../../plugins/auth';
import { budgetService } from './service';

export async function adminRoutes(app: FastifyInstance, deps: AppDeps): Promise<void> {
  const protect = requireAdmin(deps.config.adminToken);

  app.get('/admin/budget', { preHandler: protect }, async () =>
    budgetResponseSchema.parse(await budgetService(deps.sql, deps.config, deps.now())),
  );

  app.post('/admin/snapshot', { preHandler: protect }, async () =>
    adminSnapshotSchema.parse(await deps.runSnapshot()),
  );
}
