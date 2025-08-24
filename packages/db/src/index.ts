import mongoose, { type Connection, Schema } from 'mongoose';

import { getConfig } from '@enterprise/config';
import { logger } from '@enterprise/logger';

const config = getConfig();

let connection: Connection | null = null;

export async function connectDB(): Promise<Connection> {
  if (connection && connection.readyState === 1) {
    return connection;
  }

  try {
    const conn = await mongoose.connect(config.MONGODB_URI, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      bufferCommands: false,
    });

    connection = conn.connection;

    connection.on('error', (error) => {
      logger.error({ error }, 'MongoDB connection error');
    });

    connection.on('disconnected', () => {
      logger.warn('MongoDB disconnected');
    });

    connection.on('reconnected', () => {
      logger.info('MongoDB reconnected');
    });

    logger.info(`Connected to MongoDB: ${connection.name}`);
    return connection;
  } catch (error) {
    logger.error({ error }, 'Failed to connect to MongoDB');
    throw error;
  }
}

export async function disconnectDB(): Promise<void> {
  if (connection) {
    await mongoose.disconnect();
    connection = null;
    logger.info('Disconnected from MongoDB');
  }
}

// Base schema plugins
export function addBaseFields(schema: Schema): void {
  schema.add({
    createdAt: {
      type: Date,
      default: Date.now,
      immutable: true,
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
  });

  schema.pre('save', function (next) {
    if (this.isModified() && !this.isNew) {
      this.updatedAt = new Date();
    }
    next();
  });

  schema.pre(['updateOne', 'findOneAndUpdate'], function (next) {
    this.set({ updatedAt: new Date() });
    next();
  });

  // Clean JSON output
  schema.set('toJSON', {
    virtuals: true,
    transform: (doc, ret) => {
      delete ret._id;
      delete ret.__v;
      return ret;
    },
  });
}

export function addSoftDelete(schema: Schema): void {
  schema.add({
    deletedAt: {
      type: Date,
      default: null,
    },
  });

  // Add instance method to soft delete
  schema.methods.softDelete = function (this: mongoose.Document) {
    this.set({ deletedAt: new Date() });
    return this.save();
  };

  // Add static method to find non-deleted documents
  schema.statics.findActive = function () {
    return this.find({ deletedAt: null });
  };

  // Add query helper
  schema.query.active = function () {
    return this.where({ deletedAt: null });
  };

  // Pre-hook to exclude soft deleted documents by default
  schema.pre(['find', 'findOne', 'findOneAndUpdate', 'countDocuments'], function () {
    if (!this.getQuery().deletedAt) {
      this.where({ deletedAt: null });
    }
  });
}

// Base repository class
export abstract class BaseRepository<T extends mongoose.Document> {
  constructor(protected model: mongoose.Model<T>) {}

  async create(data: Partial<T>): Promise<T> {
    const document = new this.model(data);
    return document.save();
  }

  async findById(id: string): Promise<T | null> {
    return this.model.findById(id).exec();
  }

  async findOne(filter: Record<string, unknown>): Promise<T | null> {
    return this.model.findOne(filter).exec();
  }

  async findMany(
    filter: Record<string, unknown> = {},
    options: {
      limit?: number;
      skip?: number;
      sort?: Record<string, 1 | -1>;
    } = {}
  ): Promise<T[]> {
    let query = this.model.find(filter);

    if (options.sort) {
      query = query.sort(options.sort);
    }

    if (options.skip) {
      query = query.skip(options.skip);
    }

    if (options.limit) {
      query = query.limit(options.limit);
    }

    return query.exec();
  }

  async updateById(id: string, update: Partial<T>): Promise<T | null> {
    return this.model.findByIdAndUpdate(id, update, { new: true }).exec();
  }

  async deleteById(id: string): Promise<T | null> {
    return this.model.findByIdAndDelete(id).exec();
  }

  async count(filter: Record<string, unknown> = {}): Promise<number> {
    return this.model.countDocuments(filter).exec();
  }
}

// Graceful shutdown
export function setupGracefulShutdown(): void {
  const shutdown = async (signal: string): Promise<void> => {
    logger.info(`Received ${signal}, closing database connection...`);
    await disconnectDB();
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

// Fix missing traceDbOperation export
export async function traceDbOperation<T>(
  operation: string,
  collection: string,
  fn: () => Promise<T>
): Promise<T> {
  // Simple implementation - in production this would use OpenTelemetry
  try {
    return await fn();
  } catch (error) {
    logger.error({ error, operation, collection }, 'Database operation failed');
    throw error;
  }
}
export { mongoose, Schema, type Connection };