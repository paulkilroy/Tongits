import { GameMenu } from "../ui/GameMenu";

/** Battleship entry: play the bot, host an online game, or join by code. */
export function BattleshipMenu({
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
      title="Battleship"
      variant="battleship"
      onExit={onExit}
      online={{ onHost, onJoin, busy, error, hint: "Host, share the code; your friend taps Join. Place your fleets, then fire away." }}
    >
      <button className="big play-primary" onClick={onLocal}>
        Play vs AI
      </button>
    </GameMenu>
  );
}
