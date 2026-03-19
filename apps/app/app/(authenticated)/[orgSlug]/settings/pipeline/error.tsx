"use client";

import { PageErrorBoundary } from "@/app/(authenticated)/components/page-error-boundary";

export default function PipelineError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <PageErrorBoundary error={error} reset={reset} pageName="Pipeline Management" />;
}
