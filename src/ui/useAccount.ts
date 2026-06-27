import { useCallback, useEffect, useState } from "react";
import { ensureAccount, updateAccount, fetchBalance, type Account } from "../online/auth";
import { loadProfile, saveProfile } from "./profile";

/**
 * Establishes the anonymous account on load (seeded from the locally-saved name
 * + avatar) and exposes it. Profile edits write through to the account row; the
 * local profile is kept as a cache + offline fallback for practice games.
 */
export function useAccount() {
  const [account, setAccount] = useState<Account | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const local = loadProfile();
    ensureAccount({ name: local.name, avatar: local.avatar })
      .then(setAccount)
      .finally(() => setReady(true));
  }, []);

  const update = useCallback(async (patch: Partial<Pick<Account, "name" | "avatar">>) => {
    setAccount((a) => (a ? { ...a, ...patch } : a));
    const local = loadProfile();
    saveProfile({ name: patch.name ?? local.name, avatar: patch.avatar ?? local.avatar });
    await updateAccount(patch);
  }, []);

  const refreshBalance = useCallback(async () => {
    const b = await fetchBalance();
    if (b != null) setAccount((a) => (a ? { ...a, balance: b } : a));
  }, []);

  const setBalance = useCallback((b: number) => {
    setAccount((a) => (a ? { ...a, balance: b } : a));
  }, []);

  return { account, ready, update, refreshBalance, setBalance };
}
