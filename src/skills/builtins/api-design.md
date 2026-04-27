---
id: api-design
name: API Design Reviewer
description: Reviews REST/GraphQL API design for consistency, versioning, error handling, and adherence to standards
triggers: [api, rest, graphql, endpoint, route, controller, handler, request, response, http, status, url, path, method, get, post, put, delete, patch]
mode: inline
version: "1.0"
author: crh-builtins
---

## API Design Review Checklist

**RESTful conventions:**
- Are HTTP methods used correctly? (GET=read, POST=create, PUT/PATCH=update, DELETE=remove)
- Are status codes appropriate? (200 OK, 201 Created, 400 Bad Request, 401 Unauthorized, 403 Forbidden, 404 Not Found, 422 Unprocessable, 500 Server Error)
- Are URLs noun-based and consistent? (`/users/:id` not `/getUser/:id`)

**Request validation:**
- Is input validated and sanitized before processing?
- Are validation errors returned with clear, actionable messages?
- Are required vs. optional fields documented?

**Error handling:**
- Is a consistent error response format used across all endpoints?
- Are internal errors hidden from external callers?
- Are errors logged with enough context for debugging?

**Versioning:**
- Is there an API version in the URL or header?
- Could this change break existing consumers (breaking change)?

**Pagination and filtering:**
- For list endpoints returning many items, is pagination implemented?
- Are there query parameters for filtering and sorting?

**Security:**
- Are authentication/authorization checks present?
- Is rate limiting applied to public or expensive endpoints?
- Are CORS headers set appropriately?

**GraphQL-specific (if applicable):**
- Are query depths limited to prevent denial of service?
- Is field-level authorization implemented?
