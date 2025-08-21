import { BaseRepository, traceDbOperation } from '@enterprise/db';
import type { NotificationType, NotificationChannel } from '@enterprise/types';

import { NotificationModel, type NotificationDocument } from '../models/notification.model.js';

class NotificationRepository extends BaseRepository<NotificationDocument> {
  constructor() {
    super(NotificationModel);
  }

  async findByUserId(userId: string): Promise<NotificationDocument[]> {
    return traceDbOperation('findByUserId', 'notifications', async () => {
      return this.model.find({ userId }).sort({ createdAt: -1 }).exec();
    });
  }

  async findUnreadByUserId(userId: string): Promise<NotificationDocument[]> {
    return traceDbOperation('findUnreadByUserId', 'notifications', async () => {
      return this.model.find({ userId, read: false }).sort({ createdAt: -1 }).exec();
    });
  }

  async markAsRead(notificationId: string): Promise<NotificationDocument | null> {
    return traceDbOperation('markAsRead', 'notifications', async () => {
      return this.model.findByIdAndUpdate(
        notificationId,
        { read: true },
        { new: true }
      ).exec();
    });
  }

  async markAllAsRead(userId: string): Promise<void> {
    return traceDbOperation('markAllAsRead', 'notifications', async () => {
      await this.model.updateMany(
        { userId, read: false },
        { read: true }
      ).exec();
    });
  }

  async findByType(type: NotificationType): Promise<NotificationDocument[]> {
    return traceDbOperation('findByType', 'notifications', async () => {
      return this.model.find({ type }).sort({ createdAt: -1 }).exec();
    });
  }

  async countUnreadByUserId(userId: string): Promise<number> {
    return traceDbOperation('countUnreadByUserId', 'notifications', async () => {
      return this.model.countDocuments({ userId, read: false }).exec();
    });
  }

  async deleteOldNotifications(daysOld: number): Promise<number> {
    return traceDbOperation('deleteOldNotifications', 'notifications', async () => {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysOld);

      const result = await this.model.deleteMany({
        createdAt: { $lt: cutoffDate },
        read: true,
      }).exec();

      return result.deletedCount || 0;
    });
  }

  async getNotificationStats(): Promise<{
    total: number;
    unread: number;
    byType: Record<NotificationType, number>;
  }> {
    return traceDbOperation('getNotificationStats', 'notifications', async () => {
      const [total, unread, byType] = await Promise.all([
        this.model.countDocuments().exec(),
        this.model.countDocuments({ read: false }).exec(),
        this.model.aggregate([
          {
            $group: {
              _id: '$type',
              count: { $sum: 1 },
            },
          },
        ]),
      ]);

      const typeStats: Record<NotificationType, number> = {
        order: 0,
        product: 0,
        system: 0,
        marketing: 0,
      };

      byType.forEach(({ _id, count }) => {
        typeStats[_id as NotificationType] = count;
      });

      return {
        total,
        unread,
        byType: typeStats,
      };
    });
  }
}

export const notificationRepository = new NotificationRepository();