import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

import { requireAuth, requireRoles } from '@enterprise/auth';
import { logger } from '@enterprise/logger';
import type {
  ApiResponse,
  PaginatedResponse,
  PaginationQuery,
} from '@enterprise/types';
import {
  validateQuery,
  validateParams,
  paginationSchema,
  idSchema,
} from '@enterprise/validation';

import { notificationRepository } from '../repositories/notification.repository.js';

export async function notificationRoutes(fastify: FastifyInstance): Promise<void> {
  // Get user's notifications
  fastify.get<{ Querystring: PaginationQuery }>(
    '/my-notifications',
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

        const [notifications, total] = await Promise.all([
          notificationRepository.findMany(
            { userId },
            {
              skip,
              limit,
              sort: { [sortField]: sortOrder },
            }
          ),
          notificationRepository.count({ userId }),
        ]);

        const totalPages = Math.ceil(total / limit);

        const response: PaginatedResponse<typeof notifications[0]> = {
          success: true,
          data: notifications.map(notification => ({
            id: notification.id,
            userId: notification.userId,
            type: notification.type,
            title: notification.title,
            message: notification.message,
            data: notification.data,
            channels: notification.channels,
            read: notification.read,
            createdAt: notification.createdAt,
            updatedAt: notification.updatedAt,
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
        logger.error({ error, userId }, 'Failed to get user notifications');
        throw error;
      }
    }
  );

  // Mark notification as read
  fastify.patch<{ Params: { id: string } }>(
    '/:id/read',
    {
      preHandler: [requireAuth(), validateParams(idSchema)],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.validatedParams as { id: string };
      const userId = request.user!.userId;

      try {
        const notification = await notificationRepository.findById(id);
        if (!notification || notification.userId !== userId) {
          reply.code(404).send({
            success: false,
            error: 'Notification not found',
            timestamp: new Date().toISOString(),
          });
          return;
        }

        const updatedNotification = await notificationRepository.updateById(id, { read: true });

        logger.info({ notificationId: id, userId }, 'Notification marked as read');

        const response: ApiResponse<typeof updatedNotification> = {
          success: true,
          data: {
            id: updatedNotification!.id,
            userId: updatedNotification!.userId,
            type: updatedNotification!.type,
            title: updatedNotification!.title,
            message: updatedNotification!.message,
            data: updatedNotification!.data,
            channels: updatedNotification!.channels,
            read: updatedNotification!.read,
            createdAt: updatedNotification!.createdAt,
            updatedAt: updatedNotification!.updatedAt,
          },
          timestamp: new Date().toISOString(),
        };

        reply.send(response);
      } catch (error) {
        logger.error({ error, notificationId: id, userId }, 'Failed to mark notification as read');
        throw error;
      }
    }
  );

  // Get unread notification count
  fastify.get(
    '/unread-count',
    {
      preHandler: [requireAuth()],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = request.user!.userId;

      try {
        const count = await notificationRepository.count({ userId, read: false });

        const response: ApiResponse<{ count: number }> = {
          success: true,
          data: { count },
          timestamp: new Date().toISOString(),
        };

        reply.send(response);
      } catch (error) {
        logger.error({ error, userId }, 'Failed to get unread notification count');
        throw error;
      }
    }
  );

  // Mark all notifications as read
  fastify.patch(
    '/mark-all-read',
    {
      preHandler: [requireAuth()],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = request.user!.userId;

      try {
        await notificationRepository.markAllAsRead(userId);

        logger.info({ userId }, 'All notifications marked as read');

        const response: ApiResponse<{ message: string }> = {
          success: true,
          data: { message: 'All notifications marked as read' },
          timestamp: new Date().toISOString(),
        };

        reply.send(response);
      } catch (error) {
        logger.error({ error, userId }, 'Failed to mark all notifications as read');
        throw error;
      }
    }
  );

  // Admin: Get all notifications
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

        const [notifications, total] = await Promise.all([
          notificationRepository.findMany(
            {},
            {
              skip,
              limit,
              sort: { [sortField]: sortOrder },
            }
          ),
          notificationRepository.count(),
        ]);

        const totalPages = Math.ceil(total / limit);

        const response: PaginatedResponse<typeof notifications[0]> = {
          success: true,
          data: notifications.map(notification => ({
            id: notification.id,
            userId: notification.userId,
            type: notification.type,
            title: notification.title,
            message: notification.message,
            data: notification.data,
            channels: notification.channels,
            read: notification.read,
            createdAt: notification.createdAt,
            updatedAt: notification.updatedAt,
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
        logger.error({ error }, 'Failed to get all notifications');
        throw error;
      }
    }
  );
}