import { Schema, model, type Document } from 'mongoose';

import { addBaseFields } from '@enterprise/db';
import type { User, Role } from '@enterprise/types';

export interface UserDocument extends Omit<User, 'id'>, Document {}

const userProfileSchema = new Schema(
  {
    firstName: { type: String, trim: true },
    lastName: { type: String, trim: true },
    avatar: { type: String },
    phone: { type: String, trim: true },
  },
  { _id: false }
);

const userSchema = new Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  },
  password: {
    type: String,
    required: true,
    minlength: 8,
  },
  roles: {
    type: [String],
    enum: ['user', 'admin', 'service'],
    default: ['user'],
  },
  profile: {
    type: userProfileSchema,
    default: {},
  },
});

// Add base fields (createdAt, updatedAt, id virtual)
addBaseFields(userSchema);

// Indexes
userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ roles: 1 });
userSchema.index({ createdAt: 1 });

export const UserModel = model<UserDocument>('User', userSchema);