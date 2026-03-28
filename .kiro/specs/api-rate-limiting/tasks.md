# API Rate Limiting Tasks

- [x] **Task 1**: Implement core API rate limiting to prevent abuse
	- Added progressive and advanced rate limiting middleware application on `/api` routes.
	- Ensured authentication endpoints use stricter `authLimiter` policies.
	- Integrated rate limit route setup through `setupRateLimitRoutes(app)`.
