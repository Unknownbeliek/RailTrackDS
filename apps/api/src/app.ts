/**
 * Builds the Fastify app. Every module is registered here and nowhere else.
 * Rule N2 in one line: no route below is allowed to reach the provider.
 */
import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { REQUEST_BODY_LIMIT_BYTES } from '@railpulse/shared';
import { registerErrorHandler } from './plugins/error-handler';
import { corridorsRoutes } from './modules/corridors/routes';
import { mapRoutes } from './modules/map/routes';
import { replayRoutes } from './modules/replay/routes';
import { trainsRoutes } from './modules/trains/routes';
import { searchRoutes } from './modules/search/routes';
import { shareRoutes } from './modules/share/routes';
import { adminRoutes } from './modules/admin/routes';
import { healthRoutes } from './modules/health/routes';
import type { AppDeps } from './lib/deps';

export const API_PREFIX = '/api/v1';

export type { AppDeps } from './lib/deps';

export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: deps.config.logLevel,
      redact: ['req.headers.authorization', 'req.headers["x-admin-token"]'],
    },
    bodyLimit: REQUEST_BODY_LIMIT_BYTES,
    trustProxy: true,
  });

  registerErrorHandler(app);

  await app.register(cors, {
    origin: deps.config.corsOrigins.includes('*') ? true : deps.config.corsOrigins,
    methods: ['GET', 'POST'],
  });

  await app.register(rateLimit, {
    max: 240,
    timeWindow: '1 minute',
    // The budget guard is the real limiter for spending; this is only abuse control.
    keyGenerator: (request) => request.ip,
  });

  await app.register(
    async (scoped) => {
      await healthRoutes(scoped, deps);
      await corridorsRoutes(scoped, deps);
      await mapRoutes(scoped, deps);
      await replayRoutes(scoped, deps);
      await trainsRoutes(scoped, deps);
      await searchRoutes(scoped, deps);
      await shareRoutes(scoped, deps);
      await adminRoutes(scoped, deps);
    },
    { prefix: API_PREFIX },
  );

  return app;
}
