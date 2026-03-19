import Image from "next/image";
import { StarBackground } from "@/components/star-background";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Security — Remote Leverage",
  description:
    "Learn how Remote Leverage protects your data with enterprise-grade security, encryption, and compliance.",
};

function ShieldIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

function LockIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

function ServerIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect width="20" height="8" x="2" y="2" rx="2" ry="2" />
      <rect width="20" height="8" x="2" y="14" rx="2" ry="2" />
      <line x1="6" x2="6.01" y1="6" y2="6" />
      <line x1="6" x2="6.01" y1="18" y2="18" />
    </svg>
  );
}

function KeyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="m21 2-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0 3 3L22 7l-3-3m-3.5 3.5L19 4" />
    </svg>
  );
}

function EyeOffIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
      <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
      <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
      <line x1="2" x2="22" y1="2" y2="22" />
    </svg>
  );
}

function CheckCircleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );
}

function TrustBadge({
  name,
  detail,
  href,
}: {
  name: string;
  detail: string;
  href: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex flex-col items-center gap-3 rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm px-6 py-5 shadow-lg transition-all hover:shadow-xl hover:border-teal-400/30 hover:bg-white/10"
    >
      <span className="text-sm font-semibold text-white  group-hover:text-purple-700:text-purple-400 transition-colors">
        {name}
      </span>
      <span className="text-xs text-white/50 text-center leading-relaxed">
        {detail}
      </span>
    </a>
  );
}

function SecuritySection({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex gap-4">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-teal-500/15 text-teal-400">
        {icon}
      </div>
      <div className="flex-1">
        <h3 className="text-base font-semibold text-white  mb-2">
          {title}
        </h3>
        <div className="text-sm text-white/60 leading-relaxed space-y-2">
          {children}
        </div>
      </div>
    </div>
  );
}

function SecurityCheck({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2">
      <CheckCircleIcon className="h-4 w-4 mt-0.5 shrink-0 text-green-600400" />
      <span>{text}</span>
    </div>
  );
}

export default function SecurityPage() {
  return (
    <div className="min-h-screen bg-[#0a0c10] text-white">
      <StarBackground />
      {/* Header */}
      <header className="border-b border-white/10 bg-white/5 backdrop-blur-xl relative z-10">
        <div className="mx-auto max-w-4xl px-6 py-4 flex items-center justify-between">
          <a href="https://remoteleverage.com" className="flex items-center gap-2">
            <Image
              src="/logo.png"
              alt="Remote Leverage"
              width={28}
              height={28}
              className="rounded-sm"
            />
            <span className="font-semibold text-white ">
              Remote Leverage
            </span>
          </a>
          <a
            href="/sign-in"
            className="text-sm text-white/50 hover:text-white /40:text-gray-200 transition-colors"
          >
            Sign in →
          </a>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden bg-transparent text-white z-10">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-teal-500/10 via-transparent to-emerald-500/08" />
        <div className="relative mx-auto max-w-4xl px-6 py-16 text-center">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-1.5 text-sm font-medium backdrop-blur-sm border border-white/10">
            <ShieldIcon className="h-4 w-4 text-green-400" />
            <span>Trust Center</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">
            Security at Remote Leverage
          </h1>
          <p className="text-base text-gray-300 max-w-2xl mx-auto leading-relaxed">
            HRIQ is built with enterprise-grade security from the ground up.
            Your workforce data, payment information, and identity documents are
            protected by industry-leading infrastructure and rigorous application-level controls.
          </p>
        </div>
      </section>

      <main className="mx-auto max-w-4xl px-6 py-12 space-y-12 relative z-10">
        {/* Trust Badges */}
        <section>
          <h2 className="text-lg font-semibold text-white  mb-1">
            Secured &amp; Verified By
          </h2>
          <p className="text-sm text-white/50 mb-6">
            Every layer of HRIQ is protected by trusted, independently audited providers.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <TrustBadge
              name="Stripe"
              detail="PCI DSS Level 1 payment processing"
              href="https://stripe.com/docs/security"
            />
            <TrustBadge
              name="Veriff"
              detail="SOC 2 &amp; ISO 27001 identity verification"
              href="https://www.veriff.com/product/security-compliance"
            />
            <TrustBadge
              name="Supabase"
              detail="SOC 2 Type II database &amp; encryption at rest"
              href="https://supabase.com/security"
            />
            <TrustBadge
              name="Vercel"
              detail="Auto-SSL, edge network &amp; DDoS protection"
              href="https://vercel.com/security"
            />
            <TrustBadge
              name="Arcjet"
              detail="Bot protection &amp; adaptive rate limiting"
              href="https://arcjet.com"
            />
          </div>
        </section>

        <hr className="border-gray-200800" />

        {/* Security Details */}
        <section className="space-y-8">
          <h2 className="text-lg font-semibold text-white ">
            How We Protect Your Data
          </h2>

          <SecuritySection
            icon={<LockIcon className="h-5 w-5" />}
            title="Encryption"
          >
            <SecurityCheck text="TLS 1.2+ encryption on all connections with HSTS preload enabled" />
            <SecurityCheck text="Database encrypted at rest with AES-256 via Supabase" />
            <SecurityCheck text="Stripe handles all card data — we never see or store payment credentials" />
            <SecurityCheck text="Identity documents processed by Veriff — never stored on our servers" />
          </SecuritySection>

          <SecuritySection
            icon={<KeyIcon className="h-5 w-5" />}
            title="Authentication &amp; Access Control"
          >
            <SecurityCheck text="Role-based access control: super admin, admin, manager, VA, member, contractor" />
            <SecurityCheck text="KYC identity verification required for all client organization administrators" />
            <SecurityCheck text="Server-side session validation on every request with CSRF protection" />
            <SecurityCheck text="Email-based login verification with OTP and trusted device management" />
            <SecurityCheck text="Automatic session timeout after period of inactivity" />
          </SecuritySection>

          <SecuritySection
            icon={<ServerIcon className="h-5 w-5" />}
            title="Infrastructure"
          >
            <SecurityCheck text="Hosted on Vercel's edge network with automatic SSL certificate management" />
            <SecurityCheck text="DDoS protection and global CDN at the infrastructure level" />
            <SecurityCheck text="Content Security Policy (CSP) headers on all routes" />
            <SecurityCheck text="X-Frame-Options DENY prevents clickjacking attacks" />
            <SecurityCheck text="Strict-Transport-Security with preload ensures HTTPS-only access" />
            <SecurityCheck text="Adaptive rate limiting via Arcjet protects against brute force and abuse" />
          </SecuritySection>

          <SecuritySection
            icon={<ShieldIcon className="h-5 w-5" />}
            title="Application Security"
          >
            <SecurityCheck text="Parameterized database queries prevent SQL injection across all operations" />
            <SecurityCheck text="63 foreign key constraints enforce referential integrity at the database level" />
            <SecurityCheck text="Auth checks on every server action with organization-scoped data access" />
            <SecurityCheck text="Multi-tenant architecture with strict data isolation between organizations" />
            <SecurityCheck text="Webhook signatures verified for all external integrations (Stripe, Veriff)" />
            <SecurityCheck text="Complete audit trail — every data change is logged with actor, timestamp, and details" />
          </SecuritySection>

          <SecuritySection
            icon={<EyeOffIcon className="h-5 w-5" />}
            title="Privacy &amp; Data Handling"
          >
            <SecurityCheck text="No third-party advertising or data selling — your data is yours" />
            <SecurityCheck text="Minimal data collection — we only store what's necessary for HR operations" />
            <SecurityCheck text="Sensitive documents (IDs, contracts) stored in encrypted Supabase Storage with signed URLs" />
            <SecurityCheck text="Self-service token system for contractor data collection — no login required, single-use links" />
          </SecuritySection>
        </section>

        <hr className="border-gray-200800" />

        {/* Continuous Monitoring */}
        <section>
          <h2 className="text-lg font-semibold text-white  mb-1">
            Continuous Security Monitoring
          </h2>
          <p className="text-sm text-white/50 mb-6">
            Automated scanning runs on every code change and on a weekly schedule.
          </p>
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="rounded-lg border border-white/10 bg-white/5 backdrop-blur-sm p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="flex h-6 w-6 items-center justify-center rounded bg-purple-100900/40 text-xs font-bold text-purple-700300">S</span>
                <span className="font-semibold text-sm text-white ">Snyk</span>
              </div>
              <p className="text-xs text-white/50">
                Dependency vulnerability scanning on every push and PR. High-severity issues flagged automatically.
              </p>
            </div>
            <div className="rounded-lg border border-white/10 bg-white/5 backdrop-blur-sm p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="flex h-6 w-6 items-center justify-center rounded bg-purple-100900/40 text-xs font-bold text-purple-700300">C</span>
                <span className="font-semibold text-sm text-white ">CodeQL</span>
              </div>
              <p className="text-xs text-white/50">
                GitHub&apos;s static analysis engine scans for SQL injection, XSS, and other code-level vulnerabilities.
              </p>
            </div>
            <div className="rounded-lg border border-white/10 bg-white/5 backdrop-blur-sm p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="flex h-6 w-6 items-center justify-center rounded bg-purple-100900/40 text-xs font-bold text-purple-700300">D</span>
                <span className="font-semibold text-sm text-white ">Dependabot</span>
              </div>
              <p className="text-xs text-white/50">
                Automatic weekly dependency updates with vulnerability alerts and auto-fix PRs from GitHub.
              </p>
            </div>
            <div className="rounded-lg border border-white/10 bg-white/5 backdrop-blur-sm p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="flex h-6 w-6 items-center justify-center rounded bg-purple-100900/40 text-xs font-bold text-purple-700300">A</span>
                <span className="font-semibold text-sm text-white ">pnpm Audit</span>
              </div>
              <p className="text-xs text-white/50">
                Built-in package manager audit runs on every build to catch known vulnerabilities in the supply chain.
              </p>
            </div>
          </div>
        </section>

        <hr className="border-gray-200800" />

        {/* Independent Verification */}
        <section>
          <h2 className="text-lg font-semibold text-white  mb-1">
            Independent Verification
          </h2>
          <p className="text-sm text-white/50 mb-6">
            You can independently verify our security posture using these free tools:
          </p>
          <div className="grid sm:grid-cols-3 gap-3">
            <a
              href="https://developer.mozilla.org/en-US/observatory/analyze?host=hriq.remoteleverage.com"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg border border-white/10 bg-white/5 backdrop-blur-sm p-4 hover:shadow-md transition-shadow"
            >
              <div className="font-semibold text-sm text-white  mb-1">
                Mozilla Observatory
              </div>
              <p className="text-xs text-white/50">
                Scan our security headers, CSP, HSTS, cookies, and TLS configuration.
              </p>
            </a>
            <a
              href="https://www.ssllabs.com/ssltest/analyze.html?d=hriq.remoteleverage.com"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg border border-white/10 bg-white/5 backdrop-blur-sm p-4 hover:shadow-md transition-shadow"
            >
              <div className="font-semibold text-sm text-white  mb-1">
                Qualys SSL Labs
              </div>
              <p className="text-xs text-white/50">
                Deep analysis of TLS/SSL certificates, cipher suites, and protocol support.
              </p>
            </a>
            <a
              href="https://securityheaders.com/?q=hriq.remoteleverage.com&followRedirects=on"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg border border-white/10 bg-white/5 backdrop-blur-sm p-4 hover:shadow-md transition-shadow"
            >
              <div className="font-semibold text-sm text-white  mb-1">
                Security Headers
              </div>
              <p className="text-xs text-white/50">
                Grade our HTTP response headers for security best practices.
              </p>
            </a>
          </div>
        </section>

        <hr className="border-gray-200800" />

        {/* Contact */}
        <section className="text-center pb-8">
          <h2 className="text-lg font-semibold text-white  mb-2">
            Questions about security?
          </h2>
          <p className="text-sm text-white/50 mb-4">
            If you have security concerns or want to report a vulnerability,
            please reach out to our team.
          </p>
          <a
            href="mailto:admin@remoteleverage.com"
            className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-5 py-2.5 text-sm font-medium text-white  hover:bg-gray-800 transition-colors"
          >
            admin@remoteleverage.com
          </a>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/10 bg-transparent relative z-10">
        <div className="mx-auto max-w-4xl px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-white/40">
          <span>© {new Date().getFullYear()} Remote Leverage. All rights reserved.</span>
          <span>Last updated: February 2026</span>
        </div>
      </footer>
    </div>
  );
}
