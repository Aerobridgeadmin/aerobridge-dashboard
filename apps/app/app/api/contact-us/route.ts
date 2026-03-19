import { NextResponse } from "next/server";
import { createClient } from "@repo/auth/server";
import { rateLimit } from "@/lib/rate-limit";
import { headers } from "next/headers";

const limiter = rateLimit({ max: 5, windowMs: 60000 });

const FRESHDESK_DOMAIN = "remoteleverage";
const FRESHDESK_API_KEY = process.env.FRESHDESK_API_KEY ?? "";

export async function POST(req: Request) {
  const hdrs = await headers();
  const ip = hdrs.get("x-forwarded-for")?.split(",")[0] ?? "unknown";
  const { limited } = limiter.check(ip);
  if (limited) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  try {
    // Verify authenticated user
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!FRESHDESK_API_KEY) {
      console.error("[contact-us] FRESHDESK_API_KEY is not configured");
      return NextResponse.json(
        { error: "Support system is not configured. Please contact your administrator." },
        { status: 503 }
      );
    }

    // Parse multipart form data
    const formData = await req.formData();
    const subject = formData.get("subject") as string | null;
    const description = formData.get("description") as string | null;
    const category = (formData.get("category") as string) || "general";
    const priority = (formData.get("priority") as string) || "low";
    const attachments = formData.getAll("attachments") as File[];

    if (!subject || !description) {
      return NextResponse.json(
        { error: "Subject and description are required" },
        { status: 400 }
      );
    }

    const userName =
      (user.user_metadata?.name as string) ?? user.email ?? "Unknown";
    const userEmail = user.email ?? "noreply@remoteleverage.com";
    const userRole = (user.user_metadata?.role as string) ?? "member";

    // Map priority: 1=Low, 2=Medium, 3=High, 4=Urgent
    const freshdeskPriority =
      priority === "urgent" ? 4 : priority === "high" ? 3 : priority === "medium" ? 2 : 1;

    // Map category to Freshdesk ticket type
    const typeMap: Record<string, string> = {
      bug: "Problem",
      feature: "Feature Request",
      question: "Question",
      account: "Question",
      other: "Question",
    };

    // Build multipart form for Freshdesk (required for attachments)
    const fdForm = new FormData();
    fdForm.append("subject", `[HRIQ] ${subject}`);
    fdForm.append(
      "description",
      `<p><strong>Source:</strong> HRIQ Platform</p>
<p><strong>From:</strong> ${userName} (${userEmail})</p>
<p><strong>Role:</strong> ${userRole}</p>
<p><strong>Category:</strong> ${category}</p>
<hr/>
<p>${description.replace(/\n/g, "<br/>")}</p>`
    );
    fdForm.append("email", userEmail);
    fdForm.append("name", userName);
    fdForm.append("priority", String(freshdeskPriority));
    fdForm.append("status", "2"); // Open
    fdForm.append("source", "2"); // Portal
    fdForm.append("type", typeMap[category] || "Question");
    fdForm.append("tags[]", "hriq");
    fdForm.append("tags[]", `role:${userRole}`);
    fdForm.append("tags[]", `category:${category}`);

    // Attach files (Freshdesk expects "attachments[]")
    for (const file of attachments) {
      if (file && file.size > 0) {
        fdForm.append("attachments[]", file, file.name);
      }
    }

    const freshdeskUrl = `https://${FRESHDESK_DOMAIN}.freshdesk.com/api/v2/tickets`;
    const authHeader = `Basic ${Buffer.from(`${FRESHDESK_API_KEY}:X`).toString("base64")}`;

    const fdResponse = await fetch(freshdeskUrl, {
      method: "POST",
      headers: {
        Authorization: authHeader,
        // Do NOT set Content-Type — fetch will set multipart boundary automatically
      },
      body: fdForm,
    });

    if (!fdResponse.ok) {
      const errBody = await fdResponse.text();
      console.error("[contact-us] Freshdesk API error:", fdResponse.status, errBody);
      return NextResponse.json(
        { error: "Failed to create support ticket. Please try again later." },
        { status: 502 }
      );
    }

    const ticket = await fdResponse.json();

    return NextResponse.json({
      success: true,
      ticketId: ticket.id,
      message: "Your support request has been submitted successfully.",
    });
  } catch (error) {
    console.error("[contact-us] Unexpected error:", error);
    return NextResponse.json(
      { error: "An unexpected error occurred. Please try again." },
      { status: 500 }
    );
  }
}
