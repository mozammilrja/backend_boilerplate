import {
  trace,
  context,
  SpanKind,
  SpanStatusCode,
  type Span,
  type Tracer,
} from '@opentelemetry/api';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-otlp-http';
import { FastifyInstrumentation } from '@opentelemetry/instrumentation-fastify';
import { MongooseInstrumentation } from '@opentelemetry/instrumentation-mongoose';
import { Resource } from '@opentelemetry/resources';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';

import { getConfig } from '@enterprise/config';
import { logger } from '@enterprise/logger';

const config = getConfig();

let sdk: NodeSDK | null = null;
let tracer: Tracer | null = null;

export function initializeObservability(serviceName: string): void {
  try {
    const resource = new Resource({
      [SemanticResourceAttributes.SERVICE_NAME]: serviceName,
      [SemanticResourceAttributes.SERVICE_VERSION]: '1.0.0',
      [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: config.NODE_ENV,
      [SemanticResourceAttributes.SERVICE_NAMESPACE]: 'enterprise-platform',
    });

    const traceExporter = config.OTEL_EXPORTER_OTLP_ENDPOINT
      ? new OTLPTraceExporter({
          url: `${config.OTEL_EXPORTER_OTLP_ENDPOINT}/v1/traces`,
        })
      : undefined;

    sdk = new NodeSDK({
      resource,
      traceExporter,
      instrumentations: [
        getNodeAutoInstrumentations({
          // Disable some instrumentations that might be noisy
          '@opentelemetry/instrumentation-fs': { enabled: false },
          '@opentelemetry/instrumentation-net': { enabled: false },
          '@opentelemetry/instrumentation-dns': { enabled: false },
        }),
        new FastifyInstrumentation(),
        new MongooseInstrumentation(),
      ],
    });

    sdk.start();

    tracer = trace.getTracer(serviceName, '1.0.0');

    logger.info({ serviceName }, 'OpenTelemetry initialized');
  } catch (error) {
    logger.error({ error }, 'Failed to initialize OpenTelemetry');
  }
}

export function shutdownObservability(): Promise<void> {
  return new Promise((resolve) => {
    if (sdk) {
      sdk.shutdown().then(resolve).catch(resolve);
    } else {
      resolve();
    }
  });
}

export function getTracer(): Tracer {
  if (!tracer) {
    throw new Error('Tracer not initialized. Call initializeObservability first.');
  }
  return tracer;
}

export function createSpan(name: string, options?: { kind?: SpanKind }): Span {
  const currentTracer = getTracer();
  return currentTracer.startSpan(name, {
    kind: options?.kind || SpanKind.INTERNAL,
  });
}

export async function withSpan<T>(
  name: string,
  fn: (span: Span) => Promise<T>,
  options?: { kind?: SpanKind }
): Promise<T> {
  const span = createSpan(name, options);

  try {
    const result = await context.with(trace.setSpan(context.active(), span), () => fn(span));
    span.setStatus({ code: SpanStatusCode.OK });
    return result;
  } catch (error) {
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: error instanceof Error ? error.message : 'Unknown error',
    });
    span.recordException(error as Error);
    throw error;
  } finally {
    span.end();
  }
}

export function addSpanAttributes(attributes: Record<string, string | number | boolean>): void {
  const activeSpan = trace.getActiveSpan();
  if (activeSpan) {
    activeSpan.setAttributes(attributes);
  }
}

export function addSpanEvent(name: string, attributes?: Record<string, string | number | boolean>): void {
  const activeSpan = trace.getActiveSpan();
  if (activeSpan) {
    activeSpan.addEvent(name, attributes);
  }
}

// Database operation tracing
export async function traceDbOperation<T>(
  operation: string,
  collection: string,
  fn: () => Promise<T>
): Promise<T> {
  return withSpan(
    `db.${collection}.${operation}`,
    async (span) => {
      span.setAttributes({
        'db.system': 'mongodb',
        'db.collection.name': collection,
        'db.operation': operation,
      });
      return fn();
    },
    { kind: SpanKind.CLIENT }
  );
}

// HTTP client tracing
export async function traceHttpRequest<T>(
  method: string,
  url: string,
  fn: () => Promise<T>
): Promise<T> {
  return withSpan(
    `http.${method.toLowerCase()}`,
    async (span) => {
      span.setAttributes({
        'http.method': method,
        'http.url': url,
        'http.client': 'fetch',
      });
      return fn();
    },
    { kind: SpanKind.CLIENT }
  );
}

// Message queue tracing
export async function traceEventPublish<T>(
  exchange: string,
  routingKey: string,
  fn: () => Promise<T>
): Promise<T> {
  return withSpan(
    `message.publish`,
    async (span) => {
      span.setAttributes({
        'messaging.system': 'rabbitmq',
        'messaging.destination': exchange,
        'messaging.routing_key': routingKey,
        'messaging.operation': 'publish',
      });
      return fn();
    },
    { kind: SpanKind.PRODUCER }
  );
}

export async function traceEventConsume<T>(
  queue: string,
  routingKey: string,
  fn: () => Promise<T>
): Promise<T> {
  return withSpan(
    `message.consume`,
    async (span) => {
      span.setAttributes({
        'messaging.system': 'rabbitmq',
        'messaging.source': queue,
        'messaging.routing_key': routingKey,
        'messaging.operation': 'receive',
      });
      return fn();
    },
    { kind: SpanKind.CONSUMER }
  );
}

// Business logic tracing
export async function traceBusiness<T>(
  operationName: string,
  entityType: string,
  entityId: string,
  fn: () => Promise<T>
): Promise<T> {
  return withSpan(`business.${entityType}.${operationName}`, async (span) => {
    span.setAttributes({
      'business.operation': operationName,
      'business.entity.type': entityType,
      'business.entity.id': entityId,
    });
    return fn();
  });
}