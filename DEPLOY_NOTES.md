# HRIQ v1.0.0 — Production Release

**Deploy Date:** February 21, 2026  
**Platform:** Vercel (Next.js 16 + Turbopack)  
**Database:** Supabase PostgreSQL  
**Domain:** hriq.remoteleverage.com

---

## Core Platform

### Authentication & Authorization
- Google OAuth sign-in via Supabase Auth
- Role-based access: Super Admin (RL), Admin, Manager, Bookkeeper, VA
- Org-scoped middleware with public route allowlist
- Contractor self-service routes (no login required)

### Dashboards
- **RL Internal:** org count, contractor stats, status distribution chart, recent activity
- **Client Portal:** contractor metrics, department breakdown, payment/task summaries
- **VA Self-Service:** tasks, timesheets, payments, documents

### Contractor Management (222+ contractors)
- Full contractor directory with search, filter by status/department
- Employee detail pages: personal info, banking, emergency contacts, documents, tasks, payments, timesheets
- Sequential employee numbering (RL-001 through RL-222)
- Photo upload with 10MB limit
- Inline status management (pre_hire → active → offboarded)

### Hiring & Onboarding Pipeline
- Multi-stage pipeline: candidates → onboarding → active
- JotForm integration: send forms, auto-complete steps via webhook
- Zoom batch sessions: schedule orientation, track attendance
- Government ID upload with auto-step-completion
- Contractor info form (self-service, public URL, no login required)
- Thank-you page redirect after form completion
- Onboarding progress tracking with live step updates
- Step types: zoom_invite, zoom_attendance, jotform, document, custom
- Step renamed: "Tool Access Provisioning" → "Tech Onboarding"

### Documents
- Smart document table with search, sort by any column, filter by type/status
- Group by: contractor, type, or status
- Document types: Government ID, Contract, Tax Form, Bank Details, Resume, NDA, Other
- Upload to Supabase Storage with document records
- File replace functionality (re-upload same file)

### Contracts
- Contract template management
- Signing request workflow (DocuSeal integration pending)

### Payments & Timesheets
- Payment tracking and approval
- Google Sheets timesheet sync (cron job, Bearer token protected)
- Timesheet submission and review

### Operations
- Task management with assignments
- Time off requests
- Expense tracking
- Announcements system with priority levels
- Org chart visualization

### Client Organizations
- Multi-org support with org switcher
- Org profiles with industry, billing, admin details
- Client onboarding tracking

---

## Contractor Self-Service Form

- Public self-service form (no login required, accessed via `/contractor-info/[token]`)
- **Personal Info:** name, preferred name, date of birth, nationality, phone, mobile
- **International Address:** Address Line 1/2, City/Municipality, State/Province/Region, Postal/ZIP Code, Country dropdown (30+ countries)
- **Bank Details:** bank name, account holder, account number, SWIFT/BIC (required), branch address (required), payment platform (optional)
- **Emergency Contact:** name, relationship, phone, email
- **Government ID Upload** with auto-step-completion
- Auto-completes onboarding steps ("Onboarding Data Confirmed" / "Contractor Info Submitted")
- Recalculates session progress on submission
- Redirects to branded thank-you page

---

## Search System

- **Global search** across: name, preferred name, work email, personal email, phone, mobile, employee number, job title, department
- Super admin: cross-org search
- Employee list inline search: same fields
- Paginated results (24 per page) with status badges
- Sidebar search input with autocomplete disabled

---

## Technical Details

### Performance Optimizations
- Lazy-loaded chart components (recharts via `next/dynamic`) on RL, Client, and Hiring dashboards
- Parallelized auth calls in layout (3 sequential → 1 `Promise.all`)
- Parallelized notifications API (4 queries → 1 `Promise.all`)
- Loading skeletons on all routes (6 new loading states added)
- Server actions body size limit: 12MB (for photo uploads)

### Security
- **Security headers:** X-Frame-Options DENY, X-Content-Type-Options nosniff, Referrer-Policy strict-origin-when-cross-origin, Permissions-Policy (camera/mic/geo disabled)
- **robots.txt** blocking all crawlers (internal app)
- Debug/setup routes gated behind `NODE_ENV !== "production" && ENABLE_DEBUG_ROUTES`
- Webhook signature validation (JotForm, RecruitCRM)
- Cron route protected by `CRON_SECRET` bearer token
- Role-based server action guards (`requireRole`, `requireOrg`, `requireSession`)
- Middleware public routes properly configured for API routes (`/api/cron`, `/api/webhooks`, `/api/collaboration`)
- **FIXED:** Super admin employee search was overriding org filter with search filter (duplicate `OR` keys in Prisma query) — could expose contractors from other organizations. Fixed with `AND` combinator.

### Error Handling
- Error boundaries on all 3 route groups (client, rl, va)
- Custom 404 page with branded styling
- Error dialog system with toast notifications
- **Try/catch on ALL async transitions** — fixed 9 components that were missing error handling:
  - `org-switcher.tsx` (2 transitions)
  - `document-row-actions.tsx`
  - `documents-table.tsx`
  - `batch-onboarding.tsx` (3 transitions)
  - `timesheet-sync.tsx`
  - `pending-hires-list.tsx` (2 transitions)
  - `settings-dashboard.tsx` (2 transitions)
  - `user-actions.tsx` (2 transitions)
  - `my-task-list.tsx`

### Monitoring
- Vercel Analytics (page views)
- Vercel Speed Insights (requires env var `NEXT_PUBLIC_ENABLE_VERCEL_SPEED_INSIGHTS=true`)
- Sentry error tracking
- PostHog product analytics

### Integrations
| Integration | Purpose | Auth |
|---|---|---|
| Supabase Auth | Google OAuth, sessions | OAuth + cookies |
| Supabase Storage | Document/photo uploads | Service role key |
| JotForm | Onboarding forms | Webhook |
| Zoom | Batch orientation sessions | API key |
| Google Sheets | Timesheet sync | Service account |
| RecruitCRM | Candidate pipeline | Webhook + API key |
| Vercel Analytics | Page views | Auto |
| Sentry | Error tracking | DSN |
| PostHog | Product analytics | API key |

### Database
- 53 tables in Supabase PostgreSQL
- Prisma ORM with typed queries
- Key models: Employee, Organization, OnboardingSession, OnboardingStep, Document, Payment, Task, TimesheetSubmission, BatchSession, PendingHire

---

## UI/UX
- Dark mode default with light mode toggle
- Transparent logo (white background removed via flood fill algorithm)
- Collapsible sidebar with role-based navigation
- Notification bell with real-time badge count
- Background sync component for periodic data refresh
- Contractor-facing sign-in guidance
- International phone number placeholders

---

## Project Structure

```
apps/app/                  → Next.js 16 application
  app/
    (authenticated)/       → Protected routes (client, rl, va, search, webhooks)
    (unauthenticated)/     → Sign-in, sign-up
    api/                   → API routes (auth, webhooks, cron, notifications)
    actions/               → Server actions (22 action files)
    contractor-info/       → Public contractor self-service
    onboarding-complete/   → Public thank-you page
packages/
  auth/                    → Supabase auth + middleware
  database/                → Prisma schema + client
  design-system/           → Shared UI components (shadcn/ui)
  integrations/            → Zoom, Google Sheets
  next-config/             → Shared Next.js config + security headers
```

---

## Bugs Fixed in This Release

| Bug | Severity | Fix |
|---|---|---|
| Super admin search leaks contractors from other orgs | **Critical** | Replaced duplicate `OR` with `AND` combinator |
| 9 components crash silently on server action failure | High | Added try/catch to all async transitions |
| Cron route blocked by auth middleware | High | Added `/api/cron` to public routes |
| Logo shows white square on dark backgrounds | Medium | Removed white background with flood fill |
| Thank-you page redirects to sign-in | Medium | Added `/onboarding-complete` to public routes |
| File upload "replace" doesn't work (same file) | Medium | Reset input value after upload |
| Onboarding steps not auto-completing | Medium | Added auto-completion logic for form submission + ID upload |
| Phone placeholders hardcoded to Philippines format | Low | Changed to international format |
| Search only checked name + email | Low | Added personal email, phone, job title, department |
| No error boundaries on any route | Low | Added error.tsx to client, rl, va groups |
| No 404 page | Low | Added not-found.tsx |
| No loading states on 6 routes | Low | Added loading.tsx skeletons |
| Missing security headers | Low | Added X-Frame-Options, X-Content-Type-Options, etc. |

---

## Environment Variables Required

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Database
DATABASE_URL=

# Auth
CRON_SECRET=

# Optional
NEXT_PUBLIC_ENABLE_VERCEL_SPEED_INSIGHTS=true
ENABLE_DEBUG_ROUTES=  # Do NOT set in production

# Integrations (if configured)
JOTFORM_API_KEY=
ZOOM_ACCOUNT_ID=
ZOOM_CLIENT_ID=
ZOOM_CLIENT_SECRET=
RECRUITCRM_API_KEY=
GOOGLE_SERVICE_ACCOUNT_EMAIL=
GOOGLE_PRIVATE_KEY=
SENTRY_DSN=
NEXT_PUBLIC_POSTHOG_KEY=
```

---

## Known Limitations

- DocuSeal contract API integration is stubbed (TODO in `contracts.ts`)
- File uploads limited to 12MB (server actions body limit)
- Search is server-side only (no real-time suggestions)
- Timesheet sync requires Google Sheets with specific format
