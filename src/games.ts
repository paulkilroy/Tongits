// The game registry for this multi-game app. Adding a game (backgammon, zilch…)
// means adding a kind here + its module; the shared shell (game picker, friends
// hub, cross-game challenges) is driven off this metadata.

export type GameKind = "tongits" | "cribbage" | "pressyourluck" | "battleship" | "backgammon" | "sixtyfive" | "gin";

export interface GameMeta {
  kind: GameKind;
  name: string;
  emoji: string;
  desc: string;
  /** Has online multiplayer (drives the friend-invite buttons). */
  online: boolean;
}

export const GAMES: Record<GameKind, GameMeta> = {
  tongits: {
    kind: "tongits",
    name: "Tongits",
    emoji: "🀄",
    desc: "2–3 player rummy · online + AI + coach",
    online: true,
  },
  cribbage: {
    kind: "cribbage",
    name: "Cribbage",
    emoji: "🎯",
    desc: "Peg to 121 · online + AI + discard coach",
    online: true,
  },
  pressyourluck: {
    kind: "pressyourluck",
    name: "Press Your Luck",
    emoji: "🎲",
    desc: "Push-your-luck dice · Farkle / Zilch · online + AI + coach",
    online: true,
  },
  battleship: {
    kind: "battleship",
    name: "Battleship",
    emoji: "🚢",
    desc: "Sink the fleet · online + AI",
    online: true,
  },
  backgammon: {
    kind: "backgammon",
    name: "Backgammon",
    emoji: "🎲",
    desc: "Race home & bear off · online + AI",
    online: true,
  },
  sixtyfive: {
    kind: "sixtyfive",
    name: "65",
    emoji: "🃏",
    desc: "Progressive rummy · wilds · online + AI + analyzer",
    online: true,
  },
  gin: {
    kind: "gin",
    name: "Gin",
    emoji: "🍸",
    desc: "7-card Gin Rummy · knock or gin · online + AI",
    online: true,
  },
};

export const GAME_LIST: GameMeta[] = Object.values(GAMES);
