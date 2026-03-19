import { type NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const redirectTo = request.nextUrl.clone()

  if (code) {
    let response = NextResponse.next({ request })
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return request.cookies.getAll() },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
            response = NextResponse.next({ request })
            cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
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
      return NextResponse.redirect(redirectTo)
    }
  }

  redirectTo.pathname = '/login'
  redirectTo.searchParams.set('error', 'oauth_failed')
  return NextResponse.redirect(redirectTo)
}
