import type { FastifyInstance } from 'fastify';

import { authRoutes } from './auth.js';

export function setupRoutes(app: FastifyInstance): void {
  app.register(authRoutes, { prefix: '/auth' });
}