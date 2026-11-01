import type { FastifyInstance } from 'fastify';
import { corridorMapSchema, corridorSlugParamsSchema, mapQuerySchema } from '@railpulse/shared';
import type { AppDeps } from '../../lib/deps';
import { corridorMapService, type MapQuery } from './service';

export async function mapRoutes(app: FastifyInstance, deps: AppDeps): Promise<void> {
  app.get('/corridors/:slug/map', async (request) => {
    const { slug } = corridorSlugParamsSchema.parse(request.params);
    const query = mapQuerySchema.parse(request.query) as MapQuery;
    return corridorMapSchema.parse(await corridorMapService(deps.sql, slug, query, deps.now()));
  });
}
