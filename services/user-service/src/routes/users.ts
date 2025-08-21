import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

import { requireAuth, requireRoles } from '@enterprise/auth';
import { getEventBus } from '@enterprise/event-bus';
import { logger } from '@enterprise/logger';
import { traceBusiness } from '@enterprise/observability';
import type {
  UpdateUserRequest,
  UserUpdatedEvent,
  ApiResponse,
  PaginatedResponse,
  PaginationQuery,
} from '@enterprise/types';
import {
  validateBody,
  validateQuery,
  validateParams,
  updateUserSchema,
  paginationSchema,
  idSchema,
} from '@enterprise/validation';

import { userRepository } from '../repositories/user.repository.js';

export async function userRoutes(fastify: FastifyInstance): Promise<void> {
  // Get current user profile
  fastify.get(
    '/me',
    {
      preHandler: [requireAuth()],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = request.user!.userId;

      try {
        const user = await userRepository.findById(userId);
        if (!user) {
          reply.code(404).send({
            success: false,
            error: 'User not found',
            timestamp: new Date().toISOString(),
          });
          return;
        }

        const response: ApiResponse<Partial<typeof user>> = {
          success: true,
          data: {
            id: user.id,
            email: user.email,
            roles: user.roles,
            profile: user.profile,
            createdAt: user.createdAt,
            updatedAt: user.updatedAt,
          },
          timestamp: new Date().toISOString(),
        };

        reply.send(response);
      } catch (error) {
        logger.error({ error, userId }, 'Failed to get user profile');
        throw error;
      }
    }
  );

  // Update current user profile
  fastify.patch<{ Body: UpdateUserRequest }>(
    '/me',
    {
      preHandler: [requireAuth(), validateBody(updateUserSchema)],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = request.user!.userId;
      const updateData = request.validatedBody as UpdateUserRequest;

      return traceBusiness('updateProfile', 'user', userId, async () => {
        try {
          const user = await userRepository.findById(userId);
          if (!user) {
            reply.code(404).send({
              success: false,
              error: 'User not found',
              timestamp: new Date().toISOString(),
            });
            return;
          }

          // Build update object
          const updates: any = {};
          if (updateData.profile) {
            updates.profile = { ...user.profile, ...updateData.profile };
          }

          const updatedUser = await userRepository.updateById(userId, updates);

          // Publish user updated event
          const eventBus = await getEventBus();
          await eventBus.publish<UserUpdatedEvent>('user.updated', {
            userId: userId,
            changes: updates,
          });

          logger.info({ userId }, 'User profile updated');

          const response: ApiResponse<Partial<typeof updatedUser>> = {
            success: true,
            data: {
              id: updatedUser!.id,
              email: updatedUser!.email,
              roles: updatedUser!.roles,
              profile: updatedUser!.profile,
              updatedAt: updatedUser!.updatedAt,
            },
            timestamp: new Date().toISOString(),
          };

          reply.send(response);
        } catch (error) {
          logger.error({ error, userId }, 'Failed to update user profile');
          throw error;
        }
      });
    }
  );

  // Get all users (admin only)
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

        const [users, total] = await Promise.all([
          userRepository.findMany(
            {},
            {
              skip,
              limit,
              sort: { [sortField]: sortOrder },
            }
          ),
          userRepository.count(),
        ]);

        const totalPages = Math.ceil(total / limit);

        const response: PaginatedResponse<Partial<typeof users[0]>> = {
          success: true,
          data: users.map(user => ({
            id: user.id,
            email: user.email,
            roles: user.roles,
            profile: user.profile,
            createdAt: user.createdAt,
            updatedAt: user.updatedAt,
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
        logger.error({ error }, 'Failed to get users');
        throw error;
      }
    }
  );

  // Get user by ID (admin only)
  fastify.get<{ Params: { id: string } }>(
    '/:id',
    {
      preHandler: [requireAuth(), requireRoles('admin'), validateParams(idSchema)],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.validatedParams as { id: string };

      try {
        const user = await userRepository.findById(id);
        if (!user) {
          reply.code(404).send({
            success: false,
            error: 'User not found',
            timestamp: new Date().toISOString(),
          });
          return;
        }

        const response: ApiResponse<Partial<typeof user>> = {
          success: true,
          data: {
            id: user.id,
            email: user.email,
            roles: user.roles,
            profile: user.profile,
            createdAt: user.createdAt,
            updatedAt: user.updatedAt,
          },
          timestamp: new Date().toISOString(),
        };

        reply.send(response);
      } catch (error) {
        logger.error({ error, userId: id }, 'Failed to get user');
        throw error;
      }
    }
  );

  // Update user roles (admin only)
  fastify.patch<{ Params: { id: string }; Body: { roles: string[] } }>(
    '/:id/roles',
    {
      preHandler: [requireAuth(), requireRoles('admin'), validateParams(idSchema)],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.validatedParams as { id: string };
      const { roles } = request.body as { roles: string[] };

      return traceBusiness('updateRoles', 'user', id, async () => {
        try {
          const user = await userRepository.findById(id);
          if (!user) {
            reply.code(404).send({
              success: false,
              error: 'User not found',
              timestamp: new Date().toISOString(),
            });
            return;
          }

          const updatedUser = await userRepository.updateRoles(id, roles as any);

          // Publish user updated event
          const eventBus = await getEventBus();
          await eventBus.publish<UserUpdatedEvent>('user.updated', {
            userId: id,
            changes: { roles },
          });

          logger.info({ userId: id, roles }, 'User roles updated');

          const response: ApiResponse<Partial<typeof updatedUser>> = {
            success: true,
            data: {
              id: updatedUser!.id,
              email: updatedUser!.email,
              roles: updatedUser!.roles,
              profile: updatedUser!.profile,
              updatedAt: updatedUser!.updatedAt,
            },
            timestamp: new Date().toISOString(),
          };

          reply.send(response);
        } catch (error) {
          logger.error({ error, userId: id }, 'Failed to update user roles');
          throw error;
        }
      });
    }
  );
}