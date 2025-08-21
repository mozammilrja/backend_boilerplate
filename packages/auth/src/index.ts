import bcrypt from 'bcrypt';
import type { FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';

import { getConfig } from '@enterprise/config';
import { logger } from '@enterprise/logger';
import type { JWTPayload, Role, AuthTokens } from '@enterprise/types';

const config = getConfig();

// Password hashing
export async function hashPassword(password: string): Promise<string> {
  const saltRounds = 12;
  return bcrypt.hash(password, saltRounds);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// JWT token management
export function signAccessToken(payload: Omit<JWTPayload, 'iat' | 'exp'>): string {
  return jwt.sign(payload, config.JWT_ACCESS_SECRET, {
    expiresIn: config.JWT_ACCESS_TTL,
    issuer: 'enterprise-platform',
  });
}

export function signRefreshToken(payload: { userId: string; email: string }): string {
  return jwt.sign(payload, config.JWT_REFRESH_SECRET, {
    expiresIn: config.JWT_REFRESH_TTL,
    issuer: 'enterprise-platform',
  });
}

export function verifyAccessToken(token: string): JWTPayload {
  try {
    return jwt.verify(token, config.JWT_ACCESS_SECRET) as JWTPayload;
  } catch (error) {
    throw new Error('Invalid access token');
  }
}

export function verifyRefreshToken(token: string): { userId: string; email: string } {
  try {
    return jwt.verify(token, config.JWT_REFRESH_SECRET) as { userId: string; email: string };
  } catch (error) {
    throw new Error('Invalid refresh token');
  }
}

export function generateAuthTokens(user: {
  id: string;
  email: string;
  roles: Role[];
}): AuthTokens {
  const accessToken = signAccessToken({
    userId: user.id,
    email: user.email,
    roles: user.roles,
  });

  const refreshToken = signRefreshToken({
    userId: user.id,
    email: user.email,
  });

  return { accessToken, refreshToken };
}

// Fastify authentication middleware
declare module 'fastify' {
  interface FastifyRequest {
    user?: JWTPayload;
  }
}

export function requireAuth() {
  return async function (request: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      const authHeader = request.headers.authorization;

      if (!authHeader) {
        reply.code(401).send({
          success: false,
          error: 'Authorization header missing',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;

      if (!token) {
        reply.code(401).send({
          success: false,
          error: 'Token missing',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const decoded = verifyAccessToken(token);
      request.user = decoded;

      logger.debug({ userId: decoded.userId }, 'User authenticated');
    } catch (error) {
      logger.warn({ error: (error as Error).message }, 'Authentication failed');
      reply.code(401).send({
        success: false,
        error: 'Invalid or expired token',
        timestamp: new Date().toISOString(),
      });
    }
  };
}

export function requireRoles(...allowedRoles: Role[]) {
  return async function (request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user;

    if (!user) {
      reply.code(401).send({
        success: false,
        error: 'Authentication required',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const hasRole = user.roles.some((role) => allowedRoles.includes(role));

    if (!hasRole) {
      logger.warn(
        { userId: user.userId, userRoles: user.roles, requiredRoles: allowedRoles },
        'Access denied - insufficient roles'
      );

      reply.code(403).send({
        success: false,
        error: 'Insufficient permissions',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    logger.debug(
      { userId: user.userId, roles: user.roles },
      'Role authorization successful'
    );
  };
}

// WebSocket authentication
export function authenticateSocket(token: string): JWTPayload {
  if (!token) {
    throw new Error('Authentication token required');
  }

  try {
    return verifyAccessToken(token);
  } catch (error) {
    throw new Error('Invalid authentication token');
  }
}

// Utility functions
export function extractTokenFromHeader(authHeader: string | undefined): string | null {
  if (!authHeader) {
    return null;
  }

  if (authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }

  return authHeader;
}

export function isTokenExpired(token: string): boolean {
  try {
    const decoded = jwt.decode(token) as JWTPayload;
    if (!decoded || !decoded.exp) {
      return true;
    }
    return decoded.exp < Date.now() / 1000;
  } catch {
    return true;
  }
}