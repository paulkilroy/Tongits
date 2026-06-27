import { useCallback, useEffect, useState } from "react";
import { getClient } from "../online/client";
import {
  loadFriends,
  subscribeChallenges,
  type FriendsData,
  type Challenge,
} from "../online/friends";
import { type Account } from "../online/auth";

/**
 * While mounted (i.e. while in the lobby) this:
 *  - tracks the player in a shared presence channel so friends see them "online",
 *  - loads their friends + incoming requests (refreshing live on changes), and
 *  - listens for incoming challenges.
 * Being "online" therefore means "in the lobby, available to play".
 */
export function useFriends(account: Account | null) {
  const [data, setData] = useState<FriendsData>({ friends: [], incoming: [] });
  const [online, setOnline] = useState<Set<string>>(new Set());
  const [challenge, setChallenge] = useState<Challenge | null>(null);

  const refresh = useCallback(() => {
    if (account) void loadFriends().then(setData);
  }, [account]);

  useEffect(() => {
    if (!account) return;
    refresh();
    const sb = getClient();

    // Presence — broadcast that I'm here; read who else is.
    const presence = sb.channel("presence:lobby", { config: { presence: { key: account.id } } });
    presence
      .on("presence", { event: "sync" }, () => {
        setOnline(new Set(Object.keys(presence.presenceState())));
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await presence.track({ id: account.id, name: account.name, avatar: account.avatar });
        }
      });

    // Live-refresh friends when a request/accept touches me.
    const friendsCh = sb
      .channel(`friendships:${account.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "friendships", filter: `addressee=eq.${account.id}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "friendships", filter: `requester=eq.${account.id}` }, refresh)
      .subscribe();

    const unsubChallenges = subscribeChallenges(account.id, setChallenge);

    return () => {
      void presence.unsubscribe();
      void sb.removeChannel(friendsCh);
      unsubChallenges();
    };
  }, [account, refresh]);

  const friends = data.friends.map((f) => ({ ...f, online: online.has(f.profile.id) }));

  return { friends, incoming: data.incoming, refresh, challenge, clearChallenge: () => setChallenge(null) };
}
