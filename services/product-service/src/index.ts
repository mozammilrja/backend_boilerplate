import { getConfig } from '@enterprise/config';
import { connectDB, setupGracefulShutdown } from '@enterprise/db';
import { closeEventBus } from '@enterprise/event-bus';
import { logger } from '@enterprise/logger';
import { initializeObservability, shutdownObservability } from '@enterprise/observability';

import { createApp } from './app.js';

const config = getConfig();

async function startService(): Promise<void> {
  try {
    initializeObservability('product-service');
    await connectDB();
    
    const app = await createApp();
    
    await app.listen({
      host: '0.0.0.0',
      port: config.PRODUCT_SERVICE_PORT,
    });

    logger.info(
      { port: config.PRODUCT_SERVICE_PORT, env: config.NODE_ENV },
      'Product service started successfully'
    );

    setupGracefulShutdown();

    const shutdown = async (signal: string): Promise<void> => {
      logger.info(`Received ${signal}, shutting down product service...`);
      
      try {
        await app.close();
        await closeEventBus();
        await shutdownObservability();
        logger.info('Product service shutdown complete');
        process.exit(0);
      } catch (error) {
        logger.error({ error }, 'Error during shutdown');
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

  } catch (error) {
    logger.error({ error }, 'Failed to start product service');
    process.exit(1);
  }
}

process.on('uncaughtException', (error) => {
  logger.fatal({ error }, 'Uncaught exception');
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.fatal({ reason, promise }, 'Unhandled rejection');
  process.exit(1);
});

startService();