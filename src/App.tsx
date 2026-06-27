import { useMemo } from "react";
import { shuffledDeck } from "./engine/deck";
import { cardLabel, cardId, type Card } from "./engine/cards";

// Placeholder screen — proves the engine renders in the browser. The real game
// table (hand, draw/discard, melds, AI opponent) replaces this in the next step.
export function App() {
  const sample = useMemo<Card[]>(() => shuffledDeck(42).slice(0, 12), []);

  return (
    <main className="app">
      <h1>Tongits</h1>
      <p className="tagline">A sample 12-card hand, dealt from a seeded shuffle.</p>
      <div className="hand">
        {sample.map((c) => (
          <span
            key={cardId(c)}
            className={`card ${c.suit === "hearts" || c.suit === "diamonds" ? "red" : "black"}`}
          >
            {cardLabel(c)}
          </span>
        ))}
      </div>
    </main>
  );
}
