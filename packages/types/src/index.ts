// Base domain event structure
export interface DomainEvent<T = unknown> {
  id: string;
  type: string;
  data: T;
  timestamp: string;
  version?: number;
  correlationId?: string;
  causationId?: string;
}

// User related types
export interface User {
  id: string;
  email: string;
  password: string;
  roles: Role[];
  profile?: UserProfile;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserProfile {
  firstName?: string;
  lastName?: string;
  avatar?: string;
  phone?: string;
}

export type Role = 'user' | 'admin' | 'service';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface JWTPayload {
  userId: string;
  email: string;
  roles: Role[];
  iat: number;
  exp: number;
}

// Product related types
export interface Product {
  id: string;
  sku: string;
  name: string;
  description?: string;
  price: number;
  stock: number;
  category?: string;
  tags: string[];
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// Order related types
export interface Order {
  id: string;
  userId: string;
  items: OrderItem[];
  status: OrderStatus;
  totals: OrderTotals;
  shippingAddress?: Address;
  createdAt: Date;
  updatedAt: Date;
}

export interface OrderItem {
  productId: string;
  sku: string;
  name: string;
  quantity: number;
  price: number;
  total: number;
}

export type OrderStatus = 'created' | 'confirmed' | 'shipped' | 'delivered' | 'cancelled';

export interface OrderTotals {
  subtotal: number;
  tax: number;
  shipping: number;
  total: number;
}

export interface Address {
  street: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
}

// Inventory related types
export interface InventoryItem {
  id: string;
  productId: string;
  sku: string;
  available: number;
  reserved: number;
  total: number;
  reorderLevel: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface InventoryReservation {
  id: string;
  orderId: string;
  productId: string;
  quantity: number;
  status: 'pending' | 'confirmed' | 'released';
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

// Notification related types
export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  data?: Record<string, unknown>;
  channels: NotificationChannel[];
  read: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type NotificationType = 'order' | 'product' | 'system' | 'marketing';
export type NotificationChannel = 'email' | 'push' | 'sms' | 'in-app';

// Domain events
export interface UserCreatedEvent {
  userId: string;
  email: string;
  roles: Role[];
}

export interface UserUpdatedEvent {
  userId: string;
  changes: Partial<User>;
}

export interface OrderCreatedEvent {
  orderId: string;
  userId: string;
  items: OrderItem[];
  totals: OrderTotals;
}

export interface OrderUpdatedEvent {
  orderId: string;
  userId: string;
  previousStatus: OrderStatus;
  currentStatus: OrderStatus;
  changes: Partial<Order>;
}

export interface ProductCreatedEvent {
  productId: string;
  sku: string;
  name: string;
  stock: number;
}

export interface ProductUpdatedEvent {
  productId: string;
  sku: string;
  changes: Partial<Product>;
  previousStock?: number;
  currentStock?: number;
}

export interface InventoryReservedEvent {
  reservationId: string;
  orderId: string;
  productId: string;
  quantity: number;
}

export interface InventoryReleasedEvent {
  reservationId: string;
  orderId: string;
  productId: string;
  quantity: number;
}

// API Response types
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  timestamp: string;
  requestId?: string;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

// Request types
export interface PaginationQuery {
  page?: number;
  limit?: number;
  sort?: string;
  order?: 'asc' | 'desc';
}

export interface CreateUserRequest {
  email: string;
  password: string;
  roles?: Role[];
  profile?: UserProfile;
}

export interface UpdateUserRequest {
  profile?: Partial<UserProfile>;
  roles?: Role[];
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RefreshTokenRequest {
  refreshToken: string;
}

export interface CreateProductRequest {
  sku: string;
  name: string;
  description?: string;
  price: number;
  stock: number;
  category?: string;
  tags?: string[];
}

export interface UpdateProductRequest {
  name?: string;
  description?: string;
  price?: number;
  stock?: number;
  category?: string;
  tags?: string[];
  active?: boolean;
}

export interface CreateOrderRequest {
  items: {
    productId: string;
    quantity: number;
  }[];
  shippingAddress?: Address;
}

export interface UpdateOrderStatusRequest {
  status: OrderStatus;
  reason?: string;
}

// WebSocket types
export interface WebSocketMessage<T = unknown> {
  event: string;
  data: T;
  requestId?: string;
}

export interface WebSocketError {
  event: 'error';
  data: {
    message: string;
    code?: string;
  };
}

// SSE types
export interface SSEMessage<T = unknown> {
  id?: string;
  event: string;
  data: T;
  retry?: number;
}

// Health check types
export interface HealthCheck {
  status: 'healthy' | 'unhealthy' | 'degraded';
  timestamp: string;
  uptime: number;
  version: string;
  services: Record<string, ServiceHealth>;
}

export interface ServiceHealth {
  status: 'healthy' | 'unhealthy' | 'degraded';
  latency?: number;
  error?: string;
}