import { getClient } from "./client";

// Friends + challenges. Friendships are directed rows (requester → addressee)
// that flip to 'accepted'. A challenge points a friend at a room the challenger
// is already hosting; the challengee accepts and joins that room.

export interface MiniProfile {
  id: string;
  name: string;
  avatar: string;
  friendCode: string;
}

export interface Friendship {
  id: string;
  requester: string;
  addressee: string;
  status: "pending" | "accepted";
}

export interface Challenge {
  id: string;
  from_id: string;
  to_id: string;
  room_code: string;
  status: "pending" | "accepted" | "declined" | "cancelled";
}

async function myId(): Promise<string | null> {
  const { data } = await getClient().auth.getUser();
  return data.user?.id ?? null;
}

const toMini = (r: { id: string; name: string; avatar: string; friend_code: string }): MiniProfile => ({
  id: r.id,
  name: r.name,
  avatar: r.avatar,
  friendCode: r.friend_code,
});

/** Look up a player by their friend code (case-insensitive). */
export async function findByCode(code: string): Promise<MiniProfile | null> {
  const { data } = await getClient()
    .from("profiles")
    .select("id,name,avatar,friend_code")
    .eq("friend_code", code.trim().toUpperCase())
    .maybeSingle();
  return data ? toMini(data) : null;
}

/** Send a friend request to a player id. If they already requested you, accept it. */
export async function addFriend(addressee: string): Promise<"sent" | "accepted" | "exists" | "self"> {
  const sb = getClient();
  const me = await myId();
  if (!me || me === addressee) return "self";

  // Already a friendship either direction?
  const { data: existing } = await sb
    .from("friendships")
    .select("*")
    .or(
      `and(requester.eq.${me},addressee.eq.${addressee}),and(requester.eq.${addressee},addressee.eq.${me})`,
    );
  const row = (existing ?? [])[0] as Friendship | undefined;
  if (row) {
    if (row.status === "accepted") return "exists";
    if (row.addressee === me) {
      await sb.from("friendships").update({ status: "accepted" }).eq("id", row.id);
      return "accepted";
    }
    return "exists"; // we already sent it, still pending
  }
  await sb.from("friendships").insert({ requester: me, addressee, status: "pending" });
  return "sent";
}

export async function acceptFriend(friendshipId: string): Promise<void> {
  await getClient().from("friendships").update({ status: "accepted" }).eq("id", friendshipId);
}

export async function removeFriend(friendshipId: string): Promise<void> {
  await getClient().from("friendships").delete().eq("id", friendshipId);
}

export interface FriendsData {
  friends: { friendship: Friendship; profile: MiniProfile }[];
  incoming: { friendship: Friendship; profile: MiniProfile }[]; // requests awaiting my accept
}

/** Load accepted friends and incoming pending requests, with their profiles. */
export async function loadFriends(): Promise<FriendsData> {
  const sb = getClient();
  const me = await myId();
  if (!me) return { friends: [], incoming: [] };

  const { data: rows } = await sb
    .from("friendships")
    .select("*")
    .or(`requester.eq.${me},addressee.eq.${me}`);
  const ships = (rows ?? []) as Friendship[];

  const otherId = (f: Friendship) => (f.requester === me ? f.addressee : f.requester);
  const ids = [...new Set(ships.map(otherId))];
  const profiles = ids.length
    ? (((await sb.from("profiles").select("id,name,avatar,friend_code").in("id", ids)).data ?? []) as {
        id: string;
        name: string;
        avatar: string;
        friend_code: string;
      }[])
    : [];
  const byId = new Map(profiles.map((p) => [p.id, toMini(p)]));

  const friends = ships
    .filter((f) => f.status === "accepted")
    .map((f) => ({ friendship: f, profile: byId.get(otherId(f))! }))
    .filter((x) => x.profile);
  const incoming = ships
    .filter((f) => f.status === "pending" && f.addressee === me)
    .map((f) => ({ friendship: f, profile: byId.get(otherId(f))! }))
    .filter((x) => x.profile);
  return { friends, incoming };
}

// --- challenges --------------------------------------------------------------

export async function createChallenge(toId: string, roomCode: string): Promise<void> {
  const me = await myId();
  if (!me) return;
  await getClient().from("challenges").insert({ from_id: me, to_id: toId, room_code: roomCode, status: "pending" });
}

export async function respondChallenge(id: string, status: "accepted" | "declined"): Promise<void> {
  await getClient().from("challenges").update({ status }).eq("id", id);
}

/** Subscribe to challenges addressed to me. Returns an unsubscribe function. */
export function subscribeChallenges(meId: string, onChallenge: (c: Challenge) => void): () => void {
  const ch = getClient()
    .channel(`challenges:${meId}`)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "challenges", filter: `to_id=eq.${meId}` },
      (payload) => onChallenge(payload.new as Challenge),
    )
    .subscribe();
  return () => {
    void getClient().removeChannel(ch);
  };
}
