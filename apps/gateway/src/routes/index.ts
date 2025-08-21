import type { FastifyInstance } from 'fastify';

import { getConfig } from '@enterprise/config';

const config = getConfig();

export function setupRoutes(app: FastifyInstance): void {
  // Proxy routes to microservices
  const services = [
    { prefix: '/api/auth', target: `http://localhost:${config.AUTH_SERVICE_PORT}` },
    { prefix: '/api/users', target: `http://localhost:${config.USER_SERVICE_PORT}` },
    { prefix: '/api/products', target: `http://localhost:${config.PRODUCT_SERVICE_PORT}` },
    { prefix: '/api/orders', target: `http://localhost:${config.ORDER_SERVICE_PORT}` },
    { prefix: '/api/notifications', target: `http://localhost:${config.NOTIFICATION_SERVICE_PORT}` },
    { prefix: '/api/inventory', target: `http://localhost:${config.INVENTORY_SERVICE_PORT}` },
  ];

  services.forEach(({ prefix, target }) => {
    app.register(async (fastify) => {
      fastify.addHook('preHandler', fastify.rateLimit());

      fastify.all('/*', async (request, reply) => {
        const url = request.url.replace(prefix, '');
        
        reply.from(target + url, {
          rewriteRequestHeaders: (originalReq, headers) => ({
            ...headers,
            'x-request-id': originalReq.headers['x-request-id'],
            'x-forwarded-for': originalReq.ip,
            'x-gateway-timestamp': new Date().toISOString(),
          }),
        });
      });
    }, { prefix });
  });

  // Gateway-specific routes
  app.get('/api/gateway/status', async () => ({
    gateway: 'operational',
    services: services.map(({ prefix, target }) => ({
      prefix,
      target,
      status: 'proxy-configured',
    })),
    timestamp: new Date().toISOString(),
  }));
}