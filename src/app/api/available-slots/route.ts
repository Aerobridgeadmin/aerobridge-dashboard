import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const date = searchParams.get('date') // YYYY-MM-DD

    if (!date) {
      return NextResponse.json({ error: 'Missing date parameter' }, { status: 400, headers: corsHeaders })
    }

    const clientEmail = process.env.GOOGLE_CLIENT_EMAIL
    const rawKey = process.env.GOOGLE_PRIVATE_KEY
    const privateKey = rawKey?.replace(/\\n/g, '\n')
    const calendarId = process.env.GOOGLE_CALENDAR_ID || 'primary'

    // Default available hours (Chile time): 9:00 - 18:00, every 30 min
    const ALL_SLOTS = [
      '09:00', '09:30', '10:00', '10:30', '11:00', '11:30',
      '12:00', '12:30', '14:00', '14:30', '15:00', '15:30',
      '16:00', '16:30', '17:00', '17:30'
    ]

    // Check if date is a weekend
    const d = new Date(`${date}T12:00:00-04:00`) // Chile timezone offset
    const dayOfWeek = d.getDay()
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      return NextResponse.json({ slots: [], date, message: 'Weekends not available' }, { headers: corsHeaders })
    }

    // Check if date is in the past
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const selectedDate = new Date(`${date}T00:00:00-04:00`)
    if (selectedDate < today) {
      return NextResponse.json({ slots: [], date, message: 'Date in the past' }, { headers: corsHeaders })
    }

    // If Google Calendar credentials are available, check for busy times
    if (clientEmail && privateKey) {
      try {
        const auth = new google.auth.JWT({
          email: clientEmail,
          key: privateKey,
          scopes: ['https://www.googleapis.com/auth/calendar.readonly'],
          subject: 'admin@aerobridge.cl',
        })

        const calendar = google.calendar({ version: 'v3', auth })
        const timeMin = `${date}T00:00:00-04:00`
        const timeMax = `${date}T23:59:59-04:00`

        const busyRes = await calendar.freebusy.query({
          requestBody: {
            timeMin, timeMax,
            timeZone: 'America/Santiago',
            items: [{ id: calendarId }],
          },
        })

        const busyPeriods = busyRes.data.calendars?.[calendarId]?.busy || []

        // Filter out slots that overlap with busy periods
        const available = ALL_SLOTS.filter(slot => {
          const slotStart = new Date(`${date}T${slot}:00-04:00`)
          const slotEnd = new Date(slotStart.getTime() + 15 * 60 * 1000)

          // If today, filter past times
          const now = new Date()
          if (slotStart <= now) return false

          return !busyPeriods.some((busy: any) => {
            const busyStart = new Date(busy.start!)
            const busyEnd = new Date(busy.end!)
            return slotStart < busyEnd && slotEnd > busyStart
          })
        })

        return NextResponse.json({ slots: available, date }, { headers: corsHeaders })
      } catch (err: any) {
        console.error('Calendar busy check error:', err.message)
        // Fall through to return all slots
      }
    }

    // If no calendar access, return all slots (filtering past times for today)
    const now = new Date()
    const isToday = date === now.toISOString().split('T')[0]
    const available = isToday
      ? ALL_SLOTS.filter(slot => {
          const slotTime = new Date(`${date}T${slot}:00-04:00`)
          return slotTime > now
        })
      : ALL_SLOTS

    return NextResponse.json({ slots: available, date }, { headers: corsHeaders })
  } catch (err: any) {
    console.error('Available slots error:', err)
    return NextResponse.json({ error: err.message }, { status: 500, headers: corsHeaders })
  }
}
