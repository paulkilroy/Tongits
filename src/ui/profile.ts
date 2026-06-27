// The player's name + avatar, persisted on the device so they don't re-enter it
// each visit. (localStorage — the durable web equivalent of a cookie for this.)

export interface Profile {
  name: string;
  avatar: string;
}

export const AVATARS = [
  "🐱", "🐶", "🦊", "🐼", "🦁", "🐵", "🐸", "🐙", "🦄", "🐧", "🐯", "🐢", "🐨", "🐰", "🦉", "🐲",
];

const KEY = "tongits.profile";

export function loadProfile(): Profile {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<Profile>;
      return { name: p.name ?? "", avatar: p.avatar ?? AVATARS[0] };
    }
  } catch {
    /* storage unavailable or corrupt — fall through to default */
  }
  return { name: "", avatar: AVATARS[0] };
}

export function saveProfile(p: Profile): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* ignore — private mode etc. */
  }
}
