import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'
import nodemailer from 'nodemailer'
import { createClient } from '@supabase/supabase-js'

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

function buildConsultationEmail(params: {
  studentName: string
  meetLink: string
  startTime: string
  endTime: string
  adminEmail: string
}): string {
  const start = new Date(params.startTime)
  const end = new Date(params.endTime)
  const dateStr = start.toLocaleDateString('es-CL', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
  const startStr = start.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })
  const endStr = end.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Tu consulta gratuita — AeroBridge</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#0f2b5b 0%,#1d4ed8 100%);padding:36px 40px;text-align:center;">
            <img src="https://aerobridge.cl/logo-light.png" alt="AeroBridge" height="40" style="margin-bottom:16px;" />
            <h1 style="color:#ffffff;font-size:22px;font-weight:700;margin:0 0 6px;">¡Bienvenido/a a AeroBridge!</h1>
            <p style="color:#93c5fd;font-size:14px;margin:0;">Tu consulta gratuita de 15 minutos está confirmada</p>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:36px 40px;">
            <p style="color:#334155;font-size:15px;margin:0 0 20px;">Hola <strong>${params.studentName}</strong>,</p>
            <p style="color:#64748b;font-size:14px;line-height:1.7;margin:0 0 28px;">
              Nos da mucho gusto que hayas elegido AeroBridge para iniciar tu camino en la aviación. 
              Hemos agendado una consulta gratuita de 15 minutos para que puedas resolver tus dudas con nuestro equipo.
            </p>

            <!-- Meeting card -->
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;margin-bottom:28px;">
              <tr>
                <td style="padding:20px 24px;border-bottom:1px solid #e2e8f0;">
                  <p style="margin:0 0 4px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.1em;color:#94a3b8;">Detalles de la reunión</p>
                  <p style="margin:0;font-size:17px;font-weight:700;color:#0f172a;">Consulta Gratuita — AeroBridge</p>
                </td>
              </tr>
              <tr>
                <td style="padding:20px 24px;">
                  <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td width="24" valign="top" style="padding-top:1px;">
                        <span style="font-size:16px;">📅</span>
                      </td>
                      <td style="padding-left:10px;padding-bottom:12px;">
                        <p style="margin:0;font-size:13px;font-weight:600;color:#1e293b;">${dateStr}</p>
                        <p style="margin:2px 0 0;font-size:12px;color:#64748b;">${startStr} – ${endStr}</p>
                      </td>
                    </tr>
                    <tr>
                      <td width="24" valign="top" style="padding-top:1px;">
                        <span style="font-size:16px;">🎥</span>
                      </td>
                      <td style="padding-left:10px;">
                        <p style="margin:0;font-size:13px;font-weight:600;color:#1e293b;">Google Meet</p>
                        <p style="margin:2px 0 0;font-size:12px;color:#64748b;">Reunión en línea — enlace abajo</p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>

            <!-- CTA Button -->
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
              <tr>
                <td align="center">
                  <a href="${params.meetLink}"
                    style="display:inline-block;background:#1d4ed8;color:#ffffff;font-size:14px;font-weight:600;padding:14px 32px;border-radius:8px;text-decoration:none;">
                    Unirse a Google Meet →
                  </a>
                </td>
              </tr>
            </table>

            <p style="color:#94a3b8;font-size:12px;line-height:1.6;margin:0 0 8px;">
              También puedes copiar y pegar este enlace en tu navegador:<br/>
              <a href="${params.meetLink}" style="color:#1d4ed8;word-break:break-all;">${params.meetLink}</a>
            </p>

            <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;" />

            <p style="color:#64748b;font-size:13px;line-height:1.7;margin:0;">
              Si tienes preguntas antes de tu consulta, escríbenos a 
              <a href="mailto:${params.adminEmail}" style="color:#1d4ed8;">${params.adminEmail}</a>.
              ¡Nos vemos pronto!
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:20px 40px;text-align:center;">
            <p style="margin:0;font-size:11px;color:#94a3b8;">
              © ${new Date().getFullYear()} AeroBridge · 
              <a href="https://aerobridge.cl" style="color:#64748b;text-decoration:none;">aerobridge.cl</a>
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { studentName, studentEmail, consultationDate, consultationTime } = body

    if (!studentName || !studentEmail || !consultationDate || !consultationTime) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const ADMIN_EMAIL = 'admin@aerobridge.cl'

    // ── Parse start/end times ──
    const startDateTime = new Date(`${consultationDate}T${consultationTime}:00`)
    const endDateTime = new Date(startDateTime.getTime() + 15 * 60 * 1000)

    let meetLink = ''
    let eventCreated = false

    // ── Create Google Meet via Calendar API ──
    const clientEmail = process.env.GOOGLE_CLIENT_EMAIL
    const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n')
    const calendarId = process.env.GOOGLE_CALENDAR_ID || 'primary'

    if (clientEmail && privateKey) {
      try {
        const auth = new google.auth.JWT({
          email: clientEmail,
          key: privateKey,
          scopes: [
            'https://www.googleapis.com/auth/calendar',
            'https://www.googleapis.com/auth/calendar.events',
          ],
        })

        const calendar = google.calendar({ version: 'v3', auth })

        const event = await calendar.events.insert({
          calendarId,
          conferenceDataVersion: 1,
          sendUpdates: 'all',
          requestBody: {
            summary: `Consulta Gratuita 15 min — ${studentName}`,
            description: `Consulta gratuita de bienvenida con ${studentName} (${studentEmail}).\n\nAgendado desde el panel de administración de AeroBridge.`,
            start: {
              dateTime: startDateTime.toISOString(),
              timeZone: 'America/Santiago',
            },
            end: {
              dateTime: endDateTime.toISOString(),
              timeZone: 'America/Santiago',
            },
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
              overrides: [
                { method: 'email', minutes: 60 },
                { method: 'popup', minutes: 10 },
              ],
            },
          },
        })

        meetLink = event.data.conferenceData?.entryPoints?.[0]?.uri
          || event.data.hangoutLink
          || `https://meet.google.com`
        eventCreated = true
      } catch (calErr: any) {
        console.error('Google Calendar error:', calErr.message)
        // Fall through — still send email with placeholder
        meetLink = `https://meet.google.com` 
      }
    } else {
      console.warn('Google Calendar credentials not configured — skipping Meet creation')
      meetLink = 'https://meet.google.com'
    }

    // ── Send welcome email ──
    const emailSettings = await getEmailSettings()
    const smtpHost = emailSettings.smtp_host
    const smtpPort = parseInt(emailSettings.smtp_port || '587')
    const smtpUser = emailSettings.smtp_user
    const smtpPass = emailSettings.smtp_pass
    const fromEmail = emailSettings.from_email || ADMIN_EMAIL
    const fromName = emailSettings.from_name || 'AeroBridge'

    let emailSent = false

    if (smtpHost && smtpUser && smtpPass) {
      try {
        const transporter = nodemailer.createTransporter({
          host: smtpHost,
          port: smtpPort,
          secure: smtpPort === 465,
          auth: { user: smtpUser, pass: smtpPass },
        })

        const html = buildConsultationEmail({
          studentName,
          meetLink,
          startTime: startDateTime.toISOString(),
          endTime: endDateTime.toISOString(),
          adminEmail: ADMIN_EMAIL,
        })

        await transporter.sendMail({
          from: `"${fromName}" <${fromEmail}>`,
          to: studentEmail,
          bcc: ADMIN_EMAIL,
          subject: `Tu consulta gratuita en AeroBridge — ${startDateTime.toLocaleDateString('es-CL', { day: 'numeric', month: 'long' })}`,
          html,
        })

        emailSent = true
      } catch (mailErr: any) {
        console.error('Email send error:', mailErr.message)
      }
    } else {
      console.warn('SMTP not configured — email not sent')
    }

    return NextResponse.json({
      success: true,
      meetLink,
      eventCreated,
      emailSent,
      startTime: startDateTime.toISOString(),
      endTime: endDateTime.toISOString(),
    })
  } catch (err: any) {
    console.error('Consultation API error:', err)
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 })
  }
}
