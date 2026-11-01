/**
 * One error shape on the wire: { error: { code, message } } (section 11).
 * Unknown failures are logged and reported as INTERNAL, never leaked.
 */
import type { FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import { AppError, ERROR_STATUS, isAppError } from '@railpulse/shared';

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((rawError, request, reply) => {
    const error = rawError as Error & { statusCode?: number };
    if (isAppError(error)) {
      request.log.info({ code: error.code, path: request.url }, 'Handled error');
      return reply
        .status(error.status)
        .send({ error: { code: error.code, message: error.message, details: error.details } });
    }

    if (error instanceof ZodError) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION',
          message: 'The request did not pass validation.',
          details: error.issues.slice(0, 5),
        },
      });
    }

    const status = typeof error.statusCode === 'number' ? error.statusCode : 500;
    if (status >= 500) {
      request.log.error({ err: error, path: request.url }, 'Unhandled error');
    }
    const code = status === 404 ? 'NOT_FOUND' : status === 429 ? 'RATE_LIMITED' : status >= 500 ? 'INTERNAL' : 'VALIDATION';
    return reply.status(ERROR_STATUS[code] ?? status).send({
      error: { code, message: status >= 500 ? 'Something went wrong on our side.' : error.message },
    });
  });

  app.setNotFoundHandler((request, reply) =>
    reply.status(404).send({
      error: { code: 'NOT_FOUND', message: `No route for ${request.method} ${request.url}` },
    }),
  );

  process.on('unhandledRejection', (reason) => {
    app.log.error({ reason }, 'Unhandled promise rejection');
  });
}

/** Throw this from a route when a parameter is missing rather than inventing one. */
export function notFound(what: string): AppError {
  return new AppError('NOT_FOUND', `${what} was not found.`);
}
