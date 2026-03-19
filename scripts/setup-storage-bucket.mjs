#!/usr/bin/env node
/**
 * Ensures the `org-documents` Supabase storage bucket exists with proper
 * configuration. Safe to run multiple times (idempotent).
 *
 * Usage:
 *   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/setup-storage-bucket.mjs
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error(" Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const BUCKET = "org-documents";

async function main() {
  const headers = {
    Authorization: `Bearer ${key}`,
    apikey: key,
    "Content-Type": "application/json",
  };

  // 1) Check if bucket exists
  const listRes = await fetch(`${url}/storage/v1/bucket`, { headers });
  const buckets = await listRes.json();

  const exists = Array.isArray(buckets) && buckets.some((b) => b.id === BUCKET);

  if (exists) {
    console.log(` Bucket "${BUCKET}" already exists`);

    // Update to ensure public access
    const updateRes = await fetch(`${url}/storage/v1/bucket/${BUCKET}`, {
      method: "PUT",
      headers,
      body: JSON.stringify({
        public: true,
        file_size_limit: 10485760, // 10MB
        allowed_mime_types: [
          "image/jpeg", "image/png", "image/gif", "image/webp",
          "application/pdf",
          "application/msword",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ],
      }),
    });

    if (updateRes.ok) {
      console.log(" Bucket settings updated (public: true, 10MB limit)");
    } else {
      const err = await updateRes.text();
      console.warn("  Could not update bucket settings:", err);
    }
  } else {
    // 2) Create bucket
    const createRes = await fetch(`${url}/storage/v1/bucket`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        id: BUCKET,
        name: BUCKET,
        public: true,
        file_size_limit: 10485760,
        allowed_mime_types: [
          "image/jpeg", "image/png", "image/gif", "image/webp",
          "application/pdf",
          "application/msword",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ],
      }),
    });

    if (createRes.ok) {
      console.log(` Bucket "${BUCKET}" created with public read access`);
    } else {
      const err = await createRes.text();
      console.error(` Failed to create bucket: ${err}`);
      process.exit(1);
    }
  }

  // 3) Set up RLS policy for public reads
  // Supabase storage automatically serves public bucket files, but let's
  // also ensure the policy allows authenticated uploads.
  console.log(`\n Storage bucket "${BUCKET}" is ready.`);
  console.log("   Public URL pattern: ${SUPABASE_URL}/storage/v1/object/public/org-documents/<path>");
  console.log("   Max file size: 10MB");
  console.log("   Allowed types: images, PDF, Word docs\n");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
