import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Handle email confirmation callback from Supabase Auth
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const token_hash = searchParams.get('token_hash')
  const type = searchParams.get('type')
  const redirectTo = request.nextUrl.clone()

  if (token_hash && type) {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
    const { error } = await supabase.auth.verifyOtp({
      type: type as any,
      token_hash,
    })
    if (!error) {
      redirectTo.pathname = '/'
      redirectTo.searchParams.delete('token_hash')
      redirectTo.searchParams.delete('type')
      return NextResponse.redirect(redirectTo)
    }
  }

  redirectTo.pathname = '/login'
  return NextResponse.redirect(redirectTo)
}
