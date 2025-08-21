# Enterprise Microservices Platform

A production-ready enterprise microservices platform built with Node.js, TypeScript, and MongoDB. This platform demonstrates modern microservices architecture with comprehensive observability, event-driven communication, and real-time capabilities.

## 🏗️ Architecture Overview

### Monorepo Structure
```
enterprise-app/
├── packages/           # Shared libraries
│   ├── config/        # Environment configuration with Zod validation
│   ├── logger/        # Pino logging with request correlation
│   ├── event-bus/     # RabbitMQ abstraction for pub/sub
│   ├── db/           # MongoDB connection and base repository
│   ├── types/        # Shared TypeScript types and DTOs
│   ├── auth/         # JWT authentication and RBAC
│   ├── validation/   # Zod schemas for request validation
│   └── observability/ # OpenTelemetry tracing and metrics
├── apps/
│   └── gateway/      # API Gateway with WebSocket and SSE support
├── services/         # Microservices
│   ├── auth-service/     # User authentication and JWT management
│   ├── user-service/     # User profile management
│   ├── product-service/  # Product catalog and inventory
│   ├── order-service/    # Order processing with SSE streams
│   ├── notification-service/ # Event-driven notifications
│   └── inventory-service/    # Stock management and reservations
└── infra/           # Infrastructure configurations
```

## 🚀 Quick Start

### Prerequisites
- Node.js 20+
- pnpm 8+
- Docker & Docker Compose

### Installation & Setup

1. **Clone and install dependencies:**
```bash
git clone <repository-url>
cd enterprise-app
pnpm install
```

2. **Environment setup:**
```bash
cp .env.example .env
# Edit .env with your configuration
```

3. **Start infrastructure services:**
```bash
pnpm docker:up
```

4. **Start all microservices:**
```bash
pnpm dev
```

### Access Points
- **API Gateway**: http://localhost:8080
- **RabbitMQ Management**: http://localhost:15672 (guest/guest)
- **MongoDB**: mongodb://localhost:27017
- **Redis**: redis://localhost:6379

## 🔧 Core Features

### 🔐 Authentication & Authorization
- JWT-based authentication with access/refresh tokens
- Role-based access control (RBAC)
- Secure password hashing with bcrypt
- WebSocket authentication for real-time features

### 📡 Event-Driven Architecture
- RabbitMQ topic exchange for domain events
- Event sourcing patterns
- Saga pattern for distributed transactions
- Event replay and dead letter queues

### 🔄 Real-Time Communication
- **WebSocket (Socket.IO)**: Real-time bidirectional communication
- **Server-Sent Events (SSE)**: Unidirectional streaming
- Room-based message broadcasting
- Connection management and heartbeat

### 📊 Observability
- **Distributed Tracing**: OpenTelemetry with correlation IDs
- **Structured Logging**: Pino with request correlation
- **Metrics Collection**: Custom business metrics
- **Health Checks**: Comprehensive service health monitoring

### 🛡️ Security & Validation
- Input validation with Zod schemas
- Rate limiting and request throttling
- CORS configuration
- Security headers with Helmet
- SQL injection and XSS protection

## 🏢 Business Domains

### User Management
- User registration and authentication
- Profile management
- Role-based permissions
- Account lifecycle events

### Product Catalog
- Product CRUD operations
- Category and tag management
- Stock level tracking
- Search and filtering

### Order Processing
- Order creation and management
- Status tracking with real-time updates
- Payment integration ready
- Order history and analytics

### Inventory Management
- Stock reservations and releases
- Low stock alerts
- Inventory adjustments
- Reservation expiration handling

### Notifications
- Multi-channel notifications (email, push, SMS, in-app)
- Event-driven notification triggers
- Notification preferences
- Delivery status tracking

## 🔌 API Examples

### Authentication
```bash
# Register new user
curl -X POST http://localhost:8080/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "securepassword123",
    "profile": {
      "firstName": "John",
      "lastName": "Doe"
    }
  }'

# Login
curl -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "securepassword123"
  }'
```

### Products
```bash
# Get products with filtering
curl "http://localhost:8080/api/products?category=electronics&minPrice=100&limit=10"

# Create product (admin only)
curl -X POST http://localhost:8080/api/products \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "sku": "LAPTOP-001",
    "name": "Gaming Laptop",
    "price": 1299.99,
    "stock": 50,
    "category": "electronics"
  }'
```

### Orders
```bash
# Create order
curl -X POST http://localhost:8080/api/orders \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "items": [
      {
        "productId": "product-uuid",
        "quantity": 2
      }
    ],
    "shippingAddress": {
      "street": "123 Main St",
      "city": "New York",
      "state": "NY",
      "zipCode": "10001",
      "country": "USA"
    }
  }'
```

## 🌐 Real-Time Features

### WebSocket Connection
```javascript
import io from 'socket.io-client';

const socket = io('http://localhost:8080/ws', {
  auth: {
    token: 'YOUR_JWT_TOKEN'
  }
});

// Listen for order updates
socket.on('order.updated', (data) => {
  console.log('Order updated:', data);
});

// Subscribe to specific events
socket.emit('subscribe', { events: ['order.*', 'notification.*'] });
```

### Server-Sent Events
```javascript
const eventSource = new EventSource(
  'http://localhost:8080/sse/notifications',
  {
    headers: {
      'Authorization': 'Bearer YOUR_JWT_TOKEN'
    }
  }
);

eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('Notification:', data);
};

// Order-specific SSE stream
const orderStream = new EventSource(
  `http://localhost:8080/sse/orders/${userId}`,
  {
    headers: {
      'Authorization': 'Bearer YOUR_JWT_TOKEN'
    }
  }
);
```

## 🧪 Testing

```bash
# Run all tests
pnpm test

# Run tests for specific service
pnpm --filter @services/auth-service test

# Run with coverage
pnpm test --coverage
```

## 🏗️ Development

### Adding a New Service

1. **Create service structure:**
```bash
mkdir -p services/my-service/src/{routes,models,repositories}
```

2. **Copy package.json template from existing service**

3. **Implement core files:**
   - `src/index.ts` - Service entry point
   - `src/app.ts` - Fastify application setup
   - `src/routes/` - API route handlers
   - `src/models/` - Database models
   - `src/repositories/` - Data access layer

4. **Add to docker-compose.yml**

5. **Update gateway routing**

### Code Quality

```bash
# Lint all packages
pnpm lint

# Format code
pnpm format

# Type checking
pnpm typecheck

# Build all packages
pnpm build
```

## 🐳 Docker Deployment

### Development
```bash
# Start all services
pnpm docker:up

# View logs
pnpm docker:logs

# Rebuild and restart
pnpm docker:rebuild
```

### Production Build
```bash
# Build production images
docker-compose -f docker-compose.prod.yml build

# Deploy to production
docker-compose -f docker-compose.prod.yml up -d
```

## 📈 Monitoring & Observability

### Health Checks
- Individual service health: `GET /health`
- Gateway status: `GET /api/gateway/status`
- Database connectivity monitoring
- External service dependency checks

### Logging
- Structured JSON logging with Pino
- Request correlation with X-Request-ID
- Centralized log aggregation ready
- Log levels: error, warn, info, debug

### Tracing
- OpenTelemetry distributed tracing
- Automatic instrumentation for HTTP, DB, and messaging
- Custom business operation tracing
- Trace correlation across service boundaries

### Metrics
- Business metrics (orders, users, revenue)
- Technical metrics (response times, error rates)
- Infrastructure metrics (CPU, memory, disk)
- Custom application metrics

## 🔧 Configuration

### Environment Variables
Key configuration options in `.env`:

```bash
# Database
MONGODB_URI=mongodb://mongo:27017/enterprise

# Message Queue
RABBITMQ_URL=amqp://guest:guest@rabbitmq:5672

# Authentication
JWT_ACCESS_SECRET=your-secret-key
JWT_REFRESH_SECRET=your-refresh-secret

# Services
GATEWAY_PORT=8080
AUTH_SERVICE_PORT=3001
# ... other service ports
```

### Service Configuration
Each service uses the shared `@enterprise/config` package for:
- Environment variable validation with Zod
- Type-safe configuration access
- Default value management
- Runtime configuration validation

## 🚀 Production Considerations

### Scalability
- Horizontal scaling with load balancers
- Database read replicas
- Message queue clustering
- Caching strategies with Redis

### Security
- API rate limiting
- Input validation and sanitization
- SQL injection prevention
- XSS protection
- CORS configuration
- Security headers

### Reliability
- Circuit breaker patterns
- Retry mechanisms with exponential backoff
- Graceful degradation
- Health checks and auto-recovery
- Database connection pooling

### Performance
- Response caching
- Database query optimization
- Connection pooling
- Async processing
- CDN integration ready

## 📚 Additional Resources

- [Microservices Patterns](https://microservices.io/patterns/)
- [Event Sourcing](https://martinfowler.com/eaaDev/EventSourcing.html)
- [CQRS Pattern](https://docs.microsoft.com/en-us/azure/architecture/patterns/cqrs)
- [OpenTelemetry Documentation](https://opentelemetry.io/docs/)
- [Fastify Documentation](https://www.fastify.io/docs/)

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Run quality checks: `pnpm lint && pnpm test && pnpm typecheck`
6. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

---

**Built with ❤️ using modern Node.js, TypeScript, and cloud-native patterns**