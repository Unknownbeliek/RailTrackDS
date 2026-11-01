import type { FastifyInstance } from 'fastify';
import { nearbyQuerySchema, nearbySchema, trainDetailSchema, trainNumberParamsSchema } from '@railpulse/shared';
import type { AppDeps } from '../../lib/deps';
import { nearbyService, trainDetailService } from './service';

export async function trainsRoutes(app: FastifyInstance, deps: AppDeps): Promise<void> {
  app.get('/trains/:number', async (request) => {
    const { number } = trainNumberParamsSchema.parse(request.params);
    return trainDetailSchema.parse(
      await trainDetailService(deps.sql, number, {}, deps.now()),
    );
  });

  app.get('/trains/:number/nearby', async (request) => {
    const { number } = trainNumberParamsSchema.parse(request.params);
    const query = nearbyQuerySchema.parse(request.query);
    return nearbySchema.parse(
      await nearbyService(
        deps.sql,
        number,
        { snapshot: query.snapshot, corridorSlug: query.corridor },
        deps.now(),
      ),
    );
  });
}
