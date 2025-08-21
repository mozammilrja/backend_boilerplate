import type { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';

import type { Role } from '@enterprise/types';

// Common schemas
export const idSchema = z.object({
  id: z.string().uuid('Invalid ID format'),
});

export const paginationSchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  sort: z.string().optional(),
  order: z.enum(['asc', 'desc']).default('desc'),
});

export const timestampSchema = z.object({
  createdAt: z.date(),
  updatedAt: z.date(),
});

// Auth schemas
export const registerSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
  roles: z.array(z.enum(['user', 'admin', 'service'])).optional().default(['user']),
  profile: z.object({
    firstName: z.string().min(1).optional(),
    lastName: z.string().min(1).optional(),
    phone: z.string().optional(),
  }).optional(),
});

export const loginSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(1, 'Password is required'),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

// User schemas
export const updateUserSchema = z.object({
  profile: z.object({
    firstName: z.string().min(1).optional(),
    lastName: z.string().min(1).optional(),
    phone: z.string().optional(),
    avatar: z.string().url().optional(),
  }).optional(),
  roles: z.array(z.enum(['user', 'admin', 'service'])).optional(),
});

// Product schemas
export const createProductSchema = z.object({
  sku: z.string().min(1, 'SKU is required').max(50),
  name: z.string().min(1, 'Name is required').max(200),
  description: z.string().max(1000).optional(),
  price: z.number().min(0, 'Price must be positive'),
  stock: z.number().int().min(0, 'Stock must be non-negative'),
  category: z.string().max(100).optional(),
  tags: z.array(z.string().max(50)).default([]),
});

export const updateProductSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).optional(),
  price: z.number().min(0).optional(),
  stock: z.number().int().min(0).optional(),
  category: z.string().max(100).optional(),
  tags: z.array(z.string().max(50)).optional(),
  active: z.boolean().optional(),
});

export const productFilterSchema = z.object({
  category: z.string().optional(),
  minPrice: z.coerce.number().min(0).optional(),
  maxPrice: z.coerce.number().min(0).optional(),
  inStock: z.coerce.boolean().optional(),
  active: z.coerce.boolean().optional(),
  tags: z.array(z.string()).optional(),
});

// Order schemas
export const addressSchema = z.object({
  street: z.string().min(1, 'Street is required').max(200),
  city: z.string().min(1, 'City is required').max(100),
  state: z.string().min(1, 'State is required').max(100),
  zipCode: z.string().min(1, 'Zip code is required').max(20),
  country: z.string().min(1, 'Country is required').max(100),
});

export const orderItemSchema = z.object({
  productId: z.string().uuid('Invalid product ID'),
  quantity: z.number().int().min(1, 'Quantity must be at least 1').max(1000),
});

export const createOrderSchema = z.object({
  items: z.array(orderItemSchema).min(1, 'At least one item is required'),
  shippingAddress: addressSchema.optional(),
});

export const updateOrderStatusSchema = z.object({
  status: z.enum(['created', 'confirmed', 'shipped', 'delivered', 'cancelled']),
  reason: z.string().max(500).optional(),
});

// Inventory schemas
export const createInventorySchema = z.object({
  productId: z.string().uuid('Invalid product ID'),
  sku: z.string().min(1, 'SKU is required').max(50),
  total: z.number().int().min(0, 'Total must be non-negative'),
  reorderLevel: z.number().int().min(0, 'Reorder level must be non-negative'),
});

export const updateInventorySchema = z.object({
  total: z.number().int().min(0).optional(),
  reorderLevel: z.number().int().min(0).optional(),
});

export const reserveInventorySchema = z.object({
  orderId: z.string().uuid('Invalid order ID'),
  productId: z.string().uuid('Invalid product ID'),
  quantity: z.number().int().min(1, 'Quantity must be positive'),
  expiresIn: z.number().int().min(60).max(3600).default(1800), // seconds
});

// Notification schemas
export const createNotificationSchema = z.object({
  userId: z.string().uuid('Invalid user ID'),
  type: z.enum(['order', 'product', 'system', 'marketing']),
  title: z.string().min(1, 'Title is required').max(200),
  message: z.string().min(1, 'Message is required').max(1000),
  data: z.record(z.unknown()).optional(),
  channels: z.array(z.enum(['email', 'push', 'sms', 'in-app'])).min(1),
});

// Validation middleware
export function validateBody<T>(schema: z.ZodSchema<T>) {
  return async function (request: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      const result = schema.parse(request.body);
      (request as any).validatedBody = result;
    } catch (error) {
      if (error instanceof z.ZodError) {
        reply.code(400).send({
          success: false,
          error: 'Validation failed',
          details: error.issues.map((issue) => ({
            field: issue.path.join('.'),
            message: issue.message,
          })),
          timestamp: new Date().toISOString(),
        });
        return;
      }
      throw error;
    }
  };
}

export function validateQuery<T>(schema: z.ZodSchema<T>) {
  return async function (request: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      const result = schema.parse(request.query);
      (request as any).validatedQuery = result;
    } catch (error) {
      if (error instanceof z.ZodError) {
        reply.code(400).send({
          success: false,
          error: 'Query validation failed',
          details: error.issues.map((issue) => ({
            field: issue.path.join('.'),
            message: issue.message,
          })),
          timestamp: new Date().toISOString(),
        });
        return;
      }
      throw error;
    }
  };
}

export function validateParams<T>(schema: z.ZodSchema<T>) {
  return async function (request: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      const result = schema.parse(request.params);
      (request as any).validatedParams = result;
    } catch (error) {
      if (error instanceof z.ZodError) {
        reply.code(400).send({
          success: false,
          error: 'Parameter validation failed',
          details: error.issues.map((issue) => ({
            field: issue.path.join('.'),
            message: issue.message,
          })),
          timestamp: new Date().toISOString(),
        });
        return;
      }
      throw error;
    }
  };
}

// Type helpers
export type ValidatedBody<T> = T;
export type ValidatedQuery<T> = T;
export type ValidatedParams<T> = T;

// Extend Fastify request interface
declare module 'fastify' {
  interface FastifyRequest {
    validatedBody?: unknown;
    validatedQuery?: unknown;
    validatedParams?: unknown;
  }
}