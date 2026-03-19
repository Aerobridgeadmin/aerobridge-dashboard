# HRIQ — Remote Leverage HR Platform

> **v1.0.0** · Internal HR and contractor management platform for Remote Leverage

## Overview

HRIQ manages the full lifecycle of international contractors: hiring pipeline, onboarding workflows, document management, payments, timesheets, and day-to-day operations across multiple client organizations.

## Stack

- **Framework:** Next.js 16 (App Router, Turbopack)
- **Database:** Supabase PostgreSQL + Prisma ORM
- **Auth:** Supabase Auth (Google OAuth)
- **Storage:** Supabase Storage
- **Hosting:** Vercel
- **UI:** shadcn/ui + Tailwind CSS

## Getting Started

```bash
# Install dependencies
pnpm install

# Set up environment variables
cp apps/app/.env.example apps/app/.env.local

# Generate Prisma client
pnpm db:generate

# Run development server
pnpm dev
```

## Project Structure

```
apps/app/              → Main Next.js application
packages/auth/         → Auth middleware & session management
packages/database/     → Prisma schema & database client
packages/design-system/→ Shared UI components
packages/integrations/ → Zoom, Google Sheets integrations
packages/next-config/  → Shared Next.js configuration
```

## Roles

| Role | Access |
|------|--------|
| Super Admin | Full platform access, all organizations |
| Admin | Organization management, hiring, onboarding |
| Manager | Contractor oversight, approvals |
| Bookkeeper | Payments, timesheets |
| VA | Self-service tasks, timesheets, documents |

## Key Features

- Multi-org contractor management (222+ contractors)
- Hiring pipeline with RecruitCRM integration
- JotForm-powered onboarding with auto-step-completion
- Zoom batch orientation sessions
- Contractor self-service portal (no login required)
- Smart document management with search/filter/group
- Google Sheets timesheet sync
- Payment tracking and approval workflows

## Deploy Notes

See [DEPLOY_NOTES.md](./DEPLOY_NOTES.md) for the full v1.0.0 release notes.

## License

Proprietary — Remote Leverage LLC
