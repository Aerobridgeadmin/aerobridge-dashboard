# Client Payroll Package — Build Plan

## Overview

Remote Leverage hires contractors for client companies. Currently clients handle their own HR/payroll. The new **Payroll Package** means RL handles the HR admin (timesheets, pay calculations, paystubs) while **clients still pay the contractors directly** — but they pay through HRIQ via Stripe, so everything is tracked and automated.

---

## What Already Exists

| Feature | Status | Location |
|---------|--------|----------|
| Multi-org model | Done | `Organization`, `OrganizationProfile`, `OrganizationMember` |
| Client portal | Done | `/client/*` — dashboard, employees, timesheets, payments, documents |
| Role separation | Done | super_admin (RL), admin/manager/bookkeeper (client), va (contractor) |
| Org switcher | Done | RL admin can view any client org |
| Timesheet periods + submissions | Done | `TimesheetPeriod`, `TimesheetSubmission` |
| Payment records | Done | `Payment` model with status tracking |
| Paystub generation | Done | PDF generation + email delivery |
| Billing email + payment terms on org | Done | `OrganizationProfile.billingEmail`, `paymentTerms` |
| Stripe env vars | Placeholder | `.env.example` has `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` |

## What Needs to Be Built

### Phase 1: Pay Run Workflow (No Stripe Yet)

The core flow that RL uses to prepare payroll for a client org.

**New DB Models:**

```
PayRun
  - id
  - organizationId      → which client org
  - periodStart, periodEnd
  - status: draft → pending_approval → approved → processing → completed
  - totalAmount, currency
  - rlFeeAmount, rlFeeType (flat/percentage)
  - createdByUserId      → RL admin who created it
  - approvedByUserId     → client admin who approved
  - approvedAt
  - paidAt
  - stripePaymentIntentId (Phase 2)
  - stripeInvoiceId (Phase 2)
  - paymentLink (Phase 2)

PayRunItem
  - id
  - payRunId
  - employeeId           → which contractor
  - timesheetSubmissionId → linked timesheet (optional)
  - hoursWorked, hourlyRate
  - grossAmount
  - deductions
  - netAmount
  - paymentId            → created when pay run completes
  - notes
```

**Flow:**

1. RL admin opens Payroll, selects a client org and pay period
2. System pulls approved timesheets for that period → auto-generates PayRunItems
3. RL reviews/adjusts amounts, adds RL management fee
4. RL clicks "Send for Approval" → status becomes `pending_approval`
5. Client admin gets email: "Your payroll for Feb 1-15 is ready to review ($X,XXX)"
6. Client admin clicks link → sees pay run summary in HRIQ
7. Client approves → status becomes `approved`
8. (Phase 2) Client pays via Stripe link → status becomes `completed`
9. System generates payments + paystubs for each contractor

**UI Pages:**

- `/rl/payroll` — enhanced to show pay runs across all orgs
- `/rl/payroll/new` — create pay run for a specific org
- `/client/payroll` — client sees their pay runs, approves/rejects
- `/client/payroll/[id]` — pay run detail with line items

### Phase 2: Stripe Integration

**Approach: Stripe Invoicing + Payment Links**

This is the cleanest approach because:
- Client gets a professional invoice email from Stripe
- They can pay via card, ACH, or bank transfer
- No need for clients to have Stripe accounts
- RL gets automatic reconciliation
- Stripe handles receipts, refunds, disputes

**Setup:**
- RL has one Stripe account (not Connect — clients don't need their own)
- Each client org gets a Stripe Customer record
- Pay runs generate Stripe Invoices

**New DB Fields on Organization:**
```
stripeCustomerId    → Stripe Customer ID for this client org
```

**Flow with Stripe:**

1. Pay run is approved by client
2. System creates a Stripe Invoice:
   - Customer = client org's Stripe Customer
   - Line items = each contractor's pay + RL management fee
   - Due date based on `paymentTerms` (net_30, net_15, etc.)
3. Stripe sends invoice email to client's `billingEmail`
4. Client clicks "Pay Invoice" → Stripe hosted payment page
5. Client pays via card or ACH bank transfer
6. Stripe webhook fires `invoice.paid`
7. HRIQ marks pay run as `completed`
8. System generates Payment records + paystubs for each contractor
9. Contractors receive paystub emails

**Alternative: Payment Links (simpler)**

Instead of full Stripe Invoicing, use Stripe Payment Links:
- Create a Checkout Session with the pay run total
- Email client a payment link
- On success, webhook triggers completion

Recommendation: **Start with Payment Links** (simpler), upgrade to **Invoicing** later when you need Net-30 terms, partial payments, or recurring billing.

**Stripe Webhook Events to Handle:**
- `checkout.session.completed` — payment link paid
- `invoice.paid` — invoice paid (if using invoicing)
- `invoice.payment_failed` — payment failed
- `customer.subscription.updated` — if adding recurring billing later

### Phase 3: RL Management Fee + Billing

**Fee Structure Options:**
- Per contractor per period (e.g., $50/contractor/month)
- Percentage of payroll (e.g., 5% of total)
- Flat monthly fee (e.g., $500/month)

**New DB Model:**
```
ServiceAgreement
  - id
  - organizationId
  - feeType: per_contractor | percentage | flat
  - feeAmount
  - billingCycle: monthly | per_pay_run
  - startDate, endDate
  - status: active | paused | cancelled
```

The RL fee gets added as a line item on every pay run, so the client pays one combined amount (contractor pay + RL fee) in a single Stripe transaction.

---

## Implementation Order

### Sprint 1: Pay Run Model + RL UI (1 week)
- [ ] Add `PayRun` and `PayRunItem` models to schema
- [ ] Create `/rl/payroll/new` — select org, period, auto-pull timesheets
- [ ] Create pay run detail view showing line items
- [ ] Add "Send for Approval" action that emails client

### Sprint 2: Client Approval Flow (1 week)
- [ ] Create `/client/payroll` — list of pay runs for their org
- [ ] Create `/client/payroll/[id]` — review and approve/reject
- [ ] Email notifications for approval requests and responses
- [ ] Add payroll to client sidebar nav

### Sprint 3: Stripe Payment Links (1 week)
- [ ] Install `stripe` package
- [ ] Add Stripe Customer creation to org onboarding
- [ ] Create Checkout Session when pay run is approved
- [ ] Build webhook handler at `/api/webhooks/stripe`
- [ ] On payment success: create Payment records, generate paystubs
- [ ] Email contractor paystubs automatically

### Sprint 4: Polish + Fee Billing (1 week)
- [ ] Add `ServiceAgreement` model
- [ ] RL fee calculation on pay runs
- [ ] Pay run history and reporting
- [ ] Client billing dashboard
- [ ] Recurring pay run templates

---

## Email Flow Summary

| Event | Recipient | Email Content |
|-------|-----------|---------------|
| Pay run created | Client admin (billingEmail) | "Your payroll for [period] is ready to review — $X,XXX" with link to HRIQ |
| Pay run approved | RL admin | "Client [name] approved payroll for [period]" |
| Payment link ready | Client admin | "Pay your contractors — click to pay $X,XXX" with Stripe link |
| Payment received | RL admin | "Payment received from [client] for [period]" |
| Payment received | Each contractor | Paystub PDF attached |
| Payment failed | Client admin + RL admin | "Payment failed — please retry" |

---

## Key Architecture Decisions

**Why Stripe Invoicing (not Connect)?**
- Clients don't need Stripe accounts
- RL controls the entire payment flow
- Simpler implementation — no onboarding merchants
- RL can add their fee as an invoice line item
- Works for international clients

**Why not Wise/PayPal for contractor payout?**
- Phase 1 doesn't require automated payout to contractors
- RL currently pays contractors manually (bank transfer, etc.)
- Stripe just collects from the client; contractor payout is separate
- Future: could add Stripe Connect payouts or Wise API

**Why Pay Runs instead of individual payments?**
- Clients want to review and approve a batch, not individual payments
- One Stripe transaction per pay period is cheaper (fewer fees)
- Cleaner accounting and reporting
- Matches how payroll actually works in practice

---

## File Structure

```
apps/app/
  app/
    (authenticated)/
      rl/payroll/
        page.tsx                    # Enhanced: shows pay runs across all orgs
        new/page.tsx                # Create new pay run
        [id]/page.tsx               # Pay run detail (RL view)
      client/payroll/
        page.tsx                    # Client's pay runs list
        [id]/page.tsx               # Pay run detail (client approval view)
    actions/hriq/
      pay-runs.ts                   # Server actions for pay run CRUD
      stripe.ts                     # Stripe integration helpers
    api/
      webhooks/stripe/route.ts      # Stripe webhook handler
  packages/database/prisma/
    schema.prisma                   # PayRun, PayRunItem, ServiceAgreement models
```
