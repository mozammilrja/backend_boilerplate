import type { FastifyInstance } from 'fastify';

import { notificationRoutes } from './notifications.js';

export function setupRoutes(app: FastifyInstance): void {
  app.register(notificationRoutes, { prefix: '/notifications' });
}