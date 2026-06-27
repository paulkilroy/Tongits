import { getClient, onlineConfigured } from "./client";

// Anonymous accounts: on first use we silently sign the device in, then ensure a
// `profiles` row (name, avatar, balance, friend_code). The profile is the source
// of truth for the wallet and (later) friends. No email/password required; a
// player can optionally link an email later to keep the account across devices.

export interface Account {
  id: string;
  name: string;
  avatar: string;
  balance: number;
  friendCode: string;
}

const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
function randomCode(n = 6): string {
  let s = "";
  for (let i = 0; i < n; i++) s += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  return s;
}

type ProfileRow = {
  id: string;
  name: string;
  avatar: string;
  balance: number;
  friend_code: string;
};

const toAccount = (r: ProfileRow): Account => ({
  id: r.id,
  name: r.name,
  avatar: r.avatar,
  balance: r.balance,
  friendCode: r.friend_code,
});

/** Ensure an anonymous session + a profile row, returning the account (or null
 *  if online isn't configured / anonymous auth isn't enabled yet). */
export async function ensureAccount(defaults: { name: string; avatar: string }): Promise<Account | null> {
  if (!onlineConfigured) return null;
  const sb = getClient();

  let { data: sessionData } = await sb.auth.getSession();
  if (!sessionData.session) {
    const { data, error } = await sb.auth.signInAnonymously();
    if (error || !data.session) {
      console.error("anonymous sign-in failed (is it enabled in Supabase?)", error);
      return null;
    }
    sessionData = { session: data.session };
  }
  const uid = sessionData.session!.user.id;

  const existing = await sb.from("profiles").select("*").eq("id", uid).maybeSingle();
  if (existing.data) return toAccount(existing.data as ProfileRow);

  // Create a fresh profile, retrying if the random friend code collides.
  for (let attempt = 0; attempt < 4; attempt++) {
    const { data, error } = await sb
      .from("profiles")
      .insert({ id: uid, name: defaults.name || "Player", avatar: defaults.avatar, friend_code: randomCode() })
      .select()
      .single();
    if (!error && data) return toAccount(data as ProfileRow);
    if (error && !/duplicate|unique/i.test(error.message)) {
      console.error("create profile failed", error);
      return null;
    }
  }
  return null;
}

export async function updateAccount(patch: Partial<Pick<Account, "name" | "avatar">>): Promise<void> {
  if (!onlineConfigured) return;
  const sb = getClient();
  const { data } = await sb.auth.getUser();
  if (!data.user) return;
  await sb.from("profiles").update(patch).eq("id", data.user.id);
}

/** Atomically add to the signed-in user's balance (server-side). Returns the new balance. */
export async function addBalance(delta: number): Promise<number | null> {
  if (!onlineConfigured || delta === 0) return null;
  const { data, error } = await getClient().rpc("add_balance", { delta });
  if (error) {
    console.error("add_balance failed", error);
    return null;
  }
  return data as number;
}

export async function fetchBalance(): Promise<number | null> {
  if (!onlineConfigured) return null;
  const sb = getClient();
  const { data } = await sb.auth.getUser();
  if (!data.user) return null;
  const row = await sb.from("profiles").select("balance").eq("id", data.user.id).maybeSingle();
  return (row.data?.balance as number | undefined) ?? null;
}
