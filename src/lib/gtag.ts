// Google Ads conversion tracking helpers

declare global {
  interface Window {
    gtag: (...args: any[]) => void
    dataLayer: any[]
  }
}

const GADS_ID = 'AW-18028243819'

// Fire a Google Ads conversion event
export function fireConversion(label: string, value?: number) {
  if (typeof window === 'undefined' || !window.gtag) return
  window.gtag('event', 'conversion', {
    send_to: `${GADS_ID}/${label}`,
    ...(value !== undefined && { value, currency: 'USD' }),
  })
}

// Specific conversions
export const gtagConsultationBooked = () => fireConversion('enY8CNm3r4wceOvWxJRD', 1.0)
export const gtagStudentAdded       = () => fireConversion('GXCACNS9iYwcEOvWxJRD', 1.0)
