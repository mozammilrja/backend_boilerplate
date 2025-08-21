import amqp, { type Connection, type Channel, type ConsumeMessage } from 'amqplib';

import { getConfig } from '@enterprise/config';
import { logger } from '@enterprise/logger';
import type { DomainEvent } from '@enterprise/types';

const config = getConfig();

export type EventHandler<T = unknown> = (event: DomainEvent<T>) => Promise<void>;

export interface SubscribeOptions {
  queue?: string;
  durable?: boolean;
  autoDelete?: boolean;
  exclusive?: boolean;
}

export class RabbitEventBus {
  private connection: Connection | null = null;
  private channel: Channel | null = null;
  private readonly exchange = 'domain.events';

  async connect(): Promise<void> {
    try {
      this.connection = await amqp.connect(config.RABBITMQ_URL);
      this.channel = await this.connection.createChannel();

      // Setup exchange
      await this.channel.assertExchange(this.exchange, 'topic', { durable: true });

      // Handle connection errors
      this.connection.on('error', (error) => {
        logger.error({ error }, 'RabbitMQ connection error');
      });

      this.connection.on('close', () => {
        logger.warn('RabbitMQ connection closed');
      });

      logger.info('Connected to RabbitMQ');
    } catch (error) {
      logger.error({ error }, 'Failed to connect to RabbitMQ');
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    try {
      if (this.channel) {
        await this.channel.close();
      }
      if (this.connection) {
        await this.connection.close();
      }
      logger.info('Disconnected from RabbitMQ');
    } catch (error) {
      logger.error({ error }, 'Error disconnecting from RabbitMQ');
    }
  }

  async publish<T>(routingKey: string, payload: T, eventId?: string): Promise<void> {
    if (!this.channel) {
      throw new Error('RabbitMQ channel not initialized');
    }

    const event: DomainEvent<T> = {
      id: eventId || crypto.randomUUID(),
      type: routingKey,
      data: payload,
      timestamp: new Date().toISOString(),
    };

    const message = Buffer.from(JSON.stringify(event));

    try {
      const published = this.channel.publish(this.exchange, routingKey, message, {
        persistent: true,
        messageId: event.id,
        timestamp: Date.now(),
      });

      if (!published) {
        throw new Error('Failed to publish message to RabbitMQ');
      }

      logger.debug({ eventId: event.id, routingKey, payloadSize: message.length }, 'Event published');
    } catch (error) {
      logger.error({ error, routingKey, eventId }, 'Failed to publish event');
      throw error;
    }
  }

  async subscribe<T>(
    routingKey: string,
    handler: EventHandler<T>,
    options: SubscribeOptions = {}
  ): Promise<void> {
    if (!this.channel) {
      throw new Error('RabbitMQ channel not initialized');
    }

    const queueName = options.queue || `${routingKey}.${crypto.randomUUID()}`;

    try {
      const { queue } = await this.channel.assertQueue(queueName, {
        durable: options.durable ?? true,
        autoDelete: options.autoDelete ?? false,
        exclusive: options.exclusive ?? false,
      });

      await this.channel.bindQueue(queue, this.exchange, routingKey);

      await this.channel.consume(
        queue,
        async (msg: ConsumeMessage | null) => {
          if (!msg) return;

          try {
            const event: DomainEvent<T> = JSON.parse(msg.content.toString());
            
            logger.debug(
              { eventId: event.id, eventType: event.type, queue },
              'Processing event'
            );

            await handler(event);

            this.channel!.ack(msg);
            
            logger.debug(
              { eventId: event.id, eventType: event.type },
              'Event processed successfully'
            );
          } catch (error) {
            logger.error(
              { error, queue, messageId: msg.properties.messageId },
              'Failed to process event'
            );

            // Reject message and don't requeue to prevent infinite loops
            this.channel!.nack(msg, false, false);
          }
        },
        { noAck: false }
      );

      logger.info({ routingKey, queue }, 'Subscribed to events');
    } catch (error) {
      logger.error({ error, routingKey }, 'Failed to subscribe to events');
      throw error;
    }
  }

  async subscribeToPattern<T>(
    pattern: string,
    handler: EventHandler<T>,
    options: SubscribeOptions = {}
  ): Promise<void> {
    return this.subscribe(pattern, handler, options);
  }
}

let eventBusInstance: RabbitEventBus | null = null;

export async function getEventBus(): Promise<RabbitEventBus> {
  if (!eventBusInstance) {
    eventBusInstance = new RabbitEventBus();
    await eventBusInstance.connect();
  }
  return eventBusInstance;
}

export async function closeEventBus(): Promise<void> {
  if (eventBusInstance) {
    await eventBusInstance.disconnect();
    eventBusInstance = null;
  }
}