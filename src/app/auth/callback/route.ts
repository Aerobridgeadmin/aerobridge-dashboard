import { type NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const redirectTo = request.nextUrl.clone()

  if (code) {
    // We collect cookies that need to be set during exchangeCodeForSession
    const cookiesToSet: { name: string; value: string; options: any }[] = []

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return request.cookies.getAll() },
          setAll(incoming) {
            // Buffer them — we'll attach to whichever response we return
            incoming.forEach(c => {
              request.cookies.set(c.name, c.value)
              cookiesToSet.push(c)
            })
          },
        },
      }
    )

    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      const { data: { user } } = await supabase.auth.getUser()
      const email = user?.email || ''

      // Enforce @aerobridge.cl domain for Google SSO
      if (user?.app_metadata?.provider === 'google' && !email.endsWith('@aerobridge.cl')) {
        await supabase.auth.signOut()
        redirectTo.pathname = '/login'
        redirectTo.searchParams.set('error', 'domain_restricted')
        return NextResponse.redirect(redirectTo)
      }

      redirectTo.pathname = '/'
      redirectTo.searchParams.delete('code')
      // Build the redirect and attach all session cookies to it
      const redirectResponse = NextResponse.redirect(redirectTo)
      cookiesToSet.forEach(({ name, value, options }) =>
        redirectResponse.cookies.set(name, value, options)
      )
      return redirectResponse
    }
  }

  redirectTo.pathname = '/login'
  redirectTo.searchParams.set('error', 'oauth_failed')
  return NextResponse.redirect(redirectTo)
}
