import type { FastifyInstance } from 'fastify';

import { productRoutes } from './products.js';

export function setupRoutes(app: FastifyInstance): void {
  app.register(productRoutes, { prefix: '/products' });
}