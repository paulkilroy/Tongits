import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Shared Supabase client used by both the room sync (supabase.ts) and accounts
// (auth.ts). Once we sign in anonymously, every request carries that user's JWT
// (role `authenticated`, with is_anonymous = true), so RLS policies must allow
// the `authenticated` role — see SETUP-ONLINE.md.

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** True when Supabase env vars are present (online play is configured). */
export const onlineConfigured = Boolean(url && anonKey);

let client: SupabaseClient | null = null;

export function getClient(): SupabaseClient {
  if (!client) {
    if (!onlineConfigured) throw new Error("Supabase is not configured");
    client = createClient(url!, anonKey!, {
      realtime: { params: { eventsPerSecond: 5 } },
      auth: { persistSession: true, autoRefreshToken: true },
    });
    // Keep the Realtime socket authenticated across token refreshes, so RLS-gated
    // subscriptions keep flowing after the session token rotates (~hourly).
    client.auth.onAuthStateChange((_event, session) => {
      if (session) client!.realtime.setAuth(session.access_token);
    });
  }
  return client;
}
