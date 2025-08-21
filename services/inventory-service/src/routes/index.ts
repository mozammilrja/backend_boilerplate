import type { FastifyInstance } from 'fastify';

import { inventoryRoutes } from './inventory.js';

export function setupRoutes(app: FastifyInstance): void {
  app.register(inventoryRoutes, { prefix: '/inventory' });
}