import { getEventBus } from '@enterprise/event-bus';
import { logger } from '@enterprise/logger';
import { traceEventConsume } from '@enterprise/observability';
import type {
  DomainEvent,
  OrderCreatedEvent,
  OrderUpdatedEvent,
  UserCreatedEvent,
  ProductUpdatedEvent,
  NotificationChannel,
} from '@enterprise/types';

import { notificationRepository } from '../repositories/notification.repository.js';
import { sendNotification } from '../services/notification.service.js';

export async function setupEventConsumers(): Promise<void> {
  const eventBus = await getEventBus();

  // Handle user created events
  await eventBus.subscribe<UserCreatedEvent>(
    'user.created',
    async (event: DomainEvent<UserCreatedEvent>) => {
      await traceEventConsume('notifications.user-created', 'user.created', async () => {
        try {
          const { userId, email } = event.data;

          const notification = await notificationRepository.create({
            userId,
            type: 'system',
            title: 'Welcome to our platform!',
            message: 'Thank you for joining us. Explore our features and start your journey.',
            channels: ['email', 'in-app'] as NotificationChannel[],
            data: {
              eventType: 'user.created',
              email,
            },
          });

          await sendNotification(notification);

          logger.info({ userId, notificationId: notification.id }, 'Welcome notification sent');
        } catch (error) {
          logger.error({ error, event }, 'Failed to process user.created event');
        }
      });
    },
    { queue: 'notifications.user.created' }
  );

  // Handle order created events
  await eventBus.subscribe<OrderCreatedEvent>(
    'order.created',
    async (event: DomainEvent<OrderCreatedEvent>) => {
      await traceEventConsume('notifications.order-created', 'order.created', async () => {
        try {
          const { orderId, userId, totals } = event.data;

          const notification = await notificationRepository.create({
            userId,
            type: 'order',
            title: 'Order Confirmation',
            message: `Your order #${orderId} has been placed successfully. Total: $${totals.total.toFixed(2)}`,
            channels: ['email', 'push', 'in-app'] as NotificationChannel[],
            data: {
              eventType: 'order.created',
              orderId,
              total: totals.total,
            },
          });

          await sendNotification(notification);

          logger.info(
            { orderId, userId, notificationId: notification.id },
            'Order created notification sent'
          );
        } catch (error) {
          logger.error({ error, event }, 'Failed to process order.created event');
        }
      });
    },
    { queue: 'notifications.order.created' }
  );

  // Handle order updated events
  await eventBus.subscribe<OrderUpdatedEvent>(
    'order.updated',
    async (event: DomainEvent<OrderUpdatedEvent>) => {
      await traceEventConsume('notifications.order-updated', 'order.updated', async () => {
        try {
          const { orderId, userId, currentStatus, previousStatus } = event.data;

          // Only send notifications for meaningful status changes
          if (currentStatus === previousStatus) return;

          let title = 'Order Update';
          let message = `Your order #${orderId} status has been updated.`;

          switch (currentStatus) {
            case 'confirmed':
              title = 'Order Confirmed';
              message = `Your order #${orderId} has been confirmed and is being prepared.`;
              break;
            case 'shipped':
              title = 'Order Shipped';
              message = `Good news! Your order #${orderId} has been shipped and is on its way.`;
              break;
            case 'delivered':
              title = 'Order Delivered';
              message = `Your order #${orderId} has been delivered. We hope you enjoy your purchase!`;
              break;
            case 'cancelled':
              title = 'Order Cancelled';
              message = `Your order #${orderId} has been cancelled. If you have questions, please contact support.`;
              break;
          }

          const notification = await notificationRepository.create({
            userId,
            type: 'order',
            title,
            message,
            channels: ['push', 'in-app'] as NotificationChannel[],
            data: {
              eventType: 'order.updated',
              orderId,
              currentStatus,
              previousStatus,
            },
          });

          await sendNotification(notification);

          logger.info(
            {
              orderId,
              userId,
              status: currentStatus,
              notificationId: notification.id,
            },
            'Order updated notification sent'
          );
        } catch (error) {
          logger.error({ error, event }, 'Failed to process order.updated event');
        }
      });
    },
    { queue: 'notifications.order.updated' }
  );

  // Handle product updated events (for low stock alerts)
  await eventBus.subscribe<ProductUpdatedEvent>(
    'product.updated',
    async (event: DomainEvent<ProductUpdatedEvent>) => {
      await traceEventConsume('notifications.product-updated', 'product.updated', async () => {
        try {
          const { productId, changes, currentStock } = event.data;

          // Only alert for low stock situations
          if (currentStock !== undefined && currentStock <= 5 && currentStock > 0) {
            // This would typically be sent to admin users
            // For demo purposes, we'll log it
            logger.warn(
              { productId, currentStock },
              'Low stock alert - would notify admin users'
            );
          }
        } catch (error) {
          logger.error({ error, event }, 'Failed to process product.updated event');
        }
      });
    },
    { queue: 'notifications.product.updated' }
  );

  logger.info('Notification event consumers initialized');
}