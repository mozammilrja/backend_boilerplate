import { BaseRepository, traceDbOperation } from '@enterprise/db';

import { ReservationModel, type ReservationDocument } from '../models/reservation.model.js';

class ReservationRepository extends BaseRepository<ReservationDocument> {
  constructor() {
    super(ReservationModel);
  }

  async findByOrderId(orderId: string): Promise<ReservationDocument[]> {
    return traceDbOperation('findByOrderId', 'reservations', async () => {
      return this.model.find({ orderId }).exec();
    });
  }

  async findByProductId(productId: string): Promise<ReservationDocument[]> {
    return traceDbOperation('findByProductId', 'reservations', async () => {
      return this.model.find({ productId }).exec();
    });
  }

  async findExpired(): Promise<ReservationDocument[]> {
    return traceDbOperation('findExpired', 'reservations', async () => {
      return this.model
        .find({
          status: 'pending',
          expiresAt: { $lt: new Date() }
        })
        .exec();
    });
  }

  async confirmReservation(reservationId: string): Promise<ReservationDocument | null> {
    return traceDbOperation('confirmReservation', 'reservations', async () => {
      return this.model.findByIdAndUpdate(
        reservationId,
        { status: 'confirmed' },
        { new: true }
      ).exec();
    });
  }

  async releaseReservation(reservationId: string): Promise<ReservationDocument | null> {
    return traceDbOperation('releaseReservation', 'reservations', async () => {
      return this.model.findByIdAndUpdate(
        reservationId,
        { status: 'released' },
        { new: true }
      ).exec();
    });
  }

  async extendReservation(reservationId: string, newExpiresAt: Date): Promise<ReservationDocument | null> {
    return traceDbOperation('extendReservation', 'reservations', async () => {
      return this.model.findByIdAndUpdate(
        reservationId,
        { expiresAt: newExpiresAt },
        { new: true }
      ).exec();
    });
  }

  async cleanupExpiredReservations(): Promise<number> {
    return traceDbOperation('cleanupExpiredReservations', 'reservations', async () => {
      const result = await this.model.deleteMany({
        status: 'released',
        expiresAt: { $lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } // 24 hours ago
      }).exec();

      return result.deletedCount || 0;
    });
  }
}

export const reservationRepository = new ReservationRepository();