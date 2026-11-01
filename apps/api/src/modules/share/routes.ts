import type { FastifyInstance } from 'fastify';
import {
  shareCodeParamsSchema,
  shareCreateBodySchema,
  shareCreateSchema,
  shareViewSchema,
} from '@railpulse/shared';
import type { AppDeps } from '../../lib/deps';
import { createShareService, viewShareService } from './service';

export async function shareRoutes(app: FastifyInstance, deps: AppDeps): Promise<void> {
  app.post('/share', async (request) => {
    const body = shareCreateBodySchema.parse(request.body ?? {});
    const baseUrl = body.baseUrl ?? `${request.protocol}://${request.headers.host ?? 'localhost'}`;
    return shareCreateSchema.parse(
      await createShareService(
        deps.sql,
        { trainNumber: body.trainNumber, journeyDate: body.journeyDate, baseUrl },
        deps.now(),
      ),
    );
  });

  app.get('/share/:code', async (request) => {
    const { code } = shareCodeParamsSchema.parse(request.params);
    return shareViewSchema.parse(await viewShareService(deps.sql, code, deps.now()));
  });
}
