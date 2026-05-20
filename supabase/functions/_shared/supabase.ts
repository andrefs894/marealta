// Service-role Supabase client for Edge Functions.
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are auto-injected by the platform —
// no secret config needed.
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

export function createServiceRoleClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment");
  }
  return createClient(url, key, { auth: { persistSession: false } });
}
