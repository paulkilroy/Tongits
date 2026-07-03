import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { CribbageGame } from "./CribbageGame";

describe("cribbage UI smoke", () => {
  it("renders the initial board without throwing", () => {
    const html = renderToString(createElement(CribbageGame, { onExit: () => {} }));
    expect(html).toContain("Cribbage");
    expect(html).toContain("crib");
  });
});
