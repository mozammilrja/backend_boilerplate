import { Schema, model, type Document } from 'mongoose';

import { addBaseFields } from '@enterprise/db';
import type { Product } from '@enterprise/types';

export interface ProductDocument extends Omit<Product, 'id'>, Document {}

const productSchema = new Schema({
  sku: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    maxlength: 50,
  },
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200,
  },
  description: {
    type: String,
    trim: true,
    maxlength: 1000,
  },
  price: {
    type: Number,
    required: true,
    min: 0,
  },
  stock: {
    type: Number,
    required: true,
    min: 0,
    default: 0,
  },
  category: {
    type: String,
    trim: true,
    maxlength: 100,
  },
  tags: {
    type: [String],
    default: [],
    validate: {
      validator: function(tags: string[]) {
        return tags.every(tag => tag.length <= 50);
      },
      message: 'Each tag must be 50 characters or less',
    },
  },
  active: {
    type: Boolean,
    default: true,
  },
});

// Add base fields
addBaseFields(productSchema);

// Indexes
productSchema.index({ sku: 1 }, { unique: true });
productSchema.index({ name: 'text', description: 'text' });
productSchema.index({ category: 1 });
productSchema.index({ tags: 1 });
productSchema.index({ active: 1 });
productSchema.index({ price: 1 });
productSchema.index({ stock: 1 });
productSchema.index({ createdAt: 1 });

export const ProductModel = model<ProductDocument>('Product', productSchema);