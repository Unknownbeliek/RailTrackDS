import type { FastifyInstance } from 'fastify';
import { corridorSlugParamsSchema, snapshotsQuerySchema, snapshotListSchema } from '@railpulse/shared';
import type { AppDeps } from '../../lib/deps';
import { listSnapshotsService } from './service';

export async function replayRoutes(app: FastifyInstance, deps: AppDeps): Promise<void> {
  app.get('/corridors/:slug/snapshots', async (request) => {
    const { slug } = corridorSlugParamsSchema.parse(request.params);
    const query = snapshotsQuerySchema.parse(request.query);
    return snapshotListSchema.parse(
      await listSnapshotsService(deps.sql, slug, query.date, deps.config.budgetTimezone, deps.now()),
    );
  });
}
