import { createServer } from 'http';

import { getConfig } from '@enterprise/config';
import { logger, requestLogger } from '@enterprise/logger';
import { initializeObservability, shutdownObservability } from '@enterprise/observability';

import { createApp } from './app.js';

const config = getConfig();

async function startGateway(): Promise<void> {
  try {
    // Initialize observability
    initializeObservability('gateway');

    // Create Fastify app
    const app = await createApp();

    // Create HTTP server for Socket.IO
    const server = createServer();
    app.server = server;

    // Start server
    await app.listen({
      host: '0.0.0.0',
      port: config.GATEWAY_PORT,
      server,
    });

    logger.info(
      {
        port: config.GATEWAY_PORT,
        env: config.NODE_ENV,
      },
      'Gateway started successfully'
    );

    // Graceful shutdown
    const shutdown = async (signal: string): Promise<void> => {
      logger.info(`Received ${signal}, shutting down gateway...`);
      
      try {
        await app.close();
        await shutdownObservability();
        logger.info('Gateway shutdown complete');
        process.exit(0);
      } catch (error) {
        logger.error({ error }, 'Error during shutdown');
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

  } catch (error) {
    logger.error({ error }, 'Failed to start gateway');
    process.exit(1);
  }
}

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.fatal({ error }, 'Uncaught exception');
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.fatal({ reason, promise }, 'Unhandled rejection');
  process.exit(1);
});

startGateway();