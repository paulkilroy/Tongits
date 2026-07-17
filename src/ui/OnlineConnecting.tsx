import { BackButton } from "./Icon";

// The "connecting / waiting for the room" placeholder every online game shows before
// the first game state arrives. Was copy-pasted into all six online wrappers.

export function OnlineConnecting({
  title,
  code,
  connected,
  onExit,
  variant = "sixtyfive",
}: {
  title: string;
  code: string;
  connected: boolean;
  onExit: () => void;
  variant?: string;
}) {
  return (
    <main className={`app screen ${variant}`.trim()}>
      <div className="screen-head">
        <BackButton onClick={onExit} />
        <h1>{title}</h1>
        <span />
      </div>
      <div className="screen-body">
        <p className="cr-instr">
          {connected ? "Waiting for the room…" : "Connecting…"}
          <br />
          <span className="cr-lbl">Share code: {code}</span>
        </p>
      </div>
    </main>
  );
}
