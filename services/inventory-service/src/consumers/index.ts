import { getEventBus } from '@enterprise/event-bus';
import { logger } from '@enterprise/logger';
import { traceEventConsume } from '@enterprise/observability';
import type {
  DomainEvent,
  OrderCreatedEvent,
  OrderUpdatedEvent,
  ProductCreatedEvent,
} from '@enterprise/types';

import { inventoryRepository } from '../repositories/inventory.repository.js';
import { reservationRepository } from '../repositories/reservation.repository.js';

export async function setupEventConsumers(): Promise<void> {
  const eventBus = await getEventBus();

  // Handle product created events - create inventory item
  await eventBus.subscribe<ProductCreatedEvent>(
    'product.created',
    async (event: DomainEvent<ProductCreatedEvent>) => {
      await traceEventConsume('inventory.product-created', 'product.created', async () => {
        try {
          const { productId, sku, stock } = event.data;

          // Create inventory item for new product
          const inventoryItem = await inventoryRepository.create({
            productId,
            sku,
            available: stock,
            reserved: 0,
            total: stock,
            reorderLevel: Math.max(10, Math.floor(stock * 0.1)), // 10% of initial stock or minimum 10
          });

          logger.info(
            { productId, sku, inventoryId: inventoryItem.id },
            'Inventory item created for new product'
          );
        } catch (error) {
          logger.error({ error, event }, 'Failed to process product.created event');
        }
      });
    },
    { queue: 'inventory.product.created' }
  );

  // Handle order created events - confirm reservations
  await eventBus.subscribe<OrderCreatedEvent>(
    'order.created',
    async (event: DomainEvent<OrderCreatedEvent>) => {
      await traceEventConsume('inventory.order-created', 'order.created', async () => {
        try {
          const { orderId, items } = event.data;

          // Find and confirm reservations for this order
          const reservations = await reservationRepository.findByOrderId(orderId);

          for (const reservation of reservations) {
            if (reservation.status === 'pending') {
              await reservationRepository.confirmReservation(reservation.id);
              
              logger.info(
                { reservationId: reservation.id, orderId, productId: reservation.productId },
                'Inventory reservation confirmed'
              );
            }
          }
        } catch (error) {
          logger.error({ error, event }, 'Failed to process order.created event');
        }
      });
    },
    { queue: 'inventory.order.created' }
  );

  // Handle order updated events - release reservations for cancelled orders
  await eventBus.subscribe<OrderUpdatedEvent>(
    'order.updated',
    async (event: DomainEvent<OrderUpdatedEvent>) => {
      await traceEventConsume('inventory.order-updated', 'order.updated', async () => {
        try {
          const { orderId, currentStatus } = event.data;

          if (currentStatus === 'cancelled') {
            // Release all reservations for cancelled order
            const reservations = await reservationRepository.findByOrderId(orderId);

            for (const reservation of reservations) {
              if (reservation.status === 'pending' || reservation.status === 'confirmed') {
                // Release the reservation
                await reservationRepository.releaseReservation(reservation.id);

                // Return stock to available inventory
                await inventoryRepository.release(reservation.productId, reservation.quantity);

                logger.info(
                  { reservationId: reservation.id, orderId, productId: reservation.productId },
                  'Inventory reservation released due to order cancellation'
                );
              }
            }
          }
        } catch (error) {
          logger.error({ error, event }, 'Failed to process order.updated event');
        }
      });
    },
    { queue: 'inventory.order.updated' }
  );

  // Periodic cleanup of expired reservations
  setInterval(async () => {
    try {
      const expiredReservations = await reservationRepository.findExpired();

      for (const reservation of expiredReservations) {
        // Release expired reservation
        await reservationRepository.releaseReservation(reservation.id);

        // Return stock to available inventory
        await inventoryRepository.release(reservation.productId, reservation.quantity);

        logger.info(
          { reservationId: reservation.id, orderId: reservation.orderId },
          'Expired inventory reservation cleaned up'
        );
      }

      if (expiredReservations.length > 0) {
        logger.info(
          { count: expiredReservations.length },
          'Cleaned up expired inventory reservations'
        );
      }
    } catch (error) {
      logger.error({ error }, 'Failed to cleanup expired reservations');
    }
  }, 5 * 60 * 1000); // Run every 5 minutes

  logger.info('Inventory event consumers initialized');
}