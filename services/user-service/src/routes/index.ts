import type { FastifyInstance } from 'fastify';

import { userRoutes } from './users.js';

export function setupRoutes(app: FastifyInstance): void {
  app.register(userRoutes, { prefix: '/users' });
}