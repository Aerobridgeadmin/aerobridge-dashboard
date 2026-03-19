import { type NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const token_hash = searchParams.get('token_hash')
  const type = searchParams.get('type')
  const redirectTo = request.nextUrl.clone()

  if (token_hash && type) {
    const validTypes = ['signup', 'magiclink', 'recovery', 'email_change'] as const
    if (!validTypes.includes(type as any)) {
      redirectTo.pathname = '/login'
      redirectTo.searchParams.set('error', 'invalid_type')
      return NextResponse.redirect(redirectTo)
    }

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

    const { error } = await supabase.auth.verifyOtp({
      type: type as typeof validTypes[number],
      token_hash,
    })

    if (!error) {
      redirectTo.pathname = type === 'recovery' ? '/settings' : '/'
      redirectTo.searchParams.delete('token_hash')
      redirectTo.searchParams.delete('type')
      return NextResponse.redirect(redirectTo)
    }

    redirectTo.pathname = '/login'
    redirectTo.searchParams.set('error', 'verification_failed')
    return NextResponse.redirect(redirectTo)
  }

  redirectTo.pathname = '/login'
  redirectTo.searchParams.set('error', 'missing_params')
  return NextResponse.redirect(redirectTo)
}
