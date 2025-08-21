import { getConfig } from '@enterprise/config';
import { connectDB, setupGracefulShutdown } from '@enterprise/db';
import { closeEventBus } from '@enterprise/event-bus';
import { logger } from '@enterprise/logger';
import { initializeObservability, shutdownObservability } from '@enterprise/observability';

import { createApp } from './app.js';
import { setupEventConsumers } from './consumers/index.js';

const config = getConfig();

async function startService(): Promise<void> {
  try {
    initializeObservability('notification-service');
    await connectDB();
    
    // Setup event consumers
    await setupEventConsumers();
    
    const app = await createApp();
    
    await app.listen({
      host: '0.0.0.0',
      port: config.NOTIFICATION_SERVICE_PORT,
    });

    logger.info(
      { port: config.NOTIFICATION_SERVICE_PORT, env: config.NODE_ENV },
      'Notification service started successfully'
    );

    setupGracefulShutdown();

    const shutdown = async (signal: string): Promise<void> => {
      logger.info(`Received ${signal}, shutting down notification service...`);
      
      try {
        await app.close();
        await closeEventBus();
        await shutdownObservability();
        logger.info('Notification service shutdown complete');
        process.exit(0);
      } catch (error) {
        logger.error({ error }, 'Error during shutdown');
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

  } catch (error) {
    logger.error({ error }, 'Failed to start notification service');
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