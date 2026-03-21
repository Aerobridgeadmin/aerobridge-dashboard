import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'
import nodemailer from 'nodemailer'
import { createClient } from '@supabase/supabase-js'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

async function getEmailSettings(): Promise<Record<string, string>> {
  const { data } = await supabase.from('email_settings').select('*')
  const settings: Record<string, string> = {}
  data?.forEach((s: any) => { settings[s.setting_key] = s.setting_value })
  return settings
}

function buildEmail(p: {
  studentName: string; meetLink: string
  startTime: string; endTime: string; adminEmail: string
}): string {
  const start = new Date(p.startTime)
  const end = new Date(p.endTime)
  const dateStr = start.toLocaleDateString('es-CL', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
  const startStr = start.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })
  const endStr = end.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })

  return `<!DOCTYPE html>
<html lang="es" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>AeroBridge</title>
<style>*{box-sizing:border-box;margin:0;padding:0;}body{background:#f0f4f8;font-family:'Segoe UI',Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;}a{color:#1d4ed8;text-decoration:none;}</style>
</head>
<body style="background:#f0f4f8;margin:0;padding:0;">
<div style="display:none;max-height:0;overflow:hidden;color:#f0f4f8;font-size:1px;">Tu consulta gratuita de 15 min con AeroBridge está confirmada &nbsp;&#847;&nbsp;&#847;&nbsp;&#847;</div>

<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f0f4f8;padding:32px 16px;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">

  <!-- HEADER -->
  <tr>
    <td style="background:linear-gradient(135deg,#0a1f45 0%,#0f2b5b 50%,#1a3a73 100%);border-radius:16px 16px 0 0;padding:32px 40px;text-align:center;">
      <img src="https://dashboard.aerobridge.cl/images/logo-light.png" alt="AeroBridge" height="44" style="display:block;margin:0 auto;max-width:200px;"/>
    </td>
  </tr>

  <!-- BODY -->
  <tr>
    <td style="background:#ffffff;padding:40px 40px 32px;border-left:1px solid #e2e8f0;border-right:1px solid #e2e8f0;">

      <span style="display:inline-block;background:#f0fdf415;color:#059669;font-size:11px;font-weight:700;letter-spacing:0.8px;text-transform:uppercase;padding:4px 12px;border-radius:20px;border:1px solid #bbf7d0;margin-bottom:20px;">Consulta confirmada ✓</span>

      <h1 style="font-size:26px;font-weight:800;color:#0f172a;letter-spacing:-0.5px;margin:0 0 8px;line-height:1.3;">¡Tu consulta gratuita está agendada!</h1>
      <p style="font-size:15px;color:#475569;line-height:1.75;margin:0 0 24px;">
        Hola <strong style="color:#1e293b;">${p.studentName}</strong>, nos da mucho gusto que hayas elegido AeroBridge para iniciar tu camino en la aviación. A continuación encontrarás los detalles de tu sesión.
      </p>

      <!-- Meeting details card -->
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;margin-bottom:28px;">
        <tr>
          <td style="background:linear-gradient(135deg,#0f2b5b,#1d4ed8);padding:14px 20px;">
            <p style="font-size:13px;font-weight:700;color:#ffffff;margin:0;letter-spacing:0.3px;">📅 Detalles de la reunión</p>
          </td>
        </tr>
        <tr>
          <td style="padding:0;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="padding:14px 20px;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.6px;color:#94a3b8;width:35%;border-bottom:1px solid #f1f5f9;">Título</td>
                <td style="padding:14px 20px;font-size:14px;font-weight:600;color:#1e293b;border-bottom:1px solid #f1f5f9;">Consulta Gratuita 15 min — AeroBridge</td>
              </tr>
              <tr>
                <td style="padding:14px 20px;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.6px;color:#94a3b8;border-bottom:1px solid #f1f5f9;">Fecha</td>
                <td style="padding:14px 20px;font-size:14px;font-weight:600;color:#1e293b;border-bottom:1px solid #f1f5f9;">${dateStr}</td>
              </tr>
              <tr>
                <td style="padding:14px 20px;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.6px;color:#94a3b8;border-bottom:1px solid #f1f5f9;">Horario</td>
                <td style="padding:14px 20px;font-size:14px;font-weight:600;color:#1e293b;border-bottom:1px solid #f1f5f9;">${startStr} – ${endStr} (Chile)</td>
              </tr>
              <tr>
                <td style="padding:14px 20px;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.6px;color:#94a3b8;">Plataforma</td>
                <td style="padding:14px 20px;font-size:14px;font-weight:600;color:#1e293b;">Google Meet (enlace abajo)</td>
              </tr>
            </table>
          </td>
        </tr>
      </table>

      <!-- CTA -->
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px;">
        <tr><td align="center">
          <a href="${p.meetLink}" style="display:inline-block;background:linear-gradient(135deg,#1d4ed8,#2563eb);color:#ffffff;font-family:'Segoe UI',Helvetica,Arial,sans-serif;font-size:15px;font-weight:700;letter-spacing:0.3px;padding:14px 36px;border-radius:10px;text-decoration:none;box-shadow:0 4px 14px rgba(29,78,216,0.35);">
            Unirse a Google Meet →
          </a>
        </td></tr>
      </table>

      <!-- Link fallback -->
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:28px;">
        <tr><td style="background:#f0f7ff;border:1px solid #bfdbfe;border-radius:10px;padding:14px 18px;">
          <p style="font-size:12px;color:#64748b;margin:0 0 4px;font-weight:600;">O copia este enlace en tu navegador:</p>
          <a href="${p.meetLink}" style="font-size:13px;color:#1d4ed8;word-break:break-all;font-family:monospace;">${p.meetLink}</a>
        </td></tr>
      </table>

      <hr style="border:none;border-top:1px solid #e2e8f0;margin:0 0 24px;"/>
      <p style="font-size:14px;color:#64748b;line-height:1.7;margin:0;">
        ¿Tienes preguntas antes de la sesión? Escríbenos a
        <a href="mailto:${p.adminEmail}" style="color:#1d4ed8;font-weight:600;">${p.adminEmail}</a>
        y te responderemos lo antes posible.
      </p>

    </td>
  </tr>

  <!-- FOOTER -->
  <tr>
    <td style="background:#f8fafc;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 16px 16px;padding:24px 40px;text-align:center;">
      <p style="font-size:12px;color:#94a3b8;margin:0 0 6px;">© ${new Date().getFullYear()} AeroBridge · Formación aeronáutica profesional</p>
      <p style="font-size:11px;color:#cbd5e1;margin:0;">
        <a href="https://aerobridge.cl" style="color:#94a3b8;">aerobridge.cl</a>
        &nbsp;·&nbsp;
        <a href="mailto:${p.adminEmail}" style="color:#94a3b8;">${p.adminEmail}</a>
      </p>
    </td>
  </tr>

</table>
</td></tr>
</table>
</body></html>`
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { studentName, studentEmail, consultationDate, consultationTime, phone, interest, message, utm_source, utm_campaign, utm_medium } = body

    if (!studentName || !studentEmail || !consultationDate || !consultationTime) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400, headers: corsHeaders })
    }

    const ADMIN_EMAIL = 'admin@aerobridge.cl'
    const startDateTime = new Date(`${consultationDate}T${consultationTime}:00`)
    const endDateTime = new Date(startDateTime.getTime() + 15 * 60 * 1000)

    let meetLink = 'https://meet.google.com'
    let eventCreated = false
    let calendarError = ''
    let calendarEventId = ''
    let emailSent = false
    let emailError = ''

    // ── Google Calendar ──
    const clientEmail = process.env.GOOGLE_CLIENT_EMAIL
    const rawKey = process.env.GOOGLE_PRIVATE_KEY
    const privateKey = rawKey?.replace(/\\n/g, '\n')
    const calendarId = process.env.GOOGLE_CALENDAR_ID || 'primary'

    if (clientEmail && privateKey) {
      try {
        const auth = new google.auth.JWT({
          email: clientEmail,
          key: privateKey,
          scopes: ['https://www.googleapis.com/auth/calendar', 'https://www.googleapis.com/auth/calendar.events'],
          subject: ADMIN_EMAIL,
        })

        const calendar = google.calendar({ version: 'v3', auth })
        const event = await calendar.events.insert({
          calendarId,
          conferenceDataVersion: 1,
          sendUpdates: 'all',
          requestBody: {
            summary: `Consulta Gratuita 15 min — ${studentName}`,
            description: `Consulta gratuita con ${studentName}\nEmail: ${studentEmail}\nTeléfono: ${phone || 'N/A'}\nInterés: ${interest || 'General'}\n${message ? `Mensaje: ${message}` : ''}`,
            start: { dateTime: startDateTime.toISOString(), timeZone: 'America/Santiago' },
            end: { dateTime: endDateTime.toISOString(), timeZone: 'America/Santiago' },
            attendees: [
              { email: studentEmail, displayName: studentName },
              { email: ADMIN_EMAIL, displayName: 'AeroBridge Admin' },
            ],
            conferenceData: {
              createRequest: {
                requestId: `aerobridge-${Date.now()}`,
                conferenceSolutionKey: { type: 'hangoutsMeet' },
              },
            },
            reminders: {
              useDefault: false,
              overrides: [{ method: 'email', minutes: 60 }, { method: 'popup', minutes: 10 }],
            },
          },
        })

        meetLink = event.data.conferenceData?.entryPoints?.[0]?.uri
          || event.data.hangoutLink
          || 'https://meet.google.com'
        calendarEventId = event.data.id || ''
        eventCreated = true
      } catch (err: any) {
        calendarError = err.message
        console.error('Calendar error:', err.message)
      }
    } else {
      calendarError = `Credentials missing — clientEmail:${!!clientEmail} privateKey:${!!privateKey}`
    }

    // ── Save lead to Supabase ──
    let leadId = ''
    try {
      const { data: lead, error: leadErr } = await supabase.from('leads').insert({
        name: studentName,
        email: studentEmail,
        phone: phone || null,
        interest: interest || 'general',
        message: message || null,
        source: 'website',
        utm_source: utm_source || null,
        utm_campaign: utm_campaign || null,
        utm_medium: utm_medium || null,
        status: eventCreated ? 'scheduled' : 'new',
        consultation_date: startDateTime.toISOString(),
        consultation_end: endDateTime.toISOString(),
        meet_link: meetLink !== 'https://meet.google.com' ? meetLink : null,
        calendar_event_id: calendarEventId || null,
      }).select().single()

      if (leadErr) console.error('Lead insert error:', leadErr.message)
      else leadId = lead?.id || ''
    } catch (err: any) {
      console.error('Lead save error:', err.message)
    }

    // ── Email ──
    const settings = await getEmailSettings()
    const smtpHost = settings.smtp_host
    const smtpPort = parseInt(settings.smtp_port || '587')
    const smtpUser = settings.smtp_user
    const smtpPass = settings.smtp_pass
    const fromEmail = settings.from_email || ADMIN_EMAIL
    const fromName = settings.from_name || 'AeroBridge'

    if (smtpHost && smtpUser && smtpPass) {
      try {
        const transporter = nodemailer.createTransport({
          host: smtpHost,
          port: smtpPort,
          secure: smtpPort === 465,
          auth: { user: smtpUser, pass: smtpPass },
        })

        await transporter.sendMail({
          from: `"${fromName}" <${fromEmail}>`,
          to: studentEmail,
          bcc: ADMIN_EMAIL,
          subject: `Tu consulta gratuita en AeroBridge — ${startDateTime.toLocaleDateString('es-CL', { day: 'numeric', month: 'long' })}`,
          html: buildEmail({
            studentName, meetLink,
            startTime: startDateTime.toISOString(),
            endTime: endDateTime.toISOString(),
            adminEmail: ADMIN_EMAIL,
          }),
        })
        emailSent = true
      } catch (err: any) {
        emailError = err.message
        console.error('Email error:', err.message)
      }
    } else {
      emailError = `SMTP not configured — host:${smtpHost} user:${!!smtpUser} pass:${!!smtpPass}`
    }

    return NextResponse.json({
      success: true,
      leadId,
      meetLink,
      eventCreated,
      emailSent,
      startTime: startDateTime.toISOString(),
      endTime: endDateTime.toISOString(),
      ...(calendarError && { calendarError }),
      ...(emailError && { emailError }),
    }, { headers: corsHeaders })
  } catch (err: any) {
    console.error('Consultation API error:', err)
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500, headers: corsHeaders })
  }
}
