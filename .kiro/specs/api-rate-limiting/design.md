# Design Document: API Rate Limiting

## Overview

This document describes the design for a comprehensive API rate limiting system built on top of the existing Express.js + Redis infrastructure. The system enforces tiered quotas, endpoint-specific rules, burst handling, API key management, IP-based blocking, breach detection, multi-channel notifications, and analytics. It is designed to fail open when Redis is unavailable so that a cache outage never takes down the API.

The implementation extends and formalizes the existing code in `middleware/advancedRateLimiter.ts`, `services/AdvancedRateLimitService.ts`, `services/IPBlockingService.ts`, `services/APIKeyManagementService.ts`, and `services/RateLimitBreachNotificationService.ts`. The design treats those files as the authoritative starting point and specifies the precise contracts each component must satisfy.

---

## Architecture

The system is structured as a layered middleware pipeline that sits in front of every Express route. Each layer has a single responsibility and delegates to a backing service that owns the Redis state.

```mermaid
flowchart TD
    REQ[Incoming Request] --> BYPASS{Health / Monitoring\nbypass?}
    BYPASS -- yes --> NEXT[next()]
    BYPASS -- no --> WHITELIST{IP Whitelisted?}
    WHITELIST -- yes --> NEXT
    WHITELIST -- no --> IPBLOCK{IP Blocked?}
    IPBLOCK -- yes --> R403A[HTTP 403]
    IPBLOCK -- no --> DDOS{DDOS Pattern?}
    DDOS -- yes --> R429A[HTTP 429]
    DDOS -- no --> BLACKLIST{User Blacklisted?}
    BLACKLIST -- yes --> R403B[HTTP 403]
    BLACKLIST -- no --> APIKEY{API Key\nRequest?}
    APIKEY -- yes --> APIKEYVAL{Key Valid?}
    APIKEYVAL -- no --> R401[HTTP 401]
    APIKEYVAL -- yes --> APIKEYLIMIT{Key Rate\nLimit OK?}
    APIKEYLIMIT -- no --> R429B[HTTP 429]
    APIKEYLIMIT -- yes --> TIERLIMIT{Tier Quota\nOK?}
    APIKEY -- no --> TIERLIMIT
    TIERLIMIT -- no --> BREACH[Detect Breach] --> NOTIFY[Notify] --> R429C[HTTP 429]
    TIERLIMIT -- yes --> BURST{Burst\nHandling?}
    BURST -- exceeded --> BACKOFF[Exponential\nBack-off] --> HEADERS[Set Headers] --> NEXT
    BURST -- ok --> HEADERS
```

**Key design decisions:**

- **Fail-open**: every `try/catch` in middleware calls `next()` on error so Redis failures never block traffic.
- **Redis as single source of truth**: all counters, block records, API key hashes, and metrics live in Redis. No in-process state is shared across instances.
- **Sliding fixed-window**: counters are keyed by `floor(now / windowMs) * windowMs` so windows reset predictably and the key space is bounded.
- **Separation of concerns**: each service owns exactly one domain (rate counting, IP blocking, API keys, notifications). The middleware orchestrates them but does not duplicate logic.

---

## Components and Interfaces

### Middleware Stack (execution order)

| Order | Middleware | File |
|-------|-----------|------|
| 1 | `advancedRateLimiter` | `middleware/advancedRateLimiter.ts` |
| 2 | `burstHandler` | `middleware/advancedRateLimiter.ts` |
| 3 | `apiKeyRateLimiter` | `middleware/advancedRateLimiter.ts` |

### AdvancedRateLimitService

Owns tier resolution, quota counting, metrics recording, and breach detection.

```typescript
interface IAdvancedRateLimitService {
  getUserRateLimitProfile(userId: string): Promise<UserRateLimitProfile>;
  setUserRateLimitProfile(profile: UserRateLimitProfile): Promise<void>;
  getEffectiveRateLimit(req: Request, profile?: UserRateLimitProfile): Promise<RateLimitTier>;
  checkRateLimit(req: Request, tier: RateLimitTier): Promise<RateLimitCheckResult>;
  recordMetrics(req: Request, tier: RateLimitTier, result: RateLimitCheckResult): Promise<void>;
  detectBreach(req: Request, tier: RateLimitTier, result: RateLimitCheckResult): Promise<RateLimitBreach | null>;
  getAnalytics(window: TimeWindow): Promise<RateLimitAnalytics>;
  getBreachHistory(limit: number): Promise<RateLimitBreach[]>;
  onBreach(cb: (breach: RateLimitBreach) => void): void;
}
```

### IPBlockingService

Owns IP block records, whitelist, abuse pattern counters, and audit log.

```typescript
interface IIPBlockingService {
  isIPBlocked(ip: string): Promise<IPBlockRecord | null>;
  isIPWhitelisted(ip: string): Promise<boolean>;
  blockIP(ip: string, reason: string, severity: Severity, autoBlock: boolean, evidence: object): Promise<IPBlockRecord>;
  unblockIP(ip: string): Promise<boolean>;
  recordAbuse(ip: string, patternType: AbusePatternType, details: object): Promise<void>;
  analyzeDDOSPattern(ip: string, endpoint: string, method: string): Promise<boolean>;
  getBlockedIPs(limit: number, offset: number): Promise<IPBlockRecord[]>;
  whitelistIP(ip: string): Promise<void>;
  removeFromWhitelist(ip: string): Promise<void>;
  getAuditLog(date: Date): Promise<IPBlockRecord[]>;
}
```

### APIKeyManagementService

Owns key generation, hashing, validation, rate counting per key, and revocation.

```typescript
interface IAPIKeyManagementService {
  generateAPIKey(userId: string, name: string, config: APIKeyConfig): Promise<{ apiKey: string; keyId: string }>;
  validateAPIKey(req: Request): Promise<APIKeyValidationResult>;
  checkRateLimit(keyId: string, keyData: APIKey): Promise<RateLimitCheckResult>;
  revokeAPIKey(keyId: string): Promise<boolean>;
  getAPIKeyDetails(keyId: string): Promise<APIKey | null>;
  getUserAPIKeys(userId: string): Promise<APIKey[]>;
  updateLastUsed(keyId: string): Promise<void>;
}
```

### RateLimitBreachNotificationService

Owns channel dispatch, preference storage, quiet-hours logic, and breach caching.

```typescript
interface INotificationService {
  notifyBreach(breach: RateLimitBreach): Promise<void>;
  setNotificationPreferences(prefs: NotificationPreference, userId?: string): Promise<void>;
  getNotificationPreferences(userId?: string): Promise<NotificationPreference>;
  getBreachHistory(limit: number, offset: number): Promise<RateLimitBreach[]>;
}
```

### RateLimitController

Exposes HTTP endpoints for analytics, breach history, user profile management, and IP block management.

```typescript
// GET  /api/rate-limit/analytics?start=&end=
// GET  /api/rate-limit/breaches?limit=
// GET  /api/rate-limit/profile/:userId
// PUT  /api/rate-limit/profile/:userId
// POST /api/rate-limit/ip/block
// DELETE /api/rate-limit/ip/:ip/block
// GET  /api/rate-limit/ip/blocked
```

---

## Data Models

### Redis Key Schema

| Key Pattern | TTL | Description |
|-------------|-----|-------------|
| `rate_limit:user:{id}:{path}:{method}:{window}` | windowMs | Per-user quota counter |
| `rate_limit:ip:{ip}:{path}:{method}:{window}` | windowMs | Per-IP quota counter |
| `rate_limit:profile:{userId}` | 300 s | Cached user tier profile |
| `rate_limit:burst:{id}:{path}:{method}:{window}` | windowMs | Burst counter |
| `api_key:{keyId}` | key TTL or none | Full API key record |
| `api_key_hash:{sha256}` | key TTL or none | Hash → keyId index |
| `api_key_usage:{keyId}:{window}` | windowMs | Per-key request counter |
| `ip_block:{ip}` | severity duration | IP block record |
| `ip_abuse:{ip}:{pattern}:{window}` | pattern windowMs | Abuse event counter |
| `ip_whitelist` | none | JSON array of whitelisted IPs |
| `ip_block_audit:{YYYY-MM-DD}` | 30 days | Daily block audit log |
| `breach:{breachId}` | 7 days | Breach record |
| `breach_cache:{breachId}` | 30 days | Breach notification cache |
| `rate_metrics:{ts}:{rand}` | 30 days | Per-request metrics entry |
| `notification_pref:global` | none | Global notification preferences |
| `notification_pref:user:{userId}` | none | Per-user notification preferences |

### Core TypeScript Types

```typescript
// Tier configuration
interface RateLimitTier {
  name: string;                  // FREE | BASIC | PREMIUM | ENTERPRISE | UNLIMITED | BLOCKED
  requestsPerWindow: number;
  windowMs: number;
  burstCapacity?: number;
  priority: number;              // 0–5; 0 = BLOCKED
  features: RateLimitFeatures;
}

interface RateLimitFeatures {
  burstHandling: boolean;
  analytics: boolean;
  customRules: boolean;
  endpointSpecific: boolean;
  methodSpecific: boolean;
  roleBased: boolean;
  breachAlerts: boolean;
}

// User profile stored in Redis
interface UserRateLimitProfile {
  userId: string;
  tier: RateLimitTierType;       // FREE | BASIC | PREMIUM | ENTERPRISE | UNLIMITED
  customLimits?: Record<string, number>;
  whitelist: boolean;
  blacklist: boolean;
  metadata: Record<string, unknown>;
}

// Result of a quota check
interface RateLimitCheckResult {
  allowed: boolean;
  remaining: number;
  resetTime: Date;
  burstUsed?: number;
}

// Breach record
interface RateLimitBreach {
  id: string;
  userId?: string;
  ip: string;
  endpoint: string;
  breachType: 'RATE_LIMIT' | 'BURST' | 'SUSPICIOUS' | 'DDOS';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  timestamp: Date;
  details: Record<string, unknown>;
  resolved: boolean;
}

// IP block record
interface IPBlockRecord {
  ip: string;
  reason: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  blockedAt: Date;
  expiresAt: Date;
  evidence: Record<string, unknown>;
  autoBlock: boolean;
}

// API key record (stored in Redis; raw key never persisted)
interface APIKey {
  id: string;
  keyHash: string;               // SHA-256 of raw key
  name: string;
  description?: string;
  userId: string;
  tier: 'FREE' | 'BASIC' | 'PREMIUM' | 'ENTERPRISE';
  rateLimit: number;
  windowMs: number;
  endpoints: string[] | '*';
  isActive: boolean;
  lastUsed?: Date;
  createdAt: Date;
  expiresAt?: Date;
  metadata: Record<string, unknown>;
}

// Notification preference
interface NotificationPreference {
  userId?: string;
  channels: NotificationChannel[];
  breachThreshold: number;
  quietHours?: { start: number; end: number };  // 0–23 hours
  enabled: boolean;
}

interface NotificationChannel {
  type: 'email' | 'slack' | 'pagerduty' | 'webhook' | 'sms';
  config: Record<string, string>;
  enabled: boolean;
  minSeverity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}
```

### Tier Defaults

| Tier | Requests / 15 min | Burst Capacity | Priority |
|------|-------------------|----------------|----------|
| FREE | 100 | 20 | 1 |
| BASIC | 500 | 100 | 2 |
| PREMIUM | 2 000 | 400 | 3 |
| ENTERPRISE | 10 000 | 2 000 | 4 |
| UNLIMITED | ∞ | ∞ | 5 |
| BLOCKED | 0 | 0 | 0 |

### Severity → Block Duration

| Severity | Duration |
|----------|----------|
| LOW | 15 minutes |
| MEDIUM | 1 hour |
| HIGH | 24 hours |
| CRITICAL | 30 days |

### Abuse Pattern Thresholds

| Pattern | Threshold | Window | Resulting Severity |
|---------|-----------|--------|--------------------|
| RATE_LIMIT_BREACH | 10 | 1 hour | MEDIUM |
| FAILED_AUTH | 20 | 15 min | MEDIUM |
| MALICIOUS_PAYLOAD | 3 | 1 hour | HIGH |
| DDOS_PATTERN | 100 req to single endpoint | 10 sec | CRITICAL |

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Tier quota is enforced

*For any* user tier and any sequence of requests, once the request count within a window reaches the tier's `requestsPerWindow` limit, every subsequent request in that window must be rejected with HTTP 429.

**Validates: Requirements 1.1, 1.7**

---

### Property 2: Whitelist bypasses all checks

*For any* IP address on the whitelist, every request from that IP must be allowed regardless of tier quota, burst counter, or block status.

**Validates: Requirements 1.3, 5.8**

---

### Property 3: Blacklist blocks before quota check

*For any* user whose profile has `blacklist: true`, every request must be rejected with HTTP 403 before any quota counter is incremented.

**Validates: Requirements 1.4**

---

### Property 4: Role multiplier scales quota

*For any* user with a given tier and role, the effective `requestsPerWindow` must equal `floor(tierBase × roleMultiplier × methodMultiplier)`.

**Validates: Requirements 1.5, 1.6**

---

### Property 5: Endpoint-specific rule overrides tier default

*For any* request matching an endpoint-specific rule, the quota and window used must be those of the endpoint rule, not the caller's tier default.

**Validates: Requirements 2.1–2.6**

---

### Property 6: Burst back-off is bounded

*For any* burst counter value that exceeds the tier's `burstCapacity`, the delay introduced must be `min(1000 × 2^(burstUsed − burstCapacity), 10000)` milliseconds — never more than 10 seconds.

**Validates: Requirements 3.2**

---

### Property 7: Burst header is always set

*For any* request processed by the burst handler when `burstHandling` is enabled, the response must include the `X-RateLimit-Burst` header set to the current burst counter value.

**Validates: Requirements 3.5**

---

### Property 8: API key round-trip

*For any* generated API key, hashing the raw key and looking up the resulting hash in Redis must return the original key record with matching `id`, `userId`, and `tier`.

**Validates: Requirements 4.1, 4.2, 4.3**

---

### Property 9: Revoked key is immediately invalid

*For any* API key that has been revoked, every subsequent validation attempt must return `valid: false` — the hash index must be absent from Redis and the key record must be marked inactive.

**Validates: Requirements 4.8**

---

### Property 10: Expired key is treated as invalid

*For any* API key whose `expiresAt` is in the past, validation must return `valid: false` with an appropriate error message.

**Validates: Requirements 4.10**

---

### Property 11: IP block duration matches severity

*For any* IP block created with a given severity, the `expiresAt` timestamp must equal `blockedAt + severityDuration` where `severityDuration` is the value from the severity-duration table (LOW=15 min, MEDIUM=1 h, HIGH=24 h, CRITICAL=30 days).

**Validates: Requirements 5.1**

---

### Property 12: Abuse threshold triggers auto-block

*For any* IP that accumulates abuse events equal to or exceeding the pattern threshold within the pattern window, the IP must be automatically blocked at the pattern's severity level.

**Validates: Requirements 5.2, 5.3, 5.4, 5.5**

---

### Property 13: Notification channel severity filter

*For any* breach and any notification channel, a notification must be dispatched to that channel if and only if the breach severity is greater than or equal to the channel's `minSeverity` threshold.

**Validates: Requirements 7.2**

---

### Property 14: Quiet hours suppress notifications

*For any* notification preference with quiet hours configured, no notification must be dispatched while the current hour falls within the quiet hours window.

**Validates: Requirements 7.3**

---

### Property 15: PagerDuty dedup key is breach ID

*For any* PagerDuty notification, the `dedup_key` field in the payload must equal the breach's `id`.

**Validates: Requirements 7.6**

---

### Property 16: Analytics default window is 24 hours

*For any* analytics query with no explicit time window, the returned data must cover exactly the 24-hour period ending at the query time.

**Validates: Requirements 8.4**

---

### Property 17: Fail-open on Redis error

*For any* request where the Redis call throws an error during rate limit check, IP block check, or API key validation, the request must be allowed to proceed (next() called) and the error must be logged.

**Validates: Requirements 10.1, 10.2, 10.3**

---

## Error Handling

### Redis Unavailability

All three middleware functions (`advancedRateLimiter`, `burstHandler`, `apiKeyRateLimiter`) wrap their entire body in `try/catch`. On any Redis error the catch block calls `next()` and logs the error. This is the fail-open contract from Requirement 10.

### Invalid API Keys

`validateAPIKey` returns `{ valid: false, error: string }` rather than throwing. The middleware translates this to HTTP 401 with the error message in the response body.

### Expired IP Blocks

`isIPBlocked` checks `expiresAt` on every read and deletes the stale key before returning `null`. This prevents stale blocks from persisting beyond their TTL even if Redis TTL eviction is delayed.

### Notification Channel Failures

`sendToChannels` maps each channel dispatch to a promise that catches its own error, logs it, and resolves. `Promise.all` therefore never rejects due to a single channel failure, satisfying Requirement 7.8.

### Breach Detection Errors

`detectBreach` is called only after a request is already being rejected. If it throws, the error is caught by the outer middleware handler and the 429 response is still sent — breach recording is best-effort.

---

## Testing Strategy

### Unit Tests

Unit tests cover specific examples, edge cases, and error conditions using Jest + `ts-jest`. Redis is mocked with `ioredis-mock` or manual jest mocks.

Focus areas:
- Tier quota calculation with role and method multipliers
- Endpoint-specific rule matching (exact path + method + role)
- Burst back-off delay formula
- API key hash generation and comparison
- Severity → block duration mapping
- Quiet hours boundary conditions (midnight-spanning windows)
- Fail-open: middleware calls `next()` when Redis throws
- Notification channel severity filter logic

### Property-Based Tests

Property tests use **fast-check** (already compatible with the Jest setup) to verify universal properties across randomly generated inputs. Each test runs a minimum of 100 iterations.

**Library**: `fast-check` (`npm install --save-dev fast-check`)

Each test is tagged with a comment in the format:
`// Feature: api-rate-limiting, Property N: <property text>`

**Property test mapping:**

| Property | Test description |
|----------|-----------------|
| P1 | Generate random tier + request count > limit; assert all excess requests return 429 |
| P2 | Generate random IPs; add to whitelist; assert all requests allowed regardless of quota |
| P3 | Generate random users with blacklist=true; assert 403 before counter increment |
| P4 | Generate random tier + role + method; assert effective limit = floor(base × roleM × methodM) |
| P5 | Generate random requests matching endpoint rules; assert endpoint quota used not tier quota |
| P6 | Generate random burst excess values; assert delay ≤ 10 000 ms and matches formula |
| P7 | Generate random requests with burstHandling=true; assert X-RateLimit-Burst header present |
| P8 | Generate random key configs; generate key; hash raw key; assert lookup returns same record |
| P9 | Generate random keys; revoke; assert all subsequent validations return valid=false |
| P10 | Generate random keys with past expiresAt; assert validation returns valid=false |
| P11 | Generate random severities; block IP; assert expiresAt = blockedAt + severityDuration |
| P12 | Generate random IPs; simulate threshold+1 abuse events; assert IP is blocked |
| P13 | Generate random breaches + channels; assert dispatch iff severity ≥ minSeverity |
| P14 | Generate random quiet-hour windows + timestamps; assert no dispatch during quiet hours |
| P15 | Generate random breaches; send PagerDuty notification; assert dedup_key = breach.id |
| P16 | Query analytics with no window; assert start = now − 24 h, end = now (±1 s tolerance) |
| P17 | Inject Redis mock that throws; assert middleware calls next() and logs error |

### Integration Tests

Integration tests use `supertest` against a running Express app with a real Redis instance (or `ioredis-mock`). They verify the full middleware pipeline end-to-end:

- Full request lifecycle: whitelist → block check → tier check → headers set
- Endpoint-specific limits applied correctly on sensitive routes
- API key authentication flow: generate → use → rate limit → revoke → reject
- IP auto-block triggered after threshold breaches
- Analytics endpoint returns correct aggregated data
