"use client";
export default function Error({ error }: { error: Error }) {
  return <div className="p-8 text-center text-destructive">{error.message}</div>;
}
