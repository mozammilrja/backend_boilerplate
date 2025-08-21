import { BaseRepository, traceDbOperation } from '@enterprise/db';
import type { OrderStatus } from '@enterprise/types';

import { OrderModel, type OrderDocument } from '../models/order.model.js';

class OrderRepository extends BaseRepository<OrderDocument> {
  constructor() {
    super(OrderModel);
  }

  async findByUserId(userId: string): Promise<OrderDocument[]> {
    return traceDbOperation('findByUserId', 'orders', async () => {
      return this.model.find({ userId }).sort({ createdAt: -1 }).exec();
    });
  }

  async findByStatus(status: OrderStatus): Promise<OrderDocument[]> {
    return traceDbOperation('findByStatus', 'orders', async () => {
      return this.model.find({ status }).sort({ createdAt: -1 }).exec();
    });
  }

  async findByUserIdAndStatus(userId: string, status: OrderStatus): Promise<OrderDocument[]> {
    return traceDbOperation('findByUserIdAndStatus', 'orders', async () => {
      return this.model.find({ userId, status }).sort({ createdAt: -1 }).exec();
    });
  }

  async updateStatus(orderId: string, status: OrderStatus): Promise<OrderDocument | null> {
    return traceDbOperation('updateStatus', 'orders', async () => {
      return this.model.findByIdAndUpdate(
        orderId,
        { status },
        { new: true }
      ).exec();
    });
  }

  async getOrdersByDateRange(startDate: Date, endDate: Date): Promise<OrderDocument[]> {
    return traceDbOperation('getOrdersByDateRange', 'orders', async () => {
      return this.model
        .find({
          createdAt: {
            $gte: startDate,
            $lte: endDate,
          },
        })
        .sort({ createdAt: -1 })
        .exec();
    });
  }

  async getOrderTotalsByUser(userId: string): Promise<{ total: number; count: number }> {
    return traceDbOperation('getOrderTotalsByUser', 'orders', async () => {
      const result = await this.model.aggregate([
        { $match: { userId } },
        {
          $group: {
            _id: null,
            total: { $sum: '$totals.total' },
            count: { $sum: 1 },
          },
        },
      ]);

      return result[0] || { total: 0, count: 0 };
    });
  }

  async findRecentOrders(limit: number = 10): Promise<OrderDocument[]> {
    return traceDbOperation('findRecentOrders', 'orders', async () => {
      return this.model
        .find()
        .sort({ createdAt: -1 })
        .limit(limit)
        .exec();
    });
  }
}

export const orderRepository = new OrderRepository();