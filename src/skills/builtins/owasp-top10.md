---
id: owasp-top10
name: OWASP Top 10 Checker
description: Checks code for OWASP Top 10 web application vulnerabilities including injections, broken auth, XSS, and more
triggers: [auth, login, password, sql, query, session, cookie, input, html, render, output, user, api, request, response, token, csrf, xss, injection]
mode: inline
version: "1.0"
author: crh-builtins
---

## OWASP Top 10 Review Checklist

Apply this checklist when reviewing the code changes:

**A01 – Broken Access Control**
- Are authorization checks present before accessing sensitive resources?
- Could any endpoint be accessed without proper authentication?
- Are there insecure direct object references (IDOR)?

**A02 – Cryptographic Failures**
- Are secrets, passwords, or tokens hardcoded in the code?
- Is sensitive data transmitted over unencrypted channels?
- Are weak hashing algorithms used (MD5, SHA1 for passwords)?

**A03 – Injection**
- Is user input ever concatenated directly into SQL queries?
- Are ORM query methods used safely (parameterized queries)?
- Could any input reach shell commands, LDAP queries, or template engines unsanitized?

**A04 – Insecure Design**
- Are rate limits missing on sensitive endpoints (login, password reset)?
- Is business logic enforced server-side or only client-side?

**A05 – Security Misconfiguration**
- Are error messages or stack traces exposed to users?
- Are debug modes or verbose logging enabled in production paths?

**A06 – Vulnerable and Outdated Components**
- Are any obviously outdated or vulnerable packages imported?

**A07 – Identification and Authentication Failures**
- Are session tokens properly invalidated on logout?
- Are passwords stored using bcrypt/argon2 (not MD5/SHA1/plain)?

**A09 – Security Logging and Monitoring Failures**
- Are security-relevant events (login failures, access denials) logged?
- Is sensitive data (passwords, tokens) accidentally logged?

**A10 – Server-Side Request Forgery (SSRF)**
- Does the code make HTTP requests with user-controlled URLs?
- Is there validation/allowlisting of destination URLs?
