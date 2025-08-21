import { createServer } from 'http';

import type { FastifyInstance } from 'fastify';
import { Server as SocketIOServer } from 'socket.io';

import { authenticateSocket } from '@enterprise/auth';
import { getConfig } from '@enterprise/config';
import { getEventBus } from '@enterprise/event-bus';
import { logger } from '@enterprise/logger';
import type { JWTPayload, WebSocketMessage, DomainEvent } from '@enterprise/types';

const config = getConfig();

interface AuthenticatedSocket extends SocketIOServer {
  user?: JWTPayload;
}

export function setupSocketIO(app: FastifyInstance): void {
  app.addHook('onReady', async () => {
    const server = app.server as ReturnType<typeof createServer>;
    
    const io = new SocketIOServer(server, {
      cors: {
        origin: config.CORS_ORIGIN,
        credentials: true,
      },
      path: '/ws',
      transports: ['websocket', 'polling'],
    });

    // Authentication middleware
    io.use(async (socket: any, next) => {
      try {
        const token = socket.handshake.auth.token || socket.handshake.headers.authorization;
        
        if (!token) {
          return next(new Error('Authentication token required'));
        }

        const user = authenticateSocket(token);
        socket.user = user;
        
        logger.info({ userId: user.userId, socketId: socket.id }, 'Socket authenticated');
        next();
      } catch (error) {
        logger.warn({ error: (error as Error).message, socketId: socket.id }, 'Socket authentication failed');
        next(new Error('Authentication failed'));
      }
    });

    // Connection handling
    io.on('connection', async (socket: any) => {
      const user = socket.user as JWTPayload;
      
      logger.info({ userId: user.userId, socketId: socket.id }, 'Socket connected');

      // Join user room for targeted messages
      await socket.join(`user:${user.userId}`);

      // Join role-based rooms
      user.roles.forEach(role => {
        socket.join(`role:${role}`);
      });

      // Handle ping/pong for connection health
      socket.on('ping', (callback: (data: any) => void) => {
        callback({ timestamp: Date.now() });
      });

      // Handle custom events
      socket.on('subscribe', (data: { events: string[] }) => {
        data.events.forEach(eventType => {
          socket.join(`event:${eventType}`);
        });
        
        logger.debug({ 
          userId: user.userId, 
          socketId: socket.id, 
          events: data.events 
        }, 'Socket subscribed to events');
      });

      socket.on('unsubscribe', (data: { events: string[] }) => {
        data.events.forEach(eventType => {
          socket.leave(`event:${eventType}`);
        });
        
        logger.debug({ 
          userId: user.userId, 
          socketId: socket.id, 
          events: data.events 
        }, 'Socket unsubscribed from events');
      });

      socket.on('disconnect', (reason) => {
        logger.info({ 
          userId: user.userId, 
          socketId: socket.id, 
          reason 
        }, 'Socket disconnected');
      });

      socket.on('error', (error: Error) => {
        logger.error({ 
          userId: user.userId, 
          socketId: socket.id, 
          error 
        }, 'Socket error');
      });
    });

    // Setup event bus consumer to broadcast events
    const eventBus = await getEventBus();

    // Subscribe to all domain events and broadcast to connected sockets
    await eventBus.subscribeToPattern('*', async (event: DomainEvent) => {
      try {
        const message: WebSocketMessage = {
          event: event.type,
          data: event.data,
          requestId: event.id,
        };

        // Broadcast to event subscribers
        io.to(`event:${event.type}`).emit(event.type, message);

        // Handle specific event types with targeted broadcasting
        if (event.type.startsWith('user.') && event.data && typeof event.data === 'object' && 'userId' in event.data) {
          const userId = (event.data as any).userId;
          io.to(`user:${userId}`).emit(event.type, message);
        }

        if (event.type.startsWith('order.') && event.data && typeof event.data === 'object' && 'userId' in event.data) {
          const userId = (event.data as any).userId;
          io.to(`user:${userId}`).emit(event.type, message);
        }

        logger.debug({ 
          eventType: event.type, 
          eventId: event.id 
        }, 'Event broadcasted via WebSocket');

      } catch (error) {
        logger.error({ error, event }, 'Failed to broadcast event via WebSocket');
      }
    }, { queue: 'gateway.websocket.broadcast' });

    logger.info('Socket.IO server initialized');
  });
}