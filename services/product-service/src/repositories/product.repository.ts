import { BaseRepository, traceDbOperation } from '@enterprise/db';

import { ProductModel, type ProductDocument } from '../models/product.model.js';

class ProductRepository extends BaseRepository<ProductDocument> {
  constructor() {
    super(ProductModel);
  }

  async findBySku(sku: string): Promise<ProductDocument | null> {
    return traceDbOperation('findBySku', 'products', async () => {
      return this.model.findOne({ sku }).exec();
    });
  }

  async findByCategory(category: string): Promise<ProductDocument[]> {
    return traceDbOperation('findByCategory', 'products', async () => {
      return this.model.find({ category, active: true }).exec();
    });
  }

  async searchProducts(query: string): Promise<ProductDocument[]> {
    return traceDbOperation('searchProducts', 'products', async () => {
      return this.model
        .find({
          $text: { $search: query },
          active: true,
        })
        .sort({ score: { $meta: 'textScore' } })
        .exec();
    });
  }

  async findLowStock(threshold: number = 10): Promise<ProductDocument[]> {
    return traceDbOperation('findLowStock', 'products', async () => {
      return this.model
        .find({
          stock: { $lte: threshold },
          active: true,
        })
        .sort({ stock: 1 })
        .exec();
    });
  }

  async updateStock(productId: string, quantity: number): Promise<ProductDocument | null> {
    return traceDbOperation('updateStock', 'products', async () => {
      return this.model.findByIdAndUpdate(
        productId,
        { $inc: { stock: quantity } },
        { new: true }
      ).exec();
    });
  }

  async findByTags(tags: string[]): Promise<ProductDocument[]> {
    return traceDbOperation('findByTags', 'products', async () => {
      return this.model
        .find({
          tags: { $in: tags },
          active: true,
        })
        .exec();
    });
  }
}

export const productRepository = new ProductRepository();