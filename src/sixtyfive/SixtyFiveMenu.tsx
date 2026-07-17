import { GameMenu } from "../ui/GameMenu";

/** "65" entry: play the bots, host an online game, or join by code. */
export function SixtyFiveMenu({
  onLocal,
  onHost,
  onJoin,
  onExit,
  busy,
  error,
}: {
  onLocal: (players: number) => void;
  onHost: () => void;
  onJoin: (code: string) => void;
  onExit: () => void;
  busy: boolean;
  error: string | null;
}) {
  return (
    <GameMenu
      title="65"
      onExit={onExit}
      blurb='Progressive rummy — hands of 3 up to 13, joker + the hand-size rank wild. Make sets & runs, say “Pay Me!”, lowest score wins.'
      online={{ onHost, onJoin, busy, error, hostLabel: "Host a game (2–6 players)" }}
    >
      <button className="big play-primary" onClick={() => onLocal(2)}>
        Play vs AI
      </button>
      <button className="big" onClick={() => onLocal(3)}>
        Play vs 2 AI
      </button>
    </GameMenu>
  );
}
