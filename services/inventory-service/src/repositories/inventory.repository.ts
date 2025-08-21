import { BaseRepository, traceDbOperation } from '@enterprise/db';

import { InventoryModel, type InventoryDocument } from '../models/inventory.model.js';

class InventoryRepository extends BaseRepository<InventoryDocument> {
  constructor() {
    super(InventoryModel);
  }

  async findByProductId(productId: string): Promise<InventoryDocument | null> {
    return traceDbOperation('findByProductId', 'inventory', async () => {
      return this.model.findOne({ productId }).exec();
    });
  }

  async findBySku(sku: string): Promise<InventoryDocument | null> {
    return traceDbOperation('findBySku', 'inventory', async () => {
      return this.model.findOne({ sku }).exec();
    });
  }

  async findLowStock(): Promise<InventoryDocument[]> {
    return traceDbOperation('findLowStock', 'inventory', async () => {
      return this.model
        .find({
          $expr: { $lte: ['$available', '$reorderLevel'] }
        })
        .sort({ available: 1 })
        .exec();
    });
  }

  async adjustStock(productId: string, quantity: number): Promise<InventoryDocument | null> {
    return traceDbOperation('adjustStock', 'inventory', async () => {
      return this.model.findOneAndUpdate(
        { productId },
        {
          $inc: {
            available: quantity,
            total: quantity,
          }
        },
        { new: true }
      ).exec();
    });
  }

  async reserve(productId: string, quantity: number): Promise<InventoryDocument | null> {
    return traceDbOperation('reserve', 'inventory', async () => {
      return this.model.findOneAndUpdate(
        {
          productId,
          available: { $gte: quantity }
        },
        {
          $inc: {
            available: -quantity,
            reserved: quantity,
          }
        },
        { new: true }
      ).exec();
    });
  }

  async release(productId: string, quantity: number): Promise<InventoryDocument | null> {
    return traceDbOperation('release', 'inventory', async () => {
      return this.model.findOneAndUpdate(
        { productId },
        {
          $inc: {
            available: quantity,
            reserved: -quantity,
          }
        },
        { new: true }
      ).exec();
    });
  }

  async confirm(productId: string, quantity: number): Promise<InventoryDocument | null> {
    return traceDbOperation('confirm', 'inventory', async () => {
      return this.model.findOneAndUpdate(
        { productId },
        {
          $inc: {
            reserved: -quantity,
            total: -quantity,
          }
        },
        { new: true }
      ).exec();
    });
  }

  async getInventoryStats(): Promise<{
    totalItems: number;
    totalStock: number;
    totalReserved: number;
    lowStockCount: number;
  }> {
    return traceDbOperation('getInventoryStats', 'inventory', async () => {
      const stats = await this.model.aggregate([
        {
          $group: {
            _id: null,
            totalItems: { $sum: 1 },
            totalStock: { $sum: '$available' },
            totalReserved: { $sum: '$reserved' },
            lowStockCount: {
              $sum: {
                $cond: [
                  { $lte: ['$available', '$reorderLevel'] },
                  1,
                  0
                ]
              }
            }
          }
        }
      ]);

      return stats[0] || {
        totalItems: 0,
        totalStock: 0,
        totalReserved: 0,
        lowStockCount: 0,
      };
    });
  }
}

export const inventoryRepository = new InventoryRepository();