import { STANDARD_RULES, type RuleSet } from "../engine/rules";

// House rules chosen in the settings screen, persisted on the device. Merged
// over STANDARD_RULES so older saves pick up any newly-added fields.

const KEY = "tongits.rules";

export function loadRules(): RuleSet {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...STANDARD_RULES, ...(JSON.parse(raw) as Partial<RuleSet>) };
  } catch {
    /* ignore */
  }
  return { ...STANDARD_RULES };
}

export function saveRules(r: RuleSet): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(r));
  } catch {
    /* ignore */
  }
}
