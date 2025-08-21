import { Schema, model, type Document } from 'mongoose';

import { addBaseFields } from '@enterprise/db';
import type { Notification, NotificationType, NotificationChannel } from '@enterprise/types';

export interface NotificationDocument extends Omit<Notification, 'id'>, Document {}

const notificationSchema = new Schema({
  userId: {
    type: String,
    required: true,
  },
  type: {
    type: String,
    enum: ['order', 'product', 'system', 'marketing'],
    required: true,
  },
  title: {
    type: String,
    required: true,
    maxlength: 200,
  },
  message: {
    type: String,
    required: true,
    maxlength: 1000,
  },
  data: {
    type: Schema.Types.Mixed,
  },
  channels: {
    type: [String],
    enum: ['email', 'push', 'sms', 'in-app'],
    required: true,
    validate: {
      validator: function(channels: NotificationChannel[]) {
        return channels.length > 0;
      },
      message: 'At least one notification channel is required',
    },
  },
  read: {
    type: Boolean,
    default: false,
  },
});

// Add base fields
addBaseFields(notificationSchema);

// Indexes
notificationSchema.index({ userId: 1 });
notificationSchema.index({ type: 1 });
notificationSchema.index({ read: 1 });
notificationSchema.index({ createdAt: 1 });
notificationSchema.index({ userId: 1, read: 1 });

export const NotificationModel = model<NotificationDocument>('Notification', notificationSchema);