import { randomUUID } from 'crypto';

import { getConfig, isDevelopment } from '@enterprise/config';
import type { FastifyRequest, FastifyReply } from 'fastify';
import pino from 'pino';

const config = getConfig();

export const logger = pino({
  level: config.LOG_LEVEL,
  ...(isDevelopment() && {
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:standard',
        ignore: 'hostname,pid',
      },
    },
  }),
  formatters: {
    level: (label: string) => ({ level: label }),
  },
  serializers: {
    req: (req) => ({
      method: req.method,
      url: req.url,
      headers: {
        'user-agent': req.headers?.['user-agent'],
        'x-request-id': req.headers?.['x-request-id'],
      },
    }),
    res: (res) => ({
      statusCode: res.statusCode,
    }),
  },
});

export function createChildLogger(context: Record<string, unknown>) {
  return logger.child(context);
}

export function requestLogger() {
  return async function (request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const requestId = request.headers['x-request-id'] || randomUUID();
    
    // Add request ID to headers for downstream services
    reply.header('x-request-id', requestId);
    
    // Create child logger with request context
    request.log = logger.child({ requestId, service: config.OTEL_SERVICE_NAME });
    
    const start = Date.now();
    
    reply.addHook('onSend', async (_request, reply) => {
      const duration = Date.now() - start;
      request.log.info(
        {
          req: request.raw,
          res: reply.raw,
          duration,
        },
        'Request completed'
      );
    });
  };
}

export type Logger = typeof logger;