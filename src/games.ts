// The game registry for this multi-game app. Adding a game (backgammon, zilch…)
// means adding a kind here + its module; the shared shell (game picker, friends
// hub, cross-game challenges) is driven off this metadata.

export type GameKind = "tongits" | "cribbage";

export interface GameMeta {
  kind: GameKind;
  name: string;
  emoji: string;
  desc: string;
}

export const GAMES: Record<GameKind, GameMeta> = {
  tongits: {
    kind: "tongits",
    name: "Tongits",
    emoji: "🀄",
    desc: "2–3 player rummy · online + AI + coach",
  },
  cribbage: {
    kind: "cribbage",
    name: "Cribbage",
    emoji: "🎯",
    desc: "Peg to 121 · online + AI + discard coach",
  },
};

export const GAME_LIST: GameMeta[] = Object.values(GAMES);
