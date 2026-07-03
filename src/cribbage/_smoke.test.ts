import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { CribbageMenu } from "./CribbageMenu";
import { CribbageGame } from "./CribbageGame";

describe("cribbage UI smoke", () => {
  it("renders the cribbage menu without throwing", () => {
    const html = renderToString(
      createElement(CribbageMenu, {
        onLocal: () => {},
        onHost: () => {},
        onJoin: () => {},
        onExit: () => {},
        busy: false,
        error: null,
      }),
    );
    expect(html).toContain("Cribbage");
    expect(html).toContain("Play vs AI");
  });

  it("renders the local board (discard phase) without throwing", () => {
    const html = renderToString(createElement(CribbageGame, { onExit: () => {} }));
    expect(html).toContain("crib");
  });
});
