import { GameMenu } from "../ui/GameMenu";

/** Cribbage entry menu: play the bot, host an online game, or join by code. */
export function CribbageMenu({
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
      title="Cribbage"
      variant="cribbage"
      onExit={onExit}
      online={{ onHost, onJoin, busy, error, hostLabel: "Host a game (2–3 players)", hint: "Host, share the code with Ella; she taps Join." }}
    >
      <button className="big play-primary" onClick={() => onLocal(2)}>
        Play vs AI
      </button>
      <button className="big" onClick={() => onLocal(3)}>
        Play vs 2 AI (3-hand)
      </button>
    </GameMenu>
  );
}
