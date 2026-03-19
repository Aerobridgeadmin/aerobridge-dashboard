"use client";

import dynamic from "next/dynamic";

type Location = { country: string; city: string };

const GlobeScene = dynamic(
  () => import("./globe-scene").then((m) => ({ default: m.GlobeScene })),
  {
    ssr: false,
    loading: () => (
      <div
        className="relative w-full animate-pulse"
        style={{
          height: "clamp(320px, 42vh, 520px)",
          background:
            "radial-gradient(ellipse at 50% 50%, rgba(0,176,187,0.08) 0%, rgba(0,219,101,0.03) 40%, transparent 70%)",
        }}
      />
    ),
  }
);

export function GlobeHero({
  contractorCount,
  countryCount,
  locations,
}: {
  contractorCount?: number;
  countryCount?: number;
  locations?: Location[];
}) {
  return (
    <GlobeScene contractorCount={contractorCount} countryCount={countryCount} locations={locations} />
  );
}
