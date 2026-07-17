import { GameMenu } from "../ui/GameMenu";

/** Gin entry: play the bot, host an online game, or join by code. */
export function GinMenu({
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
      title="Gin"
      onExit={onExit}
      blurb="7-card Gin Rummy — make sets & runs, knock at ≤10 deadwood (or go Gin). First to 100."
      online={{ onHost, onJoin, busy, error }}
    >
      <button className="big play-primary" onClick={onLocal}>
        Play vs AI
      </button>
    </GameMenu>
  );
}
