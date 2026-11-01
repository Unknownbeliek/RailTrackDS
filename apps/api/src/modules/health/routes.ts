import type { FastifyInstance } from 'fastify';
import { healthSchema } from '@railpulse/shared';
import type { AppDeps } from '../../lib/deps';

export async function healthRoutes(app: FastifyInstance, deps: AppDeps): Promise<void> {
  app.get('/health', async () =>
    healthSchema.parse({
      status: 'ok',
      providerMode: deps.providerMode,
      now: deps.now().toISOString(),
      version: deps.version,
    }),
  );
}
