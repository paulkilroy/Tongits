import { type ReactNode } from "react";

// Shared line-art icon set (used across the game shell and both games).
export type IconName = "card" | "cribbage" | "hearts" | "dice" | "gear" | "chart" | "people" | "back" | "ship";

export function Icon({ name, size = 22 }: { name: IconName; size?: number }) {
  const svg = (children: ReactNode) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
  switch (name) {
    case "card":
      return svg(
        <>
          <rect x="3" y="6" width="11" height="15" rx="2" transform="rotate(-9 8.5 13.5)" />
          <rect x="10" y="3" width="11" height="15" rx="2" transform="rotate(8 15.5 10.5)" />
        </>,
      );
    case "hearts":
      // Two hearts (a couple) — the LDR mark.
      return svg(
        <>
          <path
            transform="translate(1 4) rotate(-9 5 5)"
            d="M5 9 C5 9 1 6 1 3.4 A2.2 2.2 0 0 1 5 2.5 A2.2 2.2 0 0 1 9 3.4 C9 6 5 9 5 9 Z"
          />
          <path
            transform="translate(10 6) rotate(9 5 5)"
            d="M5 9 C5 9 1 6 1 3.4 A2.2 2.2 0 0 1 5 2.5 A2.2 2.2 0 0 1 9 3.4 C9 6 5 9 5 9 Z"
          />
        </>,
      );
    case "cribbage":
      // A cribbage board: rounded track with two rows of peg holes.
      return svg(
        <>
          <rect x="2.5" y="5" width="19" height="14" rx="3.5" />
          {[8, 11.5, 15, 18.5].map((cx) => (
            <g key={cx}>
              <circle cx={cx} cy="10" r="0.85" fill="currentColor" stroke="none" />
              <circle cx={cx} cy="14" r="0.85" fill="currentColor" stroke="none" />
            </g>
          ))}
        </>,
      );
    case "dice":
      // A die showing five pips.
      return svg(
        <>
          <rect x="3" y="3" width="18" height="18" rx="4" />
          {[
            [8, 8],
            [16, 8],
            [12, 12],
            [8, 16],
            [16, 16],
          ].map(([cx, cy]) => (
            <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="1.5" fill="currentColor" stroke="none" />
          ))}
        </>,
      );
    case "ship":
      // A little boat on a wave.
      return svg(
        <>
          <path d="M3 15h18l-2.2 4.2a2 2 0 0 1-1.8 1.1H7a2 2 0 0 1-1.8-1.1L3 15z" />
          <path d="M6 15V8l6-2 6 2v7" />
          <path d="M12 6V3" />
        </>,
      );
    case "gear":
      return svg(
        <>
          <circle cx="12" cy="12" r="3.2" />
          <path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z" />
        </>,
      );
    case "chart":
      return svg(
        <>
          <line x1="6" y1="20" x2="6" y2="13" />
          <line x1="12" y1="20" x2="12" y2="4" />
          <line x1="18" y1="20" x2="18" y2="9" />
        </>,
      );
    case "people":
      return svg(
        <>
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </>,
      );
    case "back":
      return svg(
        <>
          <line x1="19" y1="12" x2="5" y2="12" />
          <polyline points="12 19 5 12 12 5" />
        </>,
      );
  }
}

/** The standard screen back button, consistent across every page. */
export function BackButton({ onClick, label = "Back" }: { onClick: () => void; label?: string }) {
  return (
    <button className="back-btn" onClick={onClick} aria-label={label}>
      <Icon name="back" size={20} />
    </button>
  );
}
