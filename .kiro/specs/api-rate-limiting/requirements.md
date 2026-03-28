# Requirements Document

## Introduction

This feature implements a comprehensive API rate limiting system to prevent abuse, ensure fair resource usage, and protect the platform from DDoS attacks. The system uses Redis-backed distributed rate limiting with tiered access controls, API key management, IP-based blocking, breach detection, and multi-channel alerting. It integrates with the existing Express.js middleware stack and supports both authenticated users and anonymous API consumers.

## Glossary

- **Rate_Limiter**: The middleware component responsible for enforcing request quotas per client
- **Rate_Limit_Tier**: A named configuration level (FREE, BASIC, PREMIUM, ENTERPRISE, UNLIMITED) that defines request quotas and feature access
- **API_Key_Service**: The service responsible for generating, validating, and managing API keys for external integrations
- **IP_Blocking_Service**: The service responsible for detecting, recording, and enforcing IP-based access restrictions
- **Breach_Detector**: The component that identifies and classifies rate limit violations by type and severity
- **Notification_Service**: The service responsible for dispatching breach alerts across configured channels (email, Slack, PagerDuty, webhook, SMS)
- **Burst_Handler**: The middleware component that manages short-term request spikes within a rate limit window
- **Redis**: The distributed in-memory store used for rate limit counters, IP block records, and API key data
- **Window**: A fixed time interval (e.g., 15 minutes) within which request counts are tracked
- **Breach**: A rate limit violation event, classified by type (RATE_LIMIT, BURST, SUSPICIOUS, DDOS) and severity (LOW, MEDIUM, HIGH, CRITICAL)
- **Whitelist**: A set of IPs or users exempt from rate limiting enforcement
- **Blacklist**: A set of users whose requests are unconditionally blocked

---

## Requirements

### Requirement 1: Tiered Rate Limiting

**User Story:** As a platform operator, I want to enforce different request quotas per user tier, so that resource usage is fair and proportional to subscription level.

#### Acceptance Criteria

1. THE Rate_Limiter SHALL enforce the following default quotas per 15-minute window: FREE tier — 100 requests; BASIC tier — 500 requests; PREMIUM tier — 2000 requests; ENTERPRISE tier — 10000 requests; UNLIMITED tier — no enforced limit.
2. WHEN a request arrives, THE Rate_Limiter SHALL resolve the caller's active tier from the user profile stored in Redis before applying quota checks.
3. WHEN a user's tier is UNLIMITED or the user's IP is on the Whitelist, THE Rate_Limiter SHALL allow the request without decrementing any counter.
4. WHEN a user's profile has the blacklist flag set to true, THE Rate_Limiter SHALL reject the request with HTTP 403 before performing any quota check.
5. THE Rate_Limiter SHALL apply role-based multipliers to the base tier quota: USER role — 1.0×; ADMIN role — 2.0×; SUPER_ADMIN role — 5.0×.
6. THE Rate_Limiter SHALL apply HTTP method multipliers to the effective quota: GET — 1.0×; POST, PUT, PATCH — 1.5×; DELETE — 2.0×.
7. WHEN a rate limit is exceeded, THE Rate_Limiter SHALL respond with HTTP 429 and include the headers X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset, X-RateLimit-Tier, and Retry-After.
8. WHEN a request is allowed, THE Rate_Limiter SHALL set the same rate limit headers on the response without blocking the request.

---

### Requirement 2: Endpoint-Specific Rate Limiting

**User Story:** As a platform operator, I want stricter limits on sensitive endpoints, so that authentication brute-force and payment abuse are prevented independently of the user's tier.

#### Acceptance Criteria

1. WHEN a POST request is made to `/api/auth/login`, THE Rate_Limiter SHALL enforce a limit of 5 requests per 15-minute window per IP, regardless of the caller's tier.
2. WHEN a POST request is made to `/api/auth/register`, THE Rate_Limiter SHALL enforce a limit of 3 requests per 60-minute window per IP.
3. WHEN a POST request is made to `/api/payment/process`, THE Rate_Limiter SHALL enforce a limit of 10 requests per 5-minute window per IP.
4. WHEN a POST request is made to `/api/documents/upload`, THE Rate_Limiter SHALL enforce a limit of 20 requests per 60-minute window per IP.
5. WHEN a GET request is made to `/api/analytics/dashboard` by a user with the ADMIN role, THE Rate_Limiter SHALL enforce a limit of 100 requests per 15-minute window.
6. IF an endpoint-specific rule matches the incoming request, THEN THE Rate_Limiter SHALL use the endpoint rule's quota and window in place of the tier default.

---

### Requirement 3: Burst Handling

**User Story:** As a platform operator, I want to allow short-term request spikes within a window, so that legitimate clients with bursty traffic patterns are not unfairly blocked.

#### Acceptance Criteria

1. THE Burst_Handler SHALL track a separate burst counter per client per window alongside the main request counter.
2. WHEN a client's burst counter exceeds the tier's burst capacity, THE Burst_Handler SHALL introduce an exponential back-off delay before forwarding the request, capped at 10 seconds.
3. THE Burst_Handler SHALL apply a decay factor of 0.8 to the burst counter when the burst count exceeds 80% of the burst capacity, reducing the counter by 1.
4. WHERE the tier's burstHandling feature flag is false, THE Burst_Handler SHALL skip burst tracking and forward the request immediately.
5. THE Burst_Handler SHALL set the response header X-RateLimit-Burst to the current burst counter value on every request it processes.

---

### Requirement 4: API Key Management

**User Story:** As a developer integrating with the platform, I want to authenticate via API keys, so that my application can make requests without user session credentials.

#### Acceptance Criteria

1. THE API_Key_Service SHALL generate a unique API key composed of a UUID key ID and 32 bytes of cryptographic random data, formatted as `{keyId}.{hex}`.
2. THE API_Key_Service SHALL store only the SHA-256 hash of the raw API key, never the raw key itself.
3. WHEN an API key is provided in the `Authorization: Bearer` header or the `X-API-Key` header, THE API_Key_Service SHALL validate it by hashing the provided value and comparing it to the stored hash.
4. IF an API key is inactive, expired, or not found, THEN THE API_Key_Service SHALL reject the request with HTTP 401 and a descriptive error message.
5. IF an API key does not include the requested endpoint in its allowed endpoints list, THEN THE API_Key_Service SHALL reject the request with HTTP 401.
6. THE API_Key_Service SHALL enforce per-key rate limits using the same window-based counter mechanism as the tier-based Rate_Limiter.
7. WHEN an API key rate limit is exceeded, THE Rate_Limiter SHALL respond with HTTP 429 and include X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset, and X-RateLimit-Tier headers.
8. THE API_Key_Service SHALL support key revocation, which immediately invalidates the key by removing its hash index from Redis and marking the key record as inactive.
9. WHEN an API key is used, THE API_Key_Service SHALL update the key's lastUsed timestamp in Redis.
10. THE API_Key_Service SHALL support optional key expiration; WHEN a key's expiresAt timestamp is in the past, THE API_Key_Service SHALL treat the key as invalid.

---

### Requirement 5: IP-Based Blocking

**User Story:** As a platform operator, I want to automatically block IPs exhibiting abusive behavior, so that malicious actors are denied access without manual intervention.

#### Acceptance Criteria

1. THE IP_Blocking_Service SHALL maintain block records in Redis with the following severity-based durations: LOW — 15 minutes; MEDIUM — 1 hour; HIGH — 24 hours; CRITICAL — 30 days.
2. WHEN an IP accumulates 10 rate limit breaches within a 1-hour window, THE IP_Blocking_Service SHALL automatically block the IP at MEDIUM severity.
3. WHEN an IP accumulates 20 failed authentication attempts within a 15-minute window, THE IP_Blocking_Service SHALL automatically block the IP at MEDIUM severity.
4. WHEN an IP sends 3 requests containing malicious payloads within a 1-hour window, THE IP_Blocking_Service SHALL automatically block the IP at HIGH severity.
5. WHEN an IP sends more than 100 requests to a single endpoint within a 10-second window, THE IP_Blocking_Service SHALL classify the pattern as DDOS and automatically block the IP at CRITICAL severity.
6. WHEN a blocked IP sends a request, THE Rate_Limiter SHALL reject it with HTTP 403 and include the block reason, severity, and expiry timestamp in the response body.
7. THE IP_Blocking_Service SHALL support manual IP blocking and unblocking by administrators.
8. THE IP_Blocking_Service SHALL maintain a whitelist; WHEN an IP is on the whitelist, THE Rate_Limiter SHALL bypass all block and quota checks for that IP.
9. THE IP_Blocking_Service SHALL log every block event to a daily audit key in Redis with a 30-day retention period.
10. IF an IP block record's expiresAt timestamp is in the past, THEN THE IP_Blocking_Service SHALL treat the IP as unblocked and delete the stale record.

---

### Requirement 6: Breach Detection and Classification

**User Story:** As a platform operator, I want rate limit violations to be automatically classified by type and severity, so that I can prioritize incident response.

#### Acceptance Criteria

1. WHEN a request is blocked by the Rate_Limiter, THE Breach_Detector SHALL create a breach record with a unique ID, the client IP, the endpoint, the breach type, severity, timestamp, and contextual details.
2. THE Breach_Detector SHALL classify breaches into the following types: RATE_LIMIT (quota exceeded), BURST (burst capacity exceeded), SUSPICIOUS (missing or very short User-Agent), DDOS (high-frequency pattern detected).
3. THE Breach_Detector SHALL assign severity as follows: BLOCKED tier — CRITICAL; missing or short User-Agent — HIGH; tier priority ≤ 2 — MEDIUM; all other cases — LOW.
4. THE Breach_Detector SHALL persist each breach record in Redis with a 7-day retention period.
5. WHEN a breach of CRITICAL severity is detected, THE Breach_Detector SHALL trigger automatic IP blocking via the IP_Blocking_Service.
6. WHEN a breach of HIGH severity with type DDOS is detected, THE Breach_Detector SHALL record the IP abuse pattern via the IP_Blocking_Service.

---

### Requirement 7: Breach Notifications

**User Story:** As a platform operator, I want to receive alerts when rate limit breaches occur, so that I can respond to attacks in a timely manner.

#### Acceptance Criteria

1. THE Notification_Service SHALL support the following notification channels: email, Slack, PagerDuty, generic webhook, and SMS.
2. WHEN a breach occurs, THE Notification_Service SHALL dispatch notifications to all enabled channels whose minSeverity threshold is met by the breach severity.
3. THE Notification_Service SHALL support quiet hours configuration; WHILE the current time is within the configured quiet hours window, THE Notification_Service SHALL suppress notifications for that preference set.
4. THE Notification_Service SHALL support both global notification preferences and per-user notification preferences stored in Redis.
5. WHEN sending a Slack notification, THE Notification_Service SHALL include the IP address, endpoint, breach type, severity, timestamp, and details in the message payload.
6. WHEN sending a PagerDuty notification, THE Notification_Service SHALL use the breach ID as the dedup_key to prevent duplicate incidents.
7. THE Notification_Service SHALL cache each breach record in Redis with a 30-day retention period for historical retrieval.
8. IF a notification channel dispatch fails, THEN THE Notification_Service SHALL log the error and continue dispatching to remaining channels without throwing.

---

### Requirement 8: Rate Limit Analytics

**User Story:** As a platform operator, I want to view aggregated rate limiting metrics, so that I can identify traffic patterns and capacity planning needs.

#### Acceptance Criteria

1. THE Rate_Limiter SHALL record a metrics entry in Redis for every request processed, including: user ID (if authenticated), IP, endpoint, HTTP method, timestamp, blocked status, remaining quota, reset time, and tier.
2. THE Rate_Limiter SHALL retain metrics records in Redis for 30 days.
3. WHEN the analytics endpoint is queried with an optional time window, THE Rate_Limiter SHALL return: total request count, blocked request count, top 10 endpoints by request volume, top 10 IPs by request volume, tier distribution, and a breach summary by type and severity.
4. WHEN no time window is specified, THE Rate_Limiter SHALL default to the last 24 hours for analytics queries.
5. THE Rate_Limiter SHALL expose a breach history endpoint that returns up to a configurable number of breach records sorted by timestamp descending.

---

### Requirement 9: Health Check and Bypass

**User Story:** As a platform operator, I want health check endpoints to be exempt from rate limiting, so that monitoring systems are not inadvertently blocked.

#### Acceptance Criteria

1. WHEN a request is made to the `/health` path, THE Rate_Limiter SHALL skip all rate limit checks and forward the request immediately.
2. WHEN a request is made to any path beginning with `/api/monitoring`, THE Rate_Limiter SHALL skip all rate limit checks and forward the request immediately.

---

### Requirement 10: Fail-Open Behavior

**User Story:** As a platform operator, I want the rate limiting system to degrade gracefully when Redis is unavailable, so that a cache outage does not take down the API.

#### Acceptance Criteria

1. IF the Redis connection is unavailable or returns an error during a rate limit check, THEN THE Rate_Limiter SHALL allow the request to proceed and log the error.
2. IF the Redis connection is unavailable during an IP block check, THEN THE Rate_Limiter SHALL allow the request to proceed and log the error.
3. IF the Redis connection is unavailable during an API key validation, THEN THE API_Key_Service SHALL allow the request to proceed and log the error.
