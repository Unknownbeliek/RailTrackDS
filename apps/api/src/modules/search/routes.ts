import type { FastifyInstance } from 'fastify';
import { searchQuerySchema, searchResultSchema } from '@railpulse/shared';
import type { AppDeps } from '../../lib/deps';
import { searchService } from './service';

export async function searchRoutes(app: FastifyInstance, deps: AppDeps): Promise<void> {
  app.get('/search', async (request) => {
    const { q } = searchQuerySchema.parse(request.query);
    return searchResultSchema.parse(await searchService(deps.sql, q, deps.now()));
  });
}
