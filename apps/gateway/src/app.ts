import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import replyFrom from '@fastify/reply-from';
import fastify, { type FastifyInstance } from 'fastify';

import { getConfig } from '@enterprise/config';
import { logger, requestLogger } from '@enterprise/logger';

import { setupRoutes } from './routes/index.js';
import { setupSocketIO } from './websocket/socket.js';
import { setupSSE } from './sse/index.js';

const config = getConfig();

export async function createApp(): Promise<FastifyInstance> {
  const app = fastify({
    logger: false, // We use our custom logger
    requestIdHeader: 'x-request-id',
    requestIdLogLabel: 'requestId',
  });

  // Security middleware
  await app.register(helmet, {
    contentSecurityPolicy: false, // Disable for development
  });

  // CORS
  await app.register(cors, {
    origin: config.CORS_ORIGIN,
    credentials: true,
  });

  // Rate limiting
  await app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
    errorResponseBuilder: () => ({
      success: false,
      error: 'Rate limit exceeded',
      timestamp: new Date().toISOString(),
    }),
  });

  // Request logging
  await app.register(requestLogger);

  // HTTP proxy for microservices
  await app.register(replyFrom, {
    base: 'http://localhost',
  });

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

  // Setup WebSocket
  setupSocketIO(app);

  // Setup SSE
  setupSSE(app);

  // Health check
  app.get('/health', async () => ({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: '1.0.0',
  }));

  return app;
}