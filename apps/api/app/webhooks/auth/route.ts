import { analytics } from "@repo/analytics/server";
import { log } from "@repo/observability/log";
import { NextResponse } from "next/server";

// Supabase Auth webhooks are handled differently than Clerk.
// This route handles webhook events from Supabase Auth.
// Configure these in your Supabase project's Auth Webhooks settings.

type SupabaseAuthWebhookPayload = {
  type: string;
  table: string;
  record: {
    id: string;
    email?: string;
    raw_user_meta_data?: Record<string, unknown>;
    created_at?: string;
    updated_at?: string;
  };
  old_record?: {
    id: string;
    email?: string;
    raw_user_meta_data?: Record<string, unknown>;
  };
};

const handleUserCreated = (record: SupabaseAuthWebhookPayload["record"]) => {
  analytics.identify({
    distinctId: record.id,
    properties: {
      email: record.email,
      name: record.raw_user_meta_data?.name as string | undefined,
      createdAt: record.created_at ? new Date(record.created_at) : new Date(),
      avatar: record.raw_user_meta_data?.avatar_url as string | undefined,
    },
  });

  analytics.capture({
    event: "User Created",
    distinctId: record.id,
  });

  return new Response("User created", { status: 201 });
};

const handleUserUpdated = (record: SupabaseAuthWebhookPayload["record"]) => {
  analytics.identify({
    distinctId: record.id,
    properties: {
      email: record.email,
      name: record.raw_user_meta_data?.name as string | undefined,
      avatar: record.raw_user_meta_data?.avatar_url as string | undefined,
    },
  });

  analytics.capture({
    event: "User Updated",
    distinctId: record.id,
  });

  return new Response("User updated", { status: 201 });
};

const handleUserDeleted = (record: SupabaseAuthWebhookPayload["record"]) => {
  analytics.identify({
    distinctId: record.id,
    properties: {
      deleted: new Date(),
    },
  });

  analytics.capture({
    event: "User Deleted",
    distinctId: record.id,
  });

  return new Response("User deleted", { status: 201 });
};

export const POST = async (request: Request): Promise<Response> => {
  try {
    const payload = (await request.json()) as SupabaseAuthWebhookPayload;

    log.info("Supabase Auth Webhook", {
      type: payload.type,
      table: payload.table,
      recordId: payload.record?.id,
    });

    let response: Response = new Response("", { status: 201 });

    if (payload.table === "users") {
      switch (payload.type) {
        case "INSERT": {
          response = handleUserCreated(payload.record);
          break;
        }
        case "UPDATE": {
          response = handleUserUpdated(payload.record);
          break;
        }
        case "DELETE": {
          if (payload.old_record) {
            response = handleUserDeleted(payload.old_record);
          }
          break;
        }
        default:
          break;
      }
    }

    await analytics.shutdown();

    return response;
  } catch (error) {
    log.error("Error processing Supabase webhook:", { error });
    return new Response("Error processing webhook", { status: 400 });
  }
};
