-- login_verifications is a server-side system table used only by API routes
-- for email OTP during login. Supabase auto-enables RLS on new tables,
-- blocking all operations. Fix with both disable + permissive policies.

-- Disable RLS entirely
ALTER TABLE "login_verifications" DISABLE ROW LEVEL SECURITY;

-- Belt-and-suspenders: add permissive policies in case RLS gets re-enabled
-- (Supabase dashboard can auto-enable RLS on schema changes)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'login_verifications' AND policyname = 'server_all_login_verifications'
  ) THEN
    EXECUTE 'CREATE POLICY "server_all_login_verifications" ON "login_verifications" FOR ALL USING (true) WITH CHECK (true)';
  END IF;
END $$;
