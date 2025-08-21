import type { FastifyInstance } from 'fastify';

import { orderRoutes } from './orders.js';

export function setupRoutes(app: FastifyInstance): void {
  app.register(orderRoutes, { prefix: '/orders' });
}