import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

import { requireAuth, requireRoles } from '@enterprise/auth';
import { getEventBus } from '@enterprise/event-bus';
import { logger } from '@enterprise/logger';
import { traceBusiness, traceHttpRequest } from '@enterprise/observability';
import type {
  CreateOrderRequest,
  UpdateOrderStatusRequest,
  OrderCreatedEvent,
  OrderUpdatedEvent,
  ApiResponse,
  PaginatedResponse,
  PaginationQuery,
  OrderStatus,
  SSEMessage,
} from '@enterprise/types';
import {
  validateBody,
  validateQuery,
  validateParams,
  createOrderSchema,
  updateOrderStatusSchema,
  paginationSchema,
  idSchema,
} from '@enterprise/validation';

import { orderRepository } from '../repositories/order.repository.js';

export async function orderRoutes(fastify: FastifyInstance): Promise<void> {
  // Get user's orders
  fastify.get<{ Querystring: PaginationQuery }>(
    '/my-orders',
    {
      preHandler: [requireAuth(), validateQuery(paginationSchema)],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = request.user!.userId;
      const { page, limit, sort, order } = request.validatedQuery as PaginationQuery;

      try {
        const skip = (page - 1) * limit;
        const sortField = sort || 'createdAt';
        const sortOrder = order === 'asc' ? 1 : -1;

        const [orders, total] = await Promise.all([
          orderRepository.findMany(
            { userId },
            {
              skip,
              limit,
              sort: { [sortField]: sortOrder },
            }
          ),
          orderRepository.count({ userId }),
        ]);

        const totalPages = Math.ceil(total / limit);

        const response: PaginatedResponse<typeof orders[0]> = {
          success: true,
          data: orders.map(order => ({
            id: order.id,
            userId: order.userId,
            items: order.items,
            status: order.status,
            totals: order.totals,
            shippingAddress: order.shippingAddress,
            createdAt: order.createdAt,
            updatedAt: order.updatedAt,
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
        logger.error({ error, userId }, 'Failed to get user orders');
        throw error;
      }
    }
  );

  // Get all orders (admin only)
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

        const [orders, total] = await Promise.all([
          orderRepository.findMany(
            {},
            {
              skip,
              limit,
              sort: { [sortField]: sortOrder },
            }
          ),
          orderRepository.count(),
        ]);

        const totalPages = Math.ceil(total / limit);

        const response: PaginatedResponse<typeof orders[0]> = {
          success: true,
          data: orders.map(order => ({
            id: order.id,
            userId: order.userId,
            items: order.items,
            status: order.status,
            totals: order.totals,
            shippingAddress: order.shippingAddress,
            createdAt: order.createdAt,
            updatedAt: order.updatedAt,
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
        logger.error({ error }, 'Failed to get orders');
        throw error;
      }
    }
  );

  // Get order by ID
  fastify.get<{ Params: { id: string } }>(
    '/:id',
    {
      preHandler: [requireAuth(), validateParams(idSchema)],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.validatedParams as { id: string };
      const userId = request.user!.userId;
      const userRoles = request.user!.roles;

      try {
        const order = await orderRepository.findById(id);
        if (!order) {
          reply.code(404).send({
            success: false,
            error: 'Order not found',
            timestamp: new Date().toISOString(),
          });
          return;
        }

        // Users can only access their own orders, admins can access all
        if (order.userId !== userId && !userRoles.includes('admin')) {
          reply.code(403).send({
            success: false,
            error: 'Access denied',
            timestamp: new Date().toISOString(),
          });
          return;
        }

        const response: ApiResponse<typeof order> = {
          success: true,
          data: {
            id: order.id,
            userId: order.userId,
            items: order.items,
            status: order.status,
            totals: order.totals,
            shippingAddress: order.shippingAddress,
            createdAt: order.createdAt,
            updatedAt: order.updatedAt,
          },
          timestamp: new Date().toISOString(),
        };

        reply.send(response);
      } catch (error) {
        logger.error({ error, orderId: id }, 'Failed to get order');
        throw error;
      }
    }
  );

  // Create new order
  fastify.post<{ Body: CreateOrderRequest }>(
    '/',
    {
      preHandler: [requireAuth(), validateBody(createOrderSchema)],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = request.user!.userId;
      const orderData = request.validatedBody as CreateOrderRequest;

      return traceBusiness('createOrder', 'order', userId, async () => {
        try {
          // Fetch product details and calculate totals
          const orderItems = await Promise.all(
            orderData.items.map(async (item) => {
              // In a real implementation, you'd fetch from product service
              const productResponse = await traceHttpRequest(
                'GET',
                `http://localhost:3003/products/${item.productId}`,
                async () => {
                  // This would be actual HTTP call to product service
                  // For now, we'll mock the response
                  return {
                    id: item.productId,
                    sku: `SKU-${item.productId}`,
                    name: `Product ${item.productId}`,
                    price: 29.99, // Mock price
                    stock: 100,
                  };
                }
              );

              const product = productResponse;
              const total = product.price * item.quantity;

              return {
                productId: item.productId,
                sku: product.sku,
                name: product.name,
                quantity: item.quantity,
                price: product.price,
                total,
              };
            })
          );

          // Calculate totals
          const subtotal = orderItems.reduce((sum, item) => sum + item.total, 0);
          const tax = subtotal * 0.08; // 8% tax
          const shipping = subtotal > 100 ? 0 : 9.99; // Free shipping over $100
          const total = subtotal + tax + shipping;

          const order = await orderRepository.create({
            userId,
            items: orderItems,
            status: 'created' as OrderStatus,
            totals: {
              subtotal,
              tax,
              shipping,
              total,
            },
            shippingAddress: orderData.shippingAddress,
          });

          // Publish order created event
          const eventBus = await getEventBus();
          await eventBus.publish<OrderCreatedEvent>('order.created', {
            orderId: order.id,
            userId: order.userId,
            items: order.items,
            totals: order.totals,
          });

          logger.info({ orderId: order.id, userId }, 'Order created');

          const response: ApiResponse<typeof order> = {
            success: true,
            data: {
              id: order.id,
              userId: order.userId,
              items: order.items,
              status: order.status,
              totals: order.totals,
              shippingAddress: order.shippingAddress,
              createdAt: order.createdAt,
              updatedAt: order.updatedAt,
            },
            timestamp: new Date().toISOString(),
          };

          reply.code(201).send(response);
        } catch (error) {
          logger.error({ error, userId }, 'Failed to create order');
          throw error;
        }
      });
    }
  );

  // Update order status (admin only)
  fastify.patch<{ Params: { id: string }; Body: UpdateOrderStatusRequest }>(
    '/:id/status',
    {
      preHandler: [
        requireAuth(),
        requireRoles('admin'),
        validateParams(idSchema),
        validateBody(updateOrderStatusSchema),
      ],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.validatedParams as { id: string };
      const { status, reason } = request.validatedBody as UpdateOrderStatusRequest;

      return traceBusiness('updateOrderStatus', 'order', id, async () => {
        try {
          const existingOrder = await orderRepository.findById(id);
          if (!existingOrder) {
            reply.code(404).send({
              success: false,
              error: 'Order not found',
              timestamp: new Date().toISOString(),
            });
            return;
          }

          const previousStatus = existingOrder.status;
          const updatedOrder = await orderRepository.updateById(id, { status });

          // Publish order updated event
          const eventBus = await getEventBus();
          await eventBus.publish<OrderUpdatedEvent>('order.updated', {
            orderId: id,
            userId: existingOrder.userId,
            previousStatus,
            currentStatus: status,
            changes: { status, reason },
          });

          logger.info(
            { orderId: id, previousStatus, newStatus: status, reason },
            'Order status updated'
          );

          const response: ApiResponse<typeof updatedOrder> = {
            success: true,
            data: {
              id: updatedOrder!.id,
              userId: updatedOrder!.userId,
              items: updatedOrder!.items,
              status: updatedOrder!.status,
              totals: updatedOrder!.totals,
              shippingAddress: updatedOrder!.shippingAddress,
              createdAt: updatedOrder!.createdAt,
              updatedAt: updatedOrder!.updatedAt,
            },
            timestamp: new Date().toISOString(),
          };

          reply.send(response);
        } catch (error) {
          logger.error({ error, orderId: id }, 'Failed to update order status');
          throw error;
        }
      });
    }
  );

  // SSE endpoint for user order updates
  fastify.get<{ Params: { userId: string } }>(
    '/sse/:userId',
    {
      preHandler: [requireAuth()],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { userId } = request.params as { userId: string };
      const currentUser = request.user!;

      // Users can only subscribe to their own order updates, unless admin
      if (currentUser.userId !== userId && !currentUser.roles.includes('admin')) {
        reply.code(403).send({ error: 'Access denied' });
        return;
      }

      // Setup SSE headers
      reply.header('Content-Type', 'text/event-stream');
      reply.header('Cache-Control', 'no-cache');
      reply.header('Connection', 'keep-alive');
      reply.header('Access-Control-Allow-Origin', '*');

      // Send initial connection message
      const initialMessage: SSEMessage = {
        event: 'connected',
        data: { userId, timestamp: new Date().toISOString() },
      };

      reply.raw.write(`event: ${initialMessage.event}\n`);
      reply.raw.write(`data: ${JSON.stringify(initialMessage.data)}\n\n`);

      // Setup event bus consumer for this specific user
      const eventBus = await getEventBus();
      
      const handleOrderEvent = async (event: any) => {
        if (event.data && event.data.userId === userId) {
          const message: SSEMessage = {
            id: event.id,
            event: event.type,
            data: event.data,
          };

          try {
            reply.raw.write(`id: ${message.id}\n`);
            reply.raw.write(`event: ${message.event}\n`);
            reply.raw.write(`data: ${JSON.stringify(message.data)}\n\n`);
          } catch (error) {
            logger.error({ error, userId }, 'Failed to send SSE message');
          }
        }
      };

      await eventBus.subscribe('order.*', handleOrderEvent, {
        queue: `orders.sse.${userId}.${Date.now()}`,
        autoDelete: true,
        exclusive: true,
      });

      // Handle client disconnect
      request.raw.on('close', () => {
        logger.info({ userId }, 'SSE client disconnected');
      });

      request.raw.on('error', () => {
        logger.info({ userId }, 'SSE client error');
      });

      // Keep connection alive with periodic ping
      const pingInterval = setInterval(() => {
        try {
          reply.raw.write(`event: ping\n`);
          reply.raw.write(`data: ${JSON.stringify({ timestamp: Date.now() })}\n\n`);
        } catch (error) {
          clearInterval(pingInterval);
        }
      }, 30000);

      // Cleanup on connection close
      request.raw.on('close', () => {
        clearInterval(pingInterval);
      });

      reply.hijack();
    }
  );
}