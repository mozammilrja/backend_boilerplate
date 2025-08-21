import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

import { requireAuth, requireRoles } from '@enterprise/auth';
import { getEventBus } from '@enterprise/event-bus';
import { logger } from '@enterprise/logger';
import { traceBusiness } from '@enterprise/observability';
import type {
  ApiResponse,
  PaginatedResponse,
  PaginationQuery,
  InventoryReservedEvent,
  InventoryReleasedEvent,
} from '@enterprise/types';
import {
  validateBody,
  validateQuery,
  validateParams,
  createInventorySchema,
  updateInventorySchema,
  reserveInventorySchema,
  paginationSchema,
  idSchema,
} from '@enterprise/validation';

import { inventoryRepository } from '../repositories/inventory.repository.js';
import { reservationRepository } from '../repositories/reservation.repository.js';

export async function inventoryRoutes(fastify: FastifyInstance): Promise<void> {
  // Get all inventory items
  fastify.get<{ Querystring: PaginationQuery }>(
    '/',
    {
      preHandler: [requireAuth(), requireRoles('admin'), validateQuery(paginationSchema)],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { page, limit, sort, order } = request.validatedQuery as PaginationQuery;

      try {
        const skip = (page - 1) * limit;
        const sortField = sort || 'createdAt';
        const sortOrder = order === 'asc' ? 1 : -1;

        const [items, total] = await Promise.all([
          inventoryRepository.findMany(
            {},
            {
              skip,
              limit,
              sort: { [sortField]: sortOrder },
            }
          ),
          inventoryRepository.count(),
        ]);

        const totalPages = Math.ceil(total / limit);

        const response: PaginatedResponse<typeof items[0]> = {
          success: true,
          data: items.map(item => ({
            id: item.id,
            productId: item.productId,
            sku: item.sku,
            available: item.available,
            reserved: item.reserved,
            total: item.total,
            reorderLevel: item.reorderLevel,
            createdAt: item.createdAt,
            updatedAt: item.updatedAt,
          })),
          pagination: {
            page,
            limit,
            total,
            pages: totalPages,
            hasNext: page < totalPages,
            hasPrev: page > 1,
          },
          timestamp: new Date().toISOString(),
        };

        reply.send(response);
      } catch (error) {
        logger.error({ error }, 'Failed to get inventory items');
        throw error;
      }
    }
  );

  // Get inventory item by product ID
  fastify.get<{ Params: { productId: string } }>(
    '/product/:productId',
    {
      preHandler: [requireAuth(), validateParams({ productId: idSchema.shape.id })],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { productId } = request.params as { productId: string };

      try {
        const item = await inventoryRepository.findByProductId(productId);
        if (!item) {
          reply.code(404).send({
            success: false,
            error: 'Inventory item not found',
            timestamp: new Date().toISOString(),
          });
          return;
        }

        const response: ApiResponse<typeof item> = {
          success: true,
          data: {
            id: item.id,
            productId: item.productId,
            sku: item.sku,
            available: item.available,
            reserved: item.reserved,
            total: item.total,
            reorderLevel: item.reorderLevel,
            createdAt: item.createdAt,
            updatedAt: item.updatedAt,
          },
          timestamp: new Date().toISOString(),
        };

        reply.send(response);
      } catch (error) {
        logger.error({ error, productId }, 'Failed to get inventory item');
        throw error;
      }
    }
  );

  // Create inventory item (admin only)
  fastify.post<{ Body: any }>(
    '/',
    {
      preHandler: [requireAuth(), requireRoles('admin'), validateBody(createInventorySchema)],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const inventoryData = request.validatedBody as any;

      return traceBusiness('createInventory', 'inventory', inventoryData.productId, async () => {
        try {
          // Check if inventory already exists for this product
          const existing = await inventoryRepository.findByProductId(inventoryData.productId);
          if (existing) {
            reply.code(409).send({
              success: false,
              error: 'Inventory item already exists for this product',
              timestamp: new Date().toISOString(),
            });
            return;
          }

          const item = await inventoryRepository.create({
            ...inventoryData,
            available: inventoryData.total,
            reserved: 0,
          });

          logger.info({ inventoryId: item.id, productId: inventoryData.productId }, 'Inventory item created');

          const response: ApiResponse<typeof item> = {
            success: true,
            data: {
              id: item.id,
              productId: item.productId,
              sku: item.sku,
              available: item.available,
              reserved: item.reserved,
              total: item.total,
              reorderLevel: item.reorderLevel,
              createdAt: item.createdAt,
              updatedAt: item.updatedAt,
            },
            timestamp: new Date().toISOString(),
          };

          reply.code(201).send(response);
        } catch (error) {
          logger.error({ error, productId: inventoryData.productId }, 'Failed to create inventory item');
          throw error;
        }
      });
    }
  );

  // Update inventory item (admin only)
  fastify.patch<{ Params: { id: string }; Body: any }>(
    '/:id',
    {
      preHandler: [
        requireAuth(),
        requireRoles('admin'),
        validateParams(idSchema),
        validateBody(updateInventorySchema),
      ],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.validatedParams as { id: string };
      const updateData = request.validatedBody as any;

      return traceBusiness('updateInventory', 'inventory', id, async () => {
        try {
          const existingItem = await inventoryRepository.findById(id);
          if (!existingItem) {
            reply.code(404).send({
              success: false,
              error: 'Inventory item not found',
              timestamp: new Date().toISOString(),
            });
            return;
          }

          // If total is being updated, adjust available quantity
          if (updateData.total !== undefined) {
            const totalChange = updateData.total - existingItem.total;
            updateData.available = existingItem.available + totalChange;
          }

          const updatedItem = await inventoryRepository.updateById(id, updateData);

          logger.info({ inventoryId: id, changes: updateData }, 'Inventory item updated');

          const response: ApiResponse<typeof updatedItem> = {
            success: true,
            data: {
              id: updatedItem!.id,
              productId: updatedItem!.productId,
              sku: updatedItem!.sku,
              available: updatedItem!.available,
              reserved: updatedItem!.reserved,
              total: updatedItem!.total,
              reorderLevel: updatedItem!.reorderLevel,
              createdAt: updatedItem!.createdAt,
              updatedAt: updatedItem!.updatedAt,
            },
            timestamp: new Date().toISOString(),
          };

          reply.send(response);
        } catch (error) {
          logger.error({ error, inventoryId: id }, 'Failed to update inventory item');
          throw error;
        }
      });
    }
  );

  // Reserve inventory
  fastify.post<{ Body: any }>(
    '/reserve',
    {
      preHandler: [requireAuth(), validateBody(reserveInventorySchema)],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const reservationData = request.validatedBody as any;
      const { orderId, productId, quantity, expiresIn } = reservationData;

      return traceBusiness('reserveInventory', 'inventory', productId, async () => {
        try {
          const inventoryItem = await inventoryRepository.findByProductId(productId);
          if (!inventoryItem) {
            reply.code(404).send({
              success: false,
              error: 'Inventory item not found',
              timestamp: new Date().toISOString(),
            });
            return;
          }

          // Check if enough stock is available
          if (inventoryItem.available < quantity) {
            reply.code(400).send({
              success: false,
              error: 'Insufficient stock available',
              data: {
                available: inventoryItem.available,
                requested: quantity,
              },
              timestamp: new Date().toISOString(),
            });
            return;
          }

          // Create reservation
          const expiresAt = new Date(Date.now() + expiresIn * 1000);
          const reservation = await reservationRepository.create({
            orderId,
            productId,
            quantity,
            status: 'pending',
            expiresAt,
          });

          // Update inventory
          await inventoryRepository.updateById(inventoryItem.id, {
            available: inventoryItem.available - quantity,
            reserved: inventoryItem.reserved + quantity,
          });

          // Publish reservation event
          const eventBus = await getEventBus();
          await eventBus.publish<InventoryReservedEvent>('inventory.reserved', {
            reservationId: reservation.id,
            orderId,
            productId,
            quantity,
          });

          logger.info(
            { reservationId: reservation.id, orderId, productId, quantity },
            'Inventory reserved'
          );

          const response: ApiResponse<typeof reservation> = {
            success: true,
            data: {
              id: reservation.id,
              orderId: reservation.orderId,
              productId: reservation.productId,
              quantity: reservation.quantity,
              status: reservation.status,
              expiresAt: reservation.expiresAt,
              createdAt: reservation.createdAt,
              updatedAt: reservation.updatedAt,
            },
            timestamp: new Date().toISOString(),
          };

          reply.code(201).send(response);
        } catch (error) {
          logger.error({ error, orderId, productId }, 'Failed to reserve inventory');
          throw error;
        }
      });
    }
  );

  // Release inventory reservation
  fastify.post<{ Params: { reservationId: string } }>(
    '/release/:reservationId',
    {
      preHandler: [requireAuth(), validateParams({ reservationId: idSchema.shape.id })],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { reservationId } = request.params as { reservationId: string };

      return traceBusiness('releaseInventory', 'inventory', reservationId, async () => {
        try {
          const reservation = await reservationRepository.findById(reservationId);
          if (!reservation) {
            reply.code(404).send({
              success: false,
              error: 'Reservation not found',
              timestamp: new Date().toISOString(),
            });
            return;
          }

          if (reservation.status !== 'pending') {
            reply.code(400).send({
              success: false,
              error: 'Reservation cannot be released',
              timestamp: new Date().toISOString(),
            });
            return;
          }

          // Release reservation
          await reservationRepository.updateById(reservationId, { status: 'released' });

          // Update inventory
          const inventoryItem = await inventoryRepository.findByProductId(reservation.productId);
          if (inventoryItem) {
            await inventoryRepository.updateById(inventoryItem.id, {
              available: inventoryItem.available + reservation.quantity,
              reserved: inventoryItem.reserved - reservation.quantity,
            });
          }

          // Publish release event
          const eventBus = await getEventBus();
          await eventBus.publish<InventoryReleasedEvent>('inventory.released', {
            reservationId,
            orderId: reservation.orderId,
            productId: reservation.productId,
            quantity: reservation.quantity,
          });

          logger.info(
            { reservationId, orderId: reservation.orderId, productId: reservation.productId },
            'Inventory reservation released'
          );

          reply.code(204).send();
        } catch (error) {
          logger.error({ error, reservationId }, 'Failed to release inventory reservation');
          throw error;
        }
      });
    }
  );

  // Get low stock items
  fastify.get(
    '/low-stock',
    {
      preHandler: [requireAuth(), requireRoles('admin')],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const lowStockItems = await inventoryRepository.findLowStock();

        const response: ApiResponse<typeof lowStockItems> = {
          success: true,
          data: lowStockItems.map(item => ({
            id: item.id,
            productId: item.productId,
            sku: item.sku,
            available: item.available,
            reserved: item.reserved,
            total: item.total,
            reorderLevel: item.reorderLevel,
            createdAt: item.createdAt,
            updatedAt: item.updatedAt,
          })),
          timestamp: new Date().toISOString(),
        };

        reply.send(response);
      } catch (error) {
        logger.error({ error }, 'Failed to get low stock items');
        throw error;
      }
    }
  );
}