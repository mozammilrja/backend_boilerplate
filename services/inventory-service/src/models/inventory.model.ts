import { Schema, model, type Document } from 'mongoose';

import { addBaseFields } from '@enterprise/db';
import type { InventoryItem } from '@enterprise/types';

export interface InventoryDocument extends Omit<InventoryItem, 'id'>, Document {}

const inventorySchema = new Schema({
  productId: {
    type: String,
    required: true,
    unique: true,
  },
  sku: {
    type: String,
    required: true,
    unique: true,
  },
  available: {
    type: Number,
    required: true,
    min: 0,
    default: 0,
  },
  reserved: {
    type: Number,
    required: true,
    min: 0,
    default: 0,
  },
  total: {
    type: Number,
    required: true,
    min: 0,
  },
  reorderLevel: {
    type: Number,
    required: true,
    min: 0,
    default: 10,
  },
});

// Add base fields
addBaseFields(inventorySchema);

// Indexes
inventorySchema.index({ productId: 1 }, { unique: true });
inventorySchema.index({ sku: 1 }, { unique: true });
inventorySchema.index({ available: 1 });
inventorySchema.index({ reorderLevel: 1 });

// Virtual for checking if item is low stock
inventorySchema.virtual('isLowStock').get(function() {
  return this.available <= this.reorderLevel;
});

export const InventoryModel = model<InventoryDocument>('Inventory', inventorySchema);