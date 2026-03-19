# HRIQ Platform — Documentation & Compliance Roadmap

## 1. Customer-Facing Legal Documents (Required Before Launch)

### A. Service Agreement / Master Services Agreement (MSA)
- **What**: Contract between Remote Leverage and each client org
- **Covers**: Scope of services, payment terms, liability limitations, data handling
- **Status**: ServiceAgreement model exists (fee type, billing cycle) — needs legal document template
- **Action**: Draft MSA template, add PDF generation + e-sign via JotForm Sign

### B. Terms of Service (ToS)
- **What**: Governs all users accessing the HRIQ platform
- **Covers**: Acceptable use, account responsibilities, IP rights, dispute resolution
- **Status**: Web app has `/legal/[slug]` route — needs content
- **Action**: Draft ToS, require acceptance at first login (track in `app_users`)

### C. Privacy Policy
- **What**: How HRIQ collects, uses, stores, and shares personal data
- **Covers**: Data types collected, third-party integrations (Supabase, JotForm, Zoom, Time Doctor), retention periods, user rights (CCPA/GDPR)
- **Status**: Route exists — needs content
- **Action**: Draft policy covering all data flows, cookie consent banner

### D. Data Processing Agreement (DPA)
- **What**: Required for GDPR if handling EU contractor data
- **Covers**: Data processor obligations, sub-processors, breach notification, data deletion
- **Action**: Template DPA, attach to MSA for EU-facing clients

### E. Contractor Independent Contractor Agreement (ICA)
- **What**: Agreement between contractor and client org (via RL)
- **Covers**: IC classification, scope of work, payment terms, IP assignment, confidentiality
- **Status**: ContractTemplate + ContractSigningRequest models exist
- **Action**: Standardize ICA template, ensure e-sign flow captures proper signatures

---

## 2. FCRA Compliance Documents (Required for Background Checks)

### A. Standalone Disclosure
- **What**: Clear, conspicuous written notice that a background check may be obtained
- **Requirements**: Must be a SEPARATE document — cannot be bundled with other forms
- **Format**: Single-purpose form, plain language, no extraneous info

### B. Written Authorization / Consent Form
- **What**: Candidate's signed consent to run the background check
- **Requirements**: Separate signature from disclosure (can be same page, separate signature line)
- **Must include**: Clear statement authorizing the background check

### C. Summary of Rights Under the FCRA
- **What**: FTC-prescribed document (standard text from CFPB)
- **When**: Must be provided WITH the disclosure, BEFORE the check is run
- **Source**: https://www.consumerfinance.gov/policy-compliance/guidance/

### D. Pre-Adverse Action Notice
- **What**: Notice sent BEFORE taking adverse action based on background check results
- **Must include**: Copy of the background check report + Summary of Rights
- **Timing**: Must wait reasonable period (typically 5 business days) before final action

### E. Adverse Action Notice
- **What**: Final notice after the waiting period if decision stands
- **Must include**:
  - Name/address/phone of the Consumer Reporting Agency (CRA)
  - Statement that the CRA did NOT make the hiring decision
  - Notice of right to dispute accuracy with the CRA
  - Notice of right to obtain a free copy of the report within 60 days

### F. Dispute Resolution Process
- **What**: Documented process for candidates to dispute background check findings
- **Requirements**: Clear instructions, timely handling (30 days per FCRA)

---

## 3. Platform Documentation (User Guides)

### A. Admin Guide
- Client org setup and configuration
- Adding/managing contractors
- Timesheet approval workflow
- Payment processing and invoice review
- Generating reports

### B. Contractor Self-Service Guide
- Logging in (first time + returning)
- Submitting timesheets
- Viewing pay stubs and payment history
- Updating personal information
- Document uploads

### C. RL Super Admin Guide
- Managing client organizations
- Hiring pipeline operations
- Payroll processing workflow
- Client invoice generation and tracking
- Background check / FCRA workflow
- System settings and user management

---

## 4. Internal Operations Documents

### A. Background Check Policy
- When checks are required (all hires? role-dependent?)
- Approved CRA vendors
- Decision matrix (what findings = disqualification)
- Individualized assessment process
- Record retention schedule (minimum 5 years recommended)

### B. Data Retention Policy
- How long each data type is kept
- Deletion procedures
- Legal hold process

### C. Incident Response Plan
- Data breach notification procedures
- Timelines (72h GDPR, varies by US state)
- Contact information for regulators

---

## 5. Implementation Priority

| Priority | Document | Effort | Blocker? |
|----------|----------|--------|----------|
| P0 | FCRA Disclosure + Authorization | Build in HRIQ | Yes — legal requirement |
| P0 | FCRA Pre-Adverse / Adverse Action flow | Build in HRIQ | Yes — legal requirement |
| P0 | Terms of Service | Draft + deploy | Yes — user acceptance |
| P0 | Privacy Policy | Draft + deploy | Yes — legal requirement |
| P1 | Master Services Agreement template | Draft + integrate | Yes — client onboarding |
| P1 | Independent Contractor Agreement | Standardize template | Yes — contractor onboarding |
| P1 | Summary of FCRA Rights | Standard FTC doc | Include in flow |
| P2 | Data Processing Agreement | Draft template | EU clients only |
| P2 | Admin / Contractor user guides | Write + host in docs | Nice to have |
| P3 | Background Check Policy | Internal ops doc | Internal use |
| P3 | Data Retention Policy | Internal ops doc | Internal use |
| P3 | Incident Response Plan | Internal ops doc | Internal use |
