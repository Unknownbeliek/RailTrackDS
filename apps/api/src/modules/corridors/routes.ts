import type { FastifyInstance } from 'fastify';
import { corridorDetailSchema, corridorListSchema, corridorSlugParamsSchema } from '@railpulse/shared';
import type { AppDeps } from '../../lib/deps';
import { corridorDetailService, listCorridorsService } from './service';

export async function corridorsRoutes(app: FastifyInstance, deps: AppDeps): Promise<void> {
  app.get('/corridors', async () => corridorListSchema.parse(await listCorridorsService(deps.sql)));

  app.get('/corridors/:slug', async (request) => {
    const { slug } = corridorSlugParamsSchema.parse(request.params);
    return corridorDetailSchema.parse(
      await corridorDetailService(deps.sql, slug, deps.now()),
    );
  });
}
