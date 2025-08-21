import { Schema, model, type Document } from 'mongoose';

import { addBaseFields } from '@enterprise/db';
import type { Order, OrderItem, OrderTotals, Address, OrderStatus } from '@enterprise/types';

export interface OrderDocument extends Omit<Order, 'id'>, Document {}

const orderItemSchema = new Schema({
  productId: {
    type: String,
    required: true,
  },
  sku: {
    type: String,
    required: true,
  },
  name: {
    type: String,
    required: true,
  },
  quantity: {
    type: Number,
    required: true,
    min: 1,
  },
  price: {
    type: Number,
    required: true,
    min: 0,
  },
  total: {
    type: Number,
    required: true,
    min: 0,
  },
}, { _id: false });

const orderTotalsSchema = new Schema({
  subtotal: {
    type: Number,
    required: true,
    min: 0,
  },
  tax: {
    type: Number,
    required: true,
    min: 0,
  },
  shipping: {
    type: Number,
    required: true,
    min: 0,
  },
  total: {
    type: Number,
    required: true,
    min: 0,
  },
}, { _id: false });

const addressSchema = new Schema({
  street: {
    type: String,
    required: true,
    maxlength: 200,
  },
  city: {
    type: String,
    required: true,
    maxlength: 100,
  },
  state: {
    type: String,
    required: true,
    maxlength: 100,
  },
  zipCode: {
    type: String,
    required: true,
    maxlength: 20,
  },
  country: {
    type: String,
    required: true,
    maxlength: 100,
  },
}, { _id: false });

const orderSchema = new Schema({
  userId: {
    type: String,
    required: true,
  },
  items: {
    type: [orderItemSchema],
    required: true,
    validate: {
      validator: function(items: OrderItem[]) {
        return items.length > 0;
      },
      message: 'Order must have at least one item',
    },
  },
  status: {
    type: String,
    enum: ['created', 'confirmed', 'shipped', 'delivered', 'cancelled'],
    default: 'created',
  },
  totals: {
    type: orderTotalsSchema,
    required: true,
  },
  shippingAddress: {
    type: addressSchema,
  },
});

// Add base fields
addBaseFields(orderSchema);

// Indexes
orderSchema.index({ userId: 1 });
orderSchema.index({ status: 1 });
orderSchema.index({ createdAt: 1 });
orderSchema.index({ 'items.productId': 1 });

export const OrderModel = model<OrderDocument>('Order', orderSchema);