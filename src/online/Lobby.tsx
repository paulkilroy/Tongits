import { useState } from "react";
import { BackButton } from "../ui/Icon";

// A pre-game seat lobby shared by the multiplayer games. The host creates a room,
// friends claim seats (by invite or by entering the code), and the host starts
// once enough players are in. Seat assignment lives in each game's online hook;
// this is purely the presentation of "who's in and are we ready."

export interface LobbySeat {
  id: string;
  name: string;
  avatar?: string;
  isAI?: boolean;
}

export interface LobbyFriend {
  id: string;
  name: string;
  avatar: string;
  online: boolean;
}

export function Lobby({
  title,
  code,
  seats,
  meId,
  hostId,
  isHost,
  min,
  max,
  friends,
  onInvite,
  onStart,
  onAddBot,
  onExit,
}: {
  title: string;
  code: string;
  seats: LobbySeat[];
  meId: string;
  hostId: string;
  isHost: boolean;
  min: number;
  max: number;
  friends: LobbyFriend[];
  onInvite: (friendId: string) => void;
  onStart: () => void;
  onAddBot?: () => void;
  onExit: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [invited, setInvited] = useState<string[]>([]);
  const seatedIds = new Set(seats.map((s) => s.id));
  const canInviteMore = seats.length + invited.filter((id) => !seatedIds.has(id)).length < max;
  const invitable = friends.filter((f) => !seatedIds.has(f.id));

  const invite = (id: string) => {
    setInvited((p) => (p.includes(id) ? p : [...p, id]));
    onInvite(id);
  };

  return (
    <main className="app screen farkle">
      <div className="screen-head">
        <BackButton onClick={onExit} label="Leave" />
        <h1>{title}</h1>
        <span />
      </div>

      <div className="screen-body">
        <div className="panel lobby-code">
          <span className="of-label">Share this code</span>
          <div className="hub-code-row">
            <strong>{code}</strong>
            <button
              onClick={() => {
                void navigator.clipboard?.writeText(code);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
            >
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
        </div>

        <div className="panel">
          <div className="of-label">
            Players · {seats.length}/{max}
          </div>
          {seats.map((s) => (
            <div className="hub-friend" key={s.id}>
              <span className="lobby-avatar">{s.avatar ?? "🙂"}</span>
              <span className="hub-name">{s.name}</span>
              <span className="lobby-tags">
                {s.isAI && <span className="lobby-tag you">bot</span>}
                {s.id === hostId && <span className="lobby-tag host">host</span>}
                {s.id === meId && <span className="lobby-tag you">you</span>}
              </span>
            </div>
          ))}
          {isHost && onAddBot && seats.length < max && (
            <button className="hub-accept lobby-addbot" onClick={onAddBot}>
              + Add bot
            </button>
          )}
          {seats.length < min && <p className="cr-lbl">Need at least {min} players to start.</p>}
        </div>

        {isHost && invitable.length > 0 && (
          <div className="panel">
            <div className="of-label">Invite friends</div>
            {invitable.map((f) => (
              <div className="hub-friend" key={f.id}>
                <span className={`hub-dot ${f.online ? "on" : ""}`} />
                <span className="lobby-avatar">{f.avatar}</span>
                <span className="hub-name">{f.name}</span>
                <button
                  className="hub-accept"
                  disabled={!f.online || (!invited.includes(f.id) && !canInviteMore)}
                  onClick={() => invite(f.id)}
                >
                  {invited.includes(f.id) ? "Invited" : "Invite"}
                </button>
              </div>
            ))}
          </div>
        )}

        {isHost ? (
          <button className="big play-primary" disabled={seats.length < min} onClick={onStart}>
            {seats.length < min ? `Waiting for players (${seats.length}/${min})` : `Start game (${seats.length})`}
          </button>
        ) : (
          <p className="cr-lbl">Waiting for the host to start… ({seats.length} in)</p>
        )}
      </div>
    </main>
  );
}
