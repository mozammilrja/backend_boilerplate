import { Schema, model, type Document } from 'mongoose';

import { addBaseFields } from '@enterprise/db';
import type { InventoryReservation } from '@enterprise/types';

export interface ReservationDocument extends Omit<InventoryReservation, 'id'>, Document {}

const reservationSchema = new Schema({
  orderId: {
    type: String,
    required: true,
  },
  productId: {
    type: String,
    required: true,
  },
  quantity: {
    type: Number,
    required: true,
    min: 1,
  },
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'released'],
    default: 'pending',
  },
  expiresAt: {
    type: Date,
    required: true,
  },
});

// Add base fields
addBaseFields(reservationSchema);

// Indexes
reservationSchema.index({ orderId: 1 });
reservationSchema.index({ productId: 1 });
reservationSchema.index({ status: 1 });
reservationSchema.index({ expiresAt: 1 });

// TTL index to automatically clean up expired reservations
reservationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const ReservationModel = model<ReservationDocument>('InventoryReservation', reservationSchema);