import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

import { requireAuth, requireRoles } from '@enterprise/auth';
import { getEventBus } from '@enterprise/event-bus';
import { logger } from '@enterprise/logger';
import { traceBusiness } from '@enterprise/observability';
import type {
  CreateProductRequest,
  UpdateProductRequest,
  ProductCreatedEvent,
  ProductUpdatedEvent,
  ApiResponse,
  PaginatedResponse,
  PaginationQuery,
} from '@enterprise/types';
import {
  validateBody,
  validateQuery,
  validateParams,
  createProductSchema,
  updateProductSchema,
  paginationSchema,
  productFilterSchema,
  idSchema,
} from '@enterprise/validation';

import { productRepository } from '../repositories/product.repository.js';

export async function productRoutes(fastify: FastifyInstance): Promise<void> {
  // Get all products
  fastify.get<{ Querystring: PaginationQuery & Record<string, any> }>(
    '/',
    {
      preHandler: [validateQuery(paginationSchema.merge(productFilterSchema))],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = request.validatedQuery as PaginationQuery & Record<string, any>;
      const { page, limit, sort, order, ...filters } = query;

      try {
        const skip = (page - 1) * limit;
        const sortField = sort || 'createdAt';
        const sortOrder = order === 'asc' ? 1 : -1;

        // Build filter object
        const filterObj: Record<string, any> = {};
        
        if (filters.category) filterObj.category = filters.category;
        if (filters.active !== undefined) filterObj.active = filters.active;
        if (filters.inStock !== undefined) {
          filterObj.stock = filters.inStock ? { $gt: 0 } : 0;
        }
        if (filters.minPrice !== undefined || filters.maxPrice !== undefined) {
          filterObj.price = {};
          if (filters.minPrice !== undefined) filterObj.price.$gte = filters.minPrice;
          if (filters.maxPrice !== undefined) filterObj.price.$lte = filters.maxPrice;
        }
        if (filters.tags && Array.isArray(filters.tags)) {
          filterObj.tags = { $in: filters.tags };
        }

        const [products, total] = await Promise.all([
          productRepository.findMany(
            filterObj,
            {
              skip,
              limit,
              sort: { [sortField]: sortOrder },
            }
          ),
          productRepository.count(filterObj),
        ]);

        const totalPages = Math.ceil(total / limit);

        const response: PaginatedResponse<typeof products[0]> = {
          success: true,
          data: products.map(product => ({
            id: product.id,
            sku: product.sku,
            name: product.name,
            description: product.description,
            price: product.price,
            stock: product.stock,
            category: product.category,
            tags: product.tags,
            active: product.active,
            createdAt: product.createdAt,
            updatedAt: product.updatedAt,
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
        logger.error({ error }, 'Failed to get products');
        throw error;
      }
    }
  );

  // Get product by ID
  fastify.get<{ Params: { id: string } }>(
    '/:id',
    {
      preHandler: [validateParams(idSchema)],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.validatedParams as { id: string };

      try {
        const product = await productRepository.findById(id);
        if (!product || !product.active) {
          reply.code(404).send({
            success: false,
            error: 'Product not found',
            timestamp: new Date().toISOString(),
          });
          return;
        }

        const response: ApiResponse<typeof product> = {
          success: true,
          data: {
            id: product.id,
            sku: product.sku,
            name: product.name,
            description: product.description,
            price: product.price,
            stock: product.stock,
            category: product.category,
            tags: product.tags,
            active: product.active,
            createdAt: product.createdAt,
            updatedAt: product.updatedAt,
          },
          timestamp: new Date().toISOString(),
        };

        reply.send(response);
      } catch (error) {
        logger.error({ error, productId: id }, 'Failed to get product');
        throw error;
      }
    }
  );

  // Create new product (admin only)
  fastify.post<{ Body: CreateProductRequest }>(
    '/',
    {
      preHandler: [requireAuth(), requireRoles('admin'), validateBody(createProductSchema)],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const productData = request.validatedBody as CreateProductRequest;

      return traceBusiness('createProduct', 'product', productData.sku, async () => {
        try {
          // Check if SKU already exists
          const existingProduct = await productRepository.findBySku(productData.sku);
          if (existingProduct) {
            reply.code(409).send({
              success: false,
              error: 'Product with this SKU already exists',
              timestamp: new Date().toISOString(),
            });
            return;
          }

          const product = await productRepository.create({
            ...productData,
            active: true,
          });

          // Publish product created event
          const eventBus = await getEventBus();
          await eventBus.publish<ProductCreatedEvent>('product.created', {
            productId: product.id,
            sku: product.sku,
            name: product.name,
            stock: product.stock,
          });

          logger.info({ productId: product.id, sku: product.sku }, 'Product created');

          const response: ApiResponse<typeof product> = {
            success: true,
            data: {
              id: product.id,
              sku: product.sku,
              name: product.name,
              description: product.description,
              price: product.price,
              stock: product.stock,
              category: product.category,
              tags: product.tags,
              active: product.active,
              createdAt: product.createdAt,
              updatedAt: product.updatedAt,
            },
            timestamp: new Date().toISOString(),
          };

          reply.code(201).send(response);
        } catch (error) {
          logger.error({ error, sku: productData.sku }, 'Failed to create product');
          throw error;
        }
      });
    }
  );

  // Update product (admin only)
  fastify.patch<{ Params: { id: string }; Body: UpdateProductRequest }>(
    '/:id',
    {
      preHandler: [
        requireAuth(),
        requireRoles('admin'),
        validateParams(idSchema),
        validateBody(updateProductSchema),
      ],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.validatedParams as { id: string };
      const updateData = request.validatedBody as UpdateProductRequest;

      return traceBusiness('updateProduct', 'product', id, async () => {
        try {
          const existingProduct = await productRepository.findById(id);
          if (!existingProduct) {
            reply.code(404).send({
              success: false,
              error: 'Product not found',
              timestamp: new Date().toISOString(),
            });
            return;
          }

          const previousStock = existingProduct.stock;
          const updatedProduct = await productRepository.updateById(id, updateData);

          // Publish product updated event if stock changed
          if (updateData.stock !== undefined && updateData.stock !== previousStock) {
            const eventBus = await getEventBus();
            await eventBus.publish<ProductUpdatedEvent>('product.updated', {
              productId: id,
              sku: existingProduct.sku,
              changes: updateData,
              previousStock,
              currentStock: updateData.stock,
            });
          }

          logger.info({ productId: id, changes: updateData }, 'Product updated');

          const response: ApiResponse<typeof updatedProduct> = {
            success: true,
            data: {
              id: updatedProduct!.id,
              sku: updatedProduct!.sku,
              name: updatedProduct!.name,
              description: updatedProduct!.description,
              price: updatedProduct!.price,
              stock: updatedProduct!.stock,
              category: updatedProduct!.category,
              tags: updatedProduct!.tags,
              active: updatedProduct!.active,
              createdAt: updatedProduct!.createdAt,
              updatedAt: updatedProduct!.updatedAt,
            },
            timestamp: new Date().toISOString(),
          };

          reply.send(response);
        } catch (error) {
          logger.error({ error, productId: id }, 'Failed to update product');
          throw error;
        }
      });
    }
  );

  // Delete product (admin only)
  fastify.delete<{ Params: { id: string } }>(
    '/:id',
    {
      preHandler: [requireAuth(), requireRoles('admin'), validateParams(idSchema)],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.validatedParams as { id: string };

      return traceBusiness('deleteProduct', 'product', id, async () => {
        try {
          const product = await productRepository.findById(id);
          if (!product) {
            reply.code(404).send({
              success: false,
              error: 'Product not found',
              timestamp: new Date().toISOString(),
            });
            return;
          }

          // Soft delete by setting active to false
          await productRepository.updateById(id, { active: false });

          logger.info({ productId: id }, 'Product deleted (deactivated)');

          reply.code(204).send();
        } catch (error) {
          logger.error({ error, productId: id }, 'Failed to delete product');
          throw error;
        }
      });
    }
  );

  // Get product by SKU
  fastify.get<{ Params: { sku: string } }>(
    '/sku/:sku',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { sku } = request.params as { sku: string };

      try {
        const product = await productRepository.findBySku(sku);
        if (!product || !product.active) {
          reply.code(404).send({
            success: false,
            error: 'Product not found',
            timestamp: new Date().toISOString(),
          });
          return;
        }

        const response: ApiResponse<typeof product> = {
          success: true,
          data: {
            id: product.id,
            sku: product.sku,
            name: product.name,
            description: product.description,
            price: product.price,
            stock: product.stock,
            category: product.category,
            tags: product.tags,
            active: product.active,
            createdAt: product.createdAt,
            updatedAt: product.updatedAt,
          },
          timestamp: new Date().toISOString(),
        };

        reply.send(response);
      } catch (error) {
        logger.error({ error, sku }, 'Failed to get product by SKU');
        throw error;
      }
    }
  );
}