import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import fastify, { type FastifyInstance } from 'fastify';

import { logger, requestLogger } from '@enterprise/logger';

import { setupRoutes } from './routes/index.js';

export async function createApp(): Promise<FastifyInstance> {
  const app = fastify({
    logger: false,
    requestIdHeader: 'x-request-id',
    requestIdLogLabel: 'requestId',
  });

  // Security middleware
  await app.register(helmet);

  // Rate limiting - more restrictive for auth endpoints
  await app.register(rateLimit, {
    max: 10,
    timeWindow: '1 minute',
    errorResponseBuilder: () => ({
      success: false,
      error: 'Too many requests, please try again later',
      timestamp: new Date().toISOString(),
    }),
  });

  // Request logging
  await app.register(requestLogger);

  // Global error handler
  app.setErrorHandler(async (error, request, reply) => {
    request.log.error({ error }, 'Request error');

    const statusCode = error.statusCode || 500;
    const message = statusCode === 500 ? 'Internal server error' : error.message;

    reply.code(statusCode).send({
      success: false,
      error: message,
      timestamp: new Date().toISOString(),
      requestId: request.id,
    });
  });

  // Setup routes
  setupRoutes(app);

  // Health check
  app.get('/health', async () => ({
    status: 'healthy',
    service: 'auth-service',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  }));

  return app;
}