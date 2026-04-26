// ─── Primitive status types ───────────────────────────────────────────────────

export type AsyncStatus = 'idle' | 'loading' | 'success' | 'error';
/** @deprecated Use AsyncStatus */
export type TransactionStatus = AsyncStatus;

export type PaymentStatus = 'PENDING' | 'SUCCESS' | 'FAILED' | 'PROCESSING';

export enum TransactionStep {
  IDLE = 'idle',
  CONNECTING = 'connecting',
  SIGNING = 'signing',
  SUBMITTING = 'submitting',
  FINALIZING = 'finalizing',
  COMPLETE = 'complete',
}

export type WalletProvider = 'freighter' | 'albedo' | 'walletconnect';

// ─── API response envelope ────────────────────────────────────────────────────

/**
 * Standard success envelope returned by every backend endpoint.
 *
 * @example
 * const res = await apiClient.get<ApiResponse<User>>('/user/profile');
 * const user = res.data.data;
 */
export interface ApiResponse<T = unknown> {
  success: true;
  data: T;
  message?: string;
  /** ISO-8601 timestamp */
  generated_at?: string;
}

/**
 * Standard error envelope returned by every backend endpoint on failure.
 */
export interface ApiErrorResponse {
  success: false;
  error: string;
  message?: string;
  /** HTTP status code mirrored in the body */
  status?: number;
  /** Seconds until the client may retry (rate-limit responses) */
  retryAfter?: number;
  resetTime?: string;
  tier?: string;
}

/** Union of the two envelope shapes. */
export type ApiResult<T = unknown> = ApiResponse<T> | ApiErrorResponse;

/**
 * Paginated list wrapper used by list endpoints.
 */
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

// ─── Auth types ───────────────────────────────────────────────────────────────

export type UserRole = 'USER' | 'ADMIN' | 'SUPER_ADMIN';

export interface User {
  id: string;
  email: string;
  username?: string;
  name?: string;
  role: UserRole;
  walletAddress?: string;
  isEmailVerified: boolean;
  twoFactorEnabled: boolean;
  lastLoginAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface LoginCredentials {
  email: string;
  password: string;
  twoFactorCode?: string;
}

export interface RegisterData {
  email: string;
  password: string;
  username?: string;
  name?: string;
  phoneNumber?: string;
}

export interface AuthTokens {
  token: string;
  refreshToken: string;
}

export interface AuthResponse {
  success: boolean;
  user?: User;
  token?: string;
  refreshToken?: string;
  requiresTwoFactor?: boolean;
  twoFactorMethods?: string[];
  error?: string;
}

export interface TokenStatusResponse {
  warningLevel: 'ok' | 'warning' | 'critical';
  message: string;
  actionRequired: boolean;
  expiresAt: string;
  remainingSeconds: number;
}

// ─── User profile types ───────────────────────────────────────────────────────

export interface UserProfile extends User {
  phoneNumber?: string;
  address?: string;
  avatar?: string;
  preferences?: UserPreferences;
}

export interface UserPreferences {
  theme: 'light' | 'dark' | 'system';
  language: string;
  notifications: {
    email: boolean;
    sms: boolean;
    push: boolean;
    inApp: boolean;
  };
  currency: string;
  timezone: string;
}

// ─── Transaction / payment types ──────────────────────────────────────────────

export interface Transaction {
  id: string;
  amount: string;
  meterId: string;
  status: PaymentStatus;
  date: string;
  transactionHash?: string;
  createdAt: string;
  updatedAt: string;
  description?: string;
  fee?: string;
  recipient?: string;
}

/** @deprecated Use PaginatedResponse<Transaction> */
export interface TransactionHistory {
  transactions: Transaction[];
  totalCount: number;
  currentPage: number;
  totalPages: number;
  hasNextPage: boolean;
}

export interface TransactionFilters {
  dateFrom?: string;
  dateTo?: string;
  meterId?: string;
  status?: PaymentStatus;
  minAmount?: string;
  maxAmount?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export interface ReceiptData {
  transaction: Transaction;
  receiptNumber: string;
  issuedAt: string;
  paymentMethod: string;
  customerInfo: {
    name: string;
    email: string;
    phone?: string;
  };
}

export interface PaymentFormData {
  destination: string;
  amount: string;
  meterNumber?: string;
}

// ─── Wallet / Stellar types ───────────────────────────────────────────────────

export interface WalletState {
  address: string | null;
  balance: string;
  provider: WalletProvider | null;
  status: AsyncStatus;
  currentStep: TransactionStep;
  txHash: string | null;
  history: Transaction[];
  error: string | null;
}

export interface StellarState {
  address: string | null;
  status: AsyncStatus;
  error: string | null;
}

// ─── Rate limiting types ──────────────────────────────────────────────────────

export type RateLimitTier = 'FREE' | 'BASIC' | 'PREMIUM' | 'ENTERPRISE' | 'UNLIMITED';

export interface RateLimitHeaders {
  /** Maximum requests allowed in the window */
  limit: number;
  /** Requests remaining in the current window */
  remaining: number;
  /** ISO-8601 timestamp when the window resets */
  reset: string;
  /** User's current tier */
  tier: RateLimitTier;
  /** Burst tokens used */
  burst?: number;
}

export interface RateLimitError {
  status: 429;
  error: string;
  message: string;
  tier: RateLimitTier;
  retryAfter: number;
  resetTime: string;
}

// ─── Notification types ───────────────────────────────────────────────────────

export type NotificationType =
  | 'INFO'
  | 'SUCCESS'
  | 'WARNING'
  | 'ERROR'
  | 'BILL_CREATED'
  | 'BILL_OVERDUE'
  | 'PAYMENT_CONFIRMED'
  | 'SYSTEM_ALERT';

export type NotificationPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  data?: unknown;
  priority: NotificationPriority;
  category?: 'BILLING' | 'PAYMENT' | 'SYSTEM' | 'USER' | 'SECURITY';
  actionUrl?: string;
  actionText?: string;
  isRead: boolean;
  createdAt: string;
  readAt?: string;
  expiresAt?: string;
}

// ─── Analytics types ──────────────────────────────────────────────────────────

export interface DashboardStats {
  totalRevenue: number;
  overdueBills: number;
  pendingBills: number;
  successfulPayments: number;
  failedPayments: number;
  successRate: number;
  todayRevenue: number;
  activeUsers: number;
}

export interface RevenueDataPoint {
  date: string;
  value: number;
}

// ─── Loading state helpers ────────────────────────────────────────────────────

/**
 * Generic async state container used by hooks and components.
 *
 * @example
 * const [state, setState] = useState<AsyncState<User>>({ status: 'idle' });
 */
export type AsyncState<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'error'; error: string };
