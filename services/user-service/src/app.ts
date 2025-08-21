import helmet from '@fastify/helmet';
import fastify, { type FastifyInstance } from 'fastify';

import { requestLogger } from '@enterprise/logger';

import { setupRoutes } from './routes/index.js';

export async function createApp(): Promise<FastifyInstance> {
  const app = fastify({
    logger: false,
    requestIdHeader: 'x-request-id',
    requestIdLogLabel: 'requestId',
  });

  await app.register(helmet);
  await app.register(requestLogger);

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

  setupRoutes(app);

  app.get('/health', async () => ({
    status: 'healthy',
    service: 'user-service',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  }));

  return app;
}