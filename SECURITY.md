# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in HRIQ, please report it responsibly.

**Email:** security@remoteleverage.com

Please include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Any suggested fixes

We will acknowledge receipt within 48 hours and provide an initial assessment within 5 business days.

## Security Measures

HRIQ is protected by multiple layers of security:

- **Encryption:** TLS 1.2+ on all connections, AES-256 encryption at rest (Supabase)
- **Authentication:** Role-based access control, KYC verification, OTP login, session timeout
- **Infrastructure:** Vercel edge network, DDoS protection, HSTS preload, CSP headers
- **Payments:** Stripe PCI DSS Level 1 — we never see or store card data
- **Identity:** Veriff SOC 2 / ISO 27001 — documents processed externally
- **Monitoring:** Arcjet bot protection, rate limiting, full audit trail
- **Code:** Parameterized queries, CSRF protection, 63 DB-level FK constraints
- **CI/CD:** Snyk vulnerability scanning, CodeQL static analysis, Dependabot alerts

## Supported Versions

Only the latest production deployment is supported with security updates.

## Trust Center

Visit [https://hriq.remoteleverage.com/security](https://hriq.remoteleverage.com/security) for our full security overview.
