import { useEffect, useRef } from "react";

// Alert a player when it becomes their turn while they're looking at another tab
// or app. Uses a Web Audio beep (no permission needed) plus a flashing tab title,
// and a system notification too if the user has already granted them. Nothing
// fires while the window is focused — you're already watching.

let audioCtx: AudioContext | null = null;

function ensureAudio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!audioCtx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (AC) audioCtx = new AC();
  }
  if (audioCtx?.state === "suspended") void audioCtx.resume();
  return audioCtx;
}

// Browsers only let audio start after a user gesture; unlock on the first one.
if (typeof window !== "undefined") {
  const unlock = () => {
    ensureAudio();
    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("keydown", unlock);
  };
  window.addEventListener("pointerdown", unlock);
  window.addEventListener("keydown", unlock);
}

function beep(): void {
  const ctx = ensureAudio();
  if (!ctx) return;
  const now = ctx.currentTime;
  // Two quick tones so it reads as a chime, not a system error.
  [880, 1180].forEach((freq, i) => {
    const t = now + i * 0.18;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.22, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.32);
  });
}

/** Buzz the phone, if it supports it and hasn't muted vibration. */
function vibrate(pattern: number | number[]): void {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* not supported — ignore */
  }
}

/** Flash the tab title (and fire a system notification, if permitted). Returns a
 *  stop() that restores the title and detaches its focus/visibility listeners. */
function flashTitle(message: string): () => void {
  if (typeof Notification !== "undefined" && Notification.permission === "granted") {
    try {
      new Notification(message);
    } catch {
      /* some browsers only allow notifications from a service worker — ignore */
    }
  }
  const original = document.title;
  let on = false;
  const flash = window.setInterval(() => {
    document.title = on ? original : `🎲 ${message}`;
    on = !on;
  }, 1000);
  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    window.clearInterval(flash);
    document.title = original;
    window.removeEventListener("focus", stop);
    document.removeEventListener("visibilitychange", onVis);
  };
  const onVis = () => {
    if (!document.hidden) stop();
  };
  window.addEventListener("focus", stop);
  document.addEventListener("visibilitychange", onVis);
  return stop;
}

const REMIND_AFTER_MS = 10_000;

/** Nudge a player when it's their move. Two triggers, each fires once per turn:
 *  1. The turn arrives while the window is unfocused → beep + buzz + flashing title.
 *  2. The turn has been sitting for >10s (you're taking a while) → beep + buzz.
 *  `myTurn` is a level; alerts fire on its rising edge. */
export function useTurnAlert(myTurn: boolean, message: string, remindAfterMs = REMIND_AFTER_MS): void {
  const prev = useRef(myTurn);
  const turnRef = useRef(myTurn);
  turnRef.current = myTurn;
  useEffect(() => {
    const became = myTurn && !prev.current;
    prev.current = myTurn;
    if (!became) return;

    const cleanups: (() => void)[] = [];

    // 1) It became your turn while you're looking elsewhere.
    if (typeof document !== "undefined" && !document.hasFocus()) {
      beep();
      vibrate([120, 60, 120]);
      cleanups.push(flashTitle(message));
    }

    // 2) Still your move after the reminder window — a gentle "your turn" buzz,
    //    whether or not the window is focused. Cancelled if you act (myTurn falls)
    //    or the component unmounts before it fires.
    const timer = window.setTimeout(() => {
      if (turnRef.current) {
        beep();
        vibrate(200);
      }
    }, remindAfterMs);
    cleanups.push(() => window.clearTimeout(timer));

    return () => cleanups.forEach((c) => c());
  }, [myTurn, message, remindAfterMs]);
}

/** Ask for system-notification permission (best-effort; call from a user gesture). */
export function requestTurnNotifications(): void {
  if (typeof Notification === "undefined") return;
  if (Notification.permission === "default") void Notification.requestPermission().catch(() => {});
}
