import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

import { requireAuth } from '@enterprise/auth';
import { getEventBus } from '@enterprise/event-bus';
import { logger } from '@enterprise/logger';
import type { DomainEvent, JWTPayload, SSEMessage } from '@enterprise/types';

interface SSEClient {
  id: string;
  userId: string;
  reply: FastifyReply;
  subscriptions: Set<string>;
  lastPing: number;
}

class SSEManager {
  private clients = new Map<string, SSEClient>();
  private pingInterval?: NodeJS.Timeout;

  constructor() {
    // Start ping interval to keep connections alive
    this.pingInterval = setInterval(() => {
      this.pingClients();
    }, 30000); // 30 seconds
  }

  addClient(client: SSEClient): void {
    this.clients.set(client.id, client);
    logger.info({ userId: client.userId, clientId: client.id }, 'SSE client connected');

    // Send initial connection message
    this.sendToClient(client.id, {
      event: 'connected',
      data: { timestamp: new Date().toISOString() },
    });
  }

  removeClient(clientId: string): void {
    const client = this.clients.get(clientId);
    if (client) {
      this.clients.delete(clientId);
      logger.info({ userId: client.userId, clientId }, 'SSE client disconnected');
    }
  }

  sendToClient(clientId: string, message: SSEMessage): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    try {
      const data = typeof message.data === 'string' ? message.data : JSON.stringify(message.data);
      
      let sseData = '';
      if (message.id) sseData += `id: ${message.id}\n`;
      if (message.event) sseData += `event: ${message.event}\n`;
      sseData += `data: ${data}\n\n`;

      client.reply.raw.write(sseData);
    } catch (error) {
      logger.error({ error, clientId }, 'Failed to send SSE message');
      this.removeClient(clientId);
    }
  }

  sendToUser(userId: string, message: SSEMessage): void {
    for (const [clientId, client] of this.clients) {
      if (client.userId === userId) {
        this.sendToClient(clientId, message);
      }
    }
  }

  broadcastToSubscribers(eventType: string, message: SSEMessage): void {
    for (const [clientId, client] of this.clients) {
      if (client.subscriptions.has(eventType) || client.subscriptions.has('*')) {
        this.sendToClient(clientId, message);
      }
    }
  }

  subscribeClient(clientId: string, eventTypes: string[]): void {
    const client = this.clients.get(clientId);
    if (client) {
      eventTypes.forEach(eventType => client.subscriptions.add(eventType));
      logger.debug({ clientId, eventTypes }, 'SSE client subscribed to events');
    }
  }

  unsubscribeClient(clientId: string, eventTypes: string[]): void {
    const client = this.clients.get(clientId);
    if (client) {
      eventTypes.forEach(eventType => client.subscriptions.delete(eventType));
      logger.debug({ clientId, eventTypes }, 'SSE client unsubscribed from events');
    }
  }

  private pingClients(): void {
    const now = Date.now();
    const staleThreshold = 60000; // 1 minute

    for (const [clientId, client] of this.clients) {
      // Remove stale clients
      if (now - client.lastPing > staleThreshold) {
        this.removeClient(clientId);
        continue;
      }

      // Send ping
      this.sendToClient(clientId, {
        event: 'ping',
        data: { timestamp: now },
      });
    }
  }

  shutdown(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
    }

    // Close all client connections
    for (const [clientId, client] of this.clients) {
      client.reply.raw.end();
    }

    this.clients.clear();
  }
}

const sseManager = new SSEManager();

export function setupSSE(app: FastifyInstance): void {
  // General SSE endpoint for notifications
  app.get('/sse/notifications', {
    preHandler: [requireAuth()],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user as JWTPayload;
    const clientId = `${user.userId}-${Date.now()}`;

    // Setup SSE headers
    reply.header('Content-Type', 'text/event-stream');
    reply.header('Cache-Control', 'no-cache');
    reply.header('Connection', 'keep-alive');
    reply.header('Access-Control-Allow-Origin', '*');
    reply.header('Access-Control-Allow-Headers', 'Cache-Control');

    const client: SSEClient = {
      id: clientId,
      userId: user.userId,
      reply,
      subscriptions: new Set(['notification.*', `user.${user.userId}.*`]),
      lastPing: Date.now(),
    };

    sseManager.addClient(client);

    // Handle client disconnect
    request.raw.on('close', () => {
      sseManager.removeClient(clientId);
    });

    request.raw.on('error', () => {
      sseManager.removeClient(clientId);
    });

    // Keep the connection open
    reply.hijack();
  });

  // Order-specific SSE endpoint
  app.get('/sse/orders/:userId', {
    preHandler: [requireAuth()],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user as JWTPayload;
    const { userId } = request.params as { userId: string };

    // Users can only subscribe to their own orders (unless admin)
    if (user.userId !== userId && !user.roles.includes('admin')) {
      reply.code(403).send({ error: 'Access denied' });
      return;
    }

    const clientId = `orders-${userId}-${Date.now()}`;

    reply.header('Content-Type', 'text/event-stream');
    reply.header('Cache-Control', 'no-cache');
    reply.header('Connection', 'keep-alive');
    reply.header('Access-Control-Allow-Origin', '*');

    const client: SSEClient = {
      id: clientId,
      userId: user.userId,
      reply,
      subscriptions: new Set(['order.*']),
      lastPing: Date.now(),
    };

    sseManager.addClient(client);

    request.raw.on('close', () => {
      sseManager.removeClient(clientId);
    });

    reply.hijack();
  });

  // Setup event bus consumer to broadcast events via SSE
  app.addHook('onReady', async () => {
    const eventBus = await getEventBus();

    // Subscribe to all domain events and broadcast via SSE
    await eventBus.subscribeToPattern('*', async (event: DomainEvent) => {
      try {
        const message: SSEMessage = {
          id: event.id,
          event: event.type,
          data: event.data,
        };

        // Broadcast to all subscribers of this event type
        sseManager.broadcastToSubscribers(event.type, message);

        // Send targeted messages for specific event types
        if (event.type.startsWith('user.') && event.data && typeof event.data === 'object' && 'userId' in event.data) {
          const userId = (event.data as any).userId;
          sseManager.sendToUser(userId, message);
        }

        if (event.type.startsWith('order.') && event.data && typeof event.data === 'object' && 'userId' in event.data) {
          const userId = (event.data as any).userId;
          sseManager.sendToUser(userId, message);
        }

        logger.debug({ eventType: event.type, eventId: event.id }, 'Event broadcasted via SSE');

      } catch (error) {
        logger.error({ error, event }, 'Failed to broadcast event via SSE');
      }
    }, { queue: 'gateway.sse.broadcast' });

    logger.info('SSE event broadcasting initialized');
  });

  // Graceful shutdown
  app.addHook('onClose', async () => {
    sseManager.shutdown();
  });
}