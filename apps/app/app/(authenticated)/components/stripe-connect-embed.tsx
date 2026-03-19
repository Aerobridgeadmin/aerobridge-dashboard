"use client";

import { useState} from "react";
import {
  ConnectComponentsProvider,
  ConnectAccountOnboarding,
  ConnectPayouts,
  ConnectAccountManagement,
} from "@stripe/react-connect-js";
import { loadConnectAndInitialize } from "@stripe/connect-js";

type StripeEmbedProps = {
  employeeId: string;
  stripeAccountId: string;
  view: "onboarding" | "payouts" | "management";
  onOnboardingComplete?: () => void;
};

export function StripeConnectEmbed({ employeeId, stripeAccountId, view, onOnboardingComplete }: StripeEmbedProps) {
  const [error, setError] = useState<string | null>(null);

  const [stripeConnectInstance] = useState(() => {
    const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
    if (!publishableKey) {
      setError("Stripe publishable key not configured");
      return null;
    }

    return loadConnectAndInitialize({
      publishableKey,
      fetchClientSecret: async () => {
        try {
          const res = await fetch("/api/stripe-connect/account-session", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ employeeId }),
          });
          if (!res.ok) {
            const data = await res.json();
            throw new Error(data.error || "Failed to create account session");
          }
          const { clientSecret } = await res.json();
          return clientSecret;
        } catch (err: any) {
          setError(err.message);
          return "";
        }
      },
      appearance: {
        overlays: "dialog",
        variables: {
          colorPrimary: "#7c3aed",
          fontFamily: "Inter, system-ui, sans-serif",
        },
      },
    });
  });

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-800 p-4 text-sm text-red-700 dark:text-red-400">
        {error}
      </div>
    );
  }

  if (!stripeConnectInstance) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
        <span className="ml-2 text-sm text-muted-foreground">Loading Stripe...</span>
      </div>
    );
  }

  return (
    <ConnectComponentsProvider connectInstance={stripeConnectInstance}>
      {view === "onboarding" && (
        <ConnectAccountOnboarding
          onExit={() => onOnboardingComplete?.()}
        />
      )}
      {view === "payouts" && <ConnectPayouts />}
      {view === "management" && <ConnectAccountManagement />}
    </ConnectComponentsProvider>
  );
}
