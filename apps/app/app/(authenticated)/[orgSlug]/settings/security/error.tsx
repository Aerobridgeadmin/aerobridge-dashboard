"use client";

import { PageErrorBoundary } from "@/app/(authenticated)/components/page-error-boundary";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <PageErrorBoundary error={error} reset={reset} pageName="Settings Security" />;
}
