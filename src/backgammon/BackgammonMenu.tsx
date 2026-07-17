import { GameMenu } from "../ui/GameMenu";

/** Backgammon entry: play the bot, host an online game, or join by code. */
export function BackgammonMenu({
  onLocal,
  onHost,
  onJoin,
  onExit,
  busy,
  error,
}: {
  onLocal: () => void;
  onHost: () => void;
  onJoin: (code: string) => void;
  onExit: () => void;
  busy: boolean;
  error: string | null;
}) {
  return (
    <GameMenu
      title="Backgammon"
      variant="backgammon"
      onExit={onExit}
      online={{ onHost, onJoin, busy, error, hint: "Host, share the code; your friend taps Join." }}
    >
      <button className="big play-primary" onClick={onLocal}>
        Play vs AI
      </button>
    </GameMenu>
  );
}
