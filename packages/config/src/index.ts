import { config } from 'dotenv';
import { z } from 'zod';

config();

const configSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  
  // Database
  MONGODB_URI: z.string().url(),
  
  // Redis
  REDIS_URL: z.string().url(),
  
  // RabbitMQ
  RABBITMQ_URL: z.string().url(),
  
  // JWT
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('7d'),
  
  // Gateway
  GATEWAY_PORT: z.coerce.number().default(8080),
  CORS_ORIGIN: z.string().url().default('http://localhost:3000'),
  
  // Service Ports
  AUTH_SERVICE_PORT: z.coerce.number().default(3001),
  USER_SERVICE_PORT: z.coerce.number().default(3002),
  PRODUCT_SERVICE_PORT: z.coerce.number().default(3003),
  ORDER_SERVICE_PORT: z.coerce.number().default(3004),
  NOTIFICATION_SERVICE_PORT: z.coerce.number().default(3005),
  INVENTORY_SERVICE_PORT: z.coerce.number().default(3006),
  
  // OpenTelemetry
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().url().optional(),
  OTEL_SERVICE_NAME: z.string().default('enterprise-platform'),
  OTEL_RESOURCE_ATTRIBUTES: z.string().optional(),
});

export type Config = z.infer<typeof configSchema>;

let cachedConfig: Config | null = null;

export function getConfig(): Config {
  if (!cachedConfig) {
    try {
      cachedConfig = configSchema.parse(process.env);
    } catch (error) {
      console.error('❌ Invalid environment configuration:', error);
      process.exit(1);
    }
  }
  return cachedConfig;
}

export function isDevelopment(): boolean {
  return getConfig().NODE_ENV === 'development';
}

export function isProduction(): boolean {
  return getConfig().NODE_ENV === 'production';
}

export function isTest(): boolean {
  return getConfig().NODE_ENV === 'test';
}