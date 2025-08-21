import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

import {
  hashPassword,
  comparePassword,
  generateAuthTokens,
  verifyRefreshToken,
  requireAuth,
} from '@enterprise/auth';
import { getEventBus } from '@enterprise/event-bus';
import { logger } from '@enterprise/logger';
import { traceBusiness } from '@enterprise/observability';
import type {
  CreateUserRequest,
  LoginRequest,
  RefreshTokenRequest,
  UserCreatedEvent,
  ApiResponse,
  AuthTokens,
} from '@enterprise/types';
import {
  validateBody,
  registerSchema,
  loginSchema,
  refreshTokenSchema,
} from '@enterprise/validation';

import { userRepository } from '../repositories/user.repository.js';

export async function authRoutes(fastify: FastifyInstance): Promise<void> {
  // Register new user
  fastify.post<{ Body: CreateUserRequest }>(
    '/register',
    {
      preHandler: [validateBody(registerSchema)],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { email, password, roles, profile } = request.validatedBody as CreateUserRequest;

      return traceBusiness('register', 'user', email, async () => {
        try {
          // Check if user already exists
          const existingUser = await userRepository.findByEmail(email);
          if (existingUser) {
            reply.code(409).send({
              success: false,
              error: 'User already exists',
              timestamp: new Date().toISOString(),
            });
            return;
          }

          // Hash password
          const hashedPassword = await hashPassword(password);

          // Create user
          const user = await userRepository.create({
            email,
            password: hashedPassword,
            roles: roles || ['user'],
            profile,
          });

          // Generate tokens
          const tokens = generateAuthTokens({
            id: user.id,
            email: user.email,
            roles: user.roles,
          });

          // Publish user created event
          const eventBus = await getEventBus();
          await eventBus.publish<UserCreatedEvent>('user.created', {
            userId: user.id,
            email: user.email,
            roles: user.roles,
          });

          logger.info({ userId: user.id, email }, 'User registered successfully');

          const response: ApiResponse<{ user: Partial<typeof user>; tokens: AuthTokens }> = {
            success: true,
            data: {
              user: {
                id: user.id,
                email: user.email,
                roles: user.roles,
                profile: user.profile,
                createdAt: user.createdAt,
              },
              tokens,
            },
            timestamp: new Date().toISOString(),
          };

          reply.code(201).send(response);
        } catch (error) {
          logger.error({ error, email }, 'Failed to register user');
          throw error;
        }
      });
    }
  );

  // Login user
  fastify.post<{ Body: LoginRequest }>(
    '/login',
    {
      preHandler: [validateBody(loginSchema)],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { email, password } = request.validatedBody as LoginRequest;

      return traceBusiness('login', 'user', email, async () => {
        try {
          // Find user
          const user = await userRepository.findByEmail(email);
          if (!user) {
            reply.code(401).send({
              success: false,
              error: 'Invalid credentials',
              timestamp: new Date().toISOString(),
            });
            return;
          }

          // Verify password
          const isValidPassword = await comparePassword(password, user.password);
          if (!isValidPassword) {
            reply.code(401).send({
              success: false,
              error: 'Invalid credentials',
              timestamp: new Date().toISOString(),
            });
            return;
          }

          // Generate tokens
          const tokens = generateAuthTokens({
            id: user.id,
            email: user.email,
            roles: user.roles,
          });

          logger.info({ userId: user.id, email }, 'User logged in successfully');

          const response: ApiResponse<{ user: Partial<typeof user>; tokens: AuthTokens }> = {
            success: true,
            data: {
              user: {
                id: user.id,
                email: user.email,
                roles: user.roles,
                profile: user.profile,
                createdAt: user.createdAt,
              },
              tokens,
            },
            timestamp: new Date().toISOString(),
          };

          reply.send(response);
        } catch (error) {
          logger.error({ error, email }, 'Failed to login user');
          throw error;
        }
      });
    }
  );

  // Refresh token
  fastify.post<{ Body: RefreshTokenRequest }>(
    '/refresh',
    {
      preHandler: [validateBody(refreshTokenSchema)],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { refreshToken } = request.validatedBody as RefreshTokenRequest;

      try {
        // Verify refresh token
        const decoded = verifyRefreshToken(refreshToken);

        // Find user
        const user = await userRepository.findById(decoded.userId);
        if (!user) {
          reply.code(401).send({
            success: false,
            error: 'Invalid refresh token',
            timestamp: new Date().toISOString(),
          });
          return;
        }

        // Generate new tokens
        const tokens = generateAuthTokens({
          id: user.id,
          email: user.email,
          roles: user.roles,
        });

        logger.info({ userId: user.id }, 'Tokens refreshed successfully');

        const response: ApiResponse<{ tokens: AuthTokens }> = {
          success: true,
          data: { tokens },
          timestamp: new Date().toISOString(),
        };

        reply.send(response);
      } catch (error) {
        logger.error({ error }, 'Failed to refresh token');
        reply.code(401).send({
          success: false,
          error: 'Invalid refresh token',
          timestamp: new Date().toISOString(),
        });
      }
    }
  );

  // Get current user
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
}