import { database } from "@repo/database";
import { NextResponse } from "next/server";

export const maxDuration = 120;

/**
 * Cron: Process delayed offboarding steps.
 * Runs every 15 minutes. Finds employees in offboarding_in_progress,
 * checks which delayed steps are now ready, and executes them directly
 * (bypasses auth-gated server actions since cron has no user session).
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const employees = await database.employee.findMany({
    where: { employmentStatus: "offboarding_in_progress" },
    select: {
      id: true, legalFirstName: true, legalLastName: true,
      personalEmail: true, workEmail: true, endDate: true,
      offboardingStatus: true, linkedUserId: true,
      timeDoctorEmail: true, organizationId: true,
      organization: { select: { name: true } },
    },
  });

  if (employees.length === 0) {
    return NextResponse.json({ ok: true, processed: 0, message: "No active offboardings" });
  }

  const now = new Date();
  const results: { name: string; stepsRun: string[]; completed: boolean; errors: string[] }[] = [];

  for (const emp of employees) {
    const name = `${emp.legalFirstName} ${emp.legalLastName}`;
    const stepsRun: string[] = [];
    const errors: string[] = [];

    let steps: any[];
    try { steps = JSON.parse(emp.offboardingStatus || "[]"); if (!Array.isArray(steps)) steps = []; } catch { steps = []; }
    if (steps.length === 0) { results.push({ name, stepsRun: [], completed: false, errors: ["No steps"] }); continue; }

    for (const step of steps) {
      if (step.status === "completed" || step.status === "skipped") continue;
      if (step.scheduledFor && new Date(step.scheduledFor) > now) continue;

      try {
        switch (step.key) {
          case "offboarding_notification": {
            const email = emp.personalEmail ?? emp.workEmail;
            if (!email) { step.status = "completed"; step.completedAt = now.toISOString(); step.error = "No email — N/A"; stepsRun.push("email(skip)"); break; }
            try {
              const { sendViaGmailSystem } = await import("@/app/actions/hriq/send-email");
              const { offboardingNotificationEmail } = await import("@/app/actions/hriq/email-templates");
              const endDateStr = emp.endDate ? new Date(emp.endDate as any).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "effective immediately";
              const html = offboardingNotificationEmail(name, { endDate: endDateStr, orgName: emp.organization?.name ?? "Remote Leverage", timesheetNote: true });
              await sendViaGmailSystem(email, "Offboarding Notice — Remote Leverage", html);
              step.status = "completed"; step.completedAt = now.toISOString(); stepsRun.push("email");
            } catch (e) { step.error = e instanceof Error ? e.message : "Failed"; errors.push(`email: ${step.error}`); }
            try { await database.auditLog.create({ data: { organizationId: emp.organizationId, actorType: "system", action: "employee.offboarding_email_sent", objectType: "employee", objectId: emp.id, newValue: { email, sentBy: "cron" } } }); } catch (err) { console.warn("[offboarding-process/route:GET] Suppressed error:", err); }
            break;
          }

          case "slack_removal": {
            const email = emp.workEmail ?? emp.personalEmail;
            const slackToken = process.env.SLACK_BOT_TOKEN;
            if (!email || !slackToken) { step.status = "completed"; step.completedAt = now.toISOString(); step.error = !email ? "No email" : "Slack not configured"; stepsRun.push("slack(skip)"); break; }
            try {
              const lookupRes = await fetch(`https://slack.com/api/users.lookupByEmail?email=${encodeURIComponent(email)}`, { headers: { Authorization: `Bearer ${slackToken}` } });
              const lookupData = await lookupRes.json();
              if (!lookupData.ok || !lookupData.user?.id) { step.status = "completed"; step.completedAt = now.toISOString(); step.error = `User not found: ${email}`; stepsRun.push("slack(not found)"); break; }
              const slackUserId = lookupData.user.id;
              const removeRes = await fetch("https://slack.com/api/admin.users.remove", { method: "POST", headers: { Authorization: `Bearer ${slackToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ team_id: process.env.SLACK_TEAM_ID || lookupData.user.team_id, user_id: slackUserId }) });
              const removeData = await removeRes.json();
              if (removeData.ok || removeData.error === "user_not_found" || removeData.error === "already_removed") {
                step.status = "completed"; step.completedAt = now.toISOString(); stepsRun.push("slack");
              } else { step.error = `Slack: ${removeData.error}`; errors.push(step.error); }
              try { await database.auditLog.create({ data: { organizationId: emp.organizationId, actorType: "system", action: "employee.offboarding_slack_removed", objectType: "employee", objectId: emp.id, newValue: { slackUserId, removedBy: "cron" } } }); } catch (err) { console.warn("[offboarding-process/route:GET] Suppressed error:", err); }
            } catch (e) { step.error = e instanceof Error ? e.message : "Failed"; errors.push(`slack: ${step.error}`); }
            break;
          }

          case "disable_dashboard": {
            if (!emp.linkedUserId) { step.status = "completed"; step.completedAt = now.toISOString(); step.error = "No linked user"; stepsRun.push("dashboard(skip)"); break; }
            try {
              const { getSupabaseAdmin } = await import("@/app/actions/hriq/constants");
              await getSupabaseAdmin().auth.admin.updateUserById(emp.linkedUserId, { ban_duration: "876600h" });
              step.status = "completed"; step.completedAt = now.toISOString(); stepsRun.push("dashboard");
              const emails = [emp.workEmail, emp.personalEmail].filter(Boolean) as string[];
              for (const e of emails) { try { await database.$executeRaw`DELETE FROM approved_emails WHERE email = ${e}`; } catch (err) { console.warn("[offboarding-process/route:GET] Suppressed error:", err); } }
            } catch (e) { step.error = e instanceof Error ? e.message : "Failed"; errors.push(`dashboard: ${step.error}`); }
            break;
          }

          case "it_ticket": {
            const freshdeskKey = process.env.FRESHDESK_API_KEY;
            if (!freshdeskKey) { step.status = "skipped"; step.completedAt = now.toISOString(); step.error = "FRESHDESK_API_KEY not set"; stepsRun.push("it_ticket(skip)"); break; }
            try {
              const contractorName = `${emp.legalFirstName ?? ""} ${emp.legalLastName ?? ""}`.trim();
              const endDateStr = emp.endDate ? new Date(emp.endDate as any).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "immediately";
              const orgName = emp.organization?.name ?? "Remote Leverage";
              const subject = `URGENT: Offboarding — ${contractorName} (${orgName})`;
              const htmlDescription = `<p><strong>Offboarding IT Ticket (auto-created by system)</strong></p><p>Please remove all access for <strong>${contractorName}</strong>.</p><ul><li>Work Email: ${emp.workEmail ?? "N/A"}</li><li>Personal Email: ${emp.personalEmail ?? "N/A"}</li><li>Time Doctor: ${emp.timeDoctorEmail ?? "N/A"}</li><li>Last Working Day: ${endDateStr}</li><li>Organization: ${orgName}</li></ul>`;
              const fdRes = await fetch("https://remoteleverage.freshdesk.com/api/v2/tickets", {
                signal: AbortSignal.timeout(8000),
                method: "POST",
                headers: { Authorization: `Basic ${Buffer.from(`${freshdeskKey}:X`).toString("base64")}`, "Content-Type": "application/json" },
                body: JSON.stringify({ subject, description: htmlDescription, email: "support@remoteleverage.com", name: contractorName, priority: 4, status: 2, source: 2, type: "Onboarding / Offboarding", tags: ["hriq", "offboarding", "urgent", "cron"] }),
              });
              if (fdRes.ok) {
                const ticket = await fdRes.json();
                step.status = "completed"; step.completedAt = now.toISOString(); stepsRun.push("it_ticket");
                try { await database.auditLog.create({ data: { organizationId: emp.organizationId, actorType: "system", action: "employee.offboarding_it_ticket_sent", objectType: "employee", objectId: emp.id, newValue: { freshdeskTicketId: ticket.id, sentBy: "cron" } } }); } catch (err) { console.warn("[offboarding-process] audit log error:", err); }
              } else {
                const errBody = await fdRes.text().catch(() => "");
                step.error = `Freshdesk ${fdRes.status}: ${errBody.slice(0, 200)}`; errors.push(`it_ticket: ${step.error}`);
              }
            } catch (e) { step.error = e instanceof Error ? e.message : "Failed"; errors.push(`it_ticket: ${step.error}`); }
            break;
          }

          case "time_doctor_removal":
          case "recruitcrm_status":
            if (step.status === "pending") { step.status = "skipped"; step.completedAt = now.toISOString(); step.error = "Auto-skipped by cron"; stepsRun.push(`${step.key}(skip)`); }
            break;
        }
      } catch (err) { step.error = err instanceof Error ? err.message : "Unknown"; errors.push(`${step.key}: ${step.error}`); }
    }

    // Check completion
    const nonFinal = steps.filter((s: any) => s.key !== "final_review");
    const allDone = nonFinal.every((s: any) => s.status === "completed" || s.status === "skipped");
    let completed = false;

    if (allDone) {
      const finalStep = steps.find((s: any) => s.key === "final_review");
      if (finalStep) { finalStep.status = "completed"; finalStep.completedAt = now.toISOString(); }

      if (emp.linkedUserId) {
        try { const { getSupabaseAdmin } = await import("@/app/actions/hriq/constants"); await getSupabaseAdmin().auth.admin.updateUserById(emp.linkedUserId, { ban_duration: "876600h" }); } catch (err) { console.warn("[offboarding-process/route:GET] Suppressed error:", err); }
      }
      const emails = [emp.workEmail, emp.personalEmail].filter(Boolean) as string[];
      for (const e of emails) { try { await database.$executeRaw`DELETE FROM approved_emails WHERE email = ${e}`; } catch (err) { console.warn("[offboarding-process/route:GET] Suppressed error:", err); } }

      await database.employee.update({ where: { id: emp.id }, data: { employmentStatus: "offboarded", endDate: now, offboardingStatus: JSON.stringify(steps) } });
      try { await database.auditLog.create({ data: { organizationId: emp.organizationId, actorType: "system", action: "employee.offboarding_completed", objectType: "employee", objectId: emp.id, newValue: { completedAt: now.toISOString(), completedBy: "cron" } } }); } catch (err) { console.warn("[offboarding-process/route:GET] Suppressed error:", err); }
      completed = true; stepsRun.push("completed");
    } else if (stepsRun.length > 0) {
      await database.employee.update({ where: { id: emp.id }, data: { offboardingStatus: JSON.stringify(steps) } });
    }

    results.push({ name, stepsRun, completed, errors });
  }

  return NextResponse.json({ ok: true, processed: results.filter(r => r.stepsRun.length > 0).length, completed: results.filter(r => r.completed).length, total: employees.length, results, timestamp: now.toISOString() });
}
