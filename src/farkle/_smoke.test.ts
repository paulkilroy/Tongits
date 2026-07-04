import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { FarkleMenu } from "./FarkleMenu";
import { FarkleGame } from "./FarkleGame";
import { CLASSIC } from "./rules";

describe("farkle UI smoke", () => {
  it("renders the ruleset menu", () => {
    const html = renderToString(
      createElement(FarkleMenu, {
        name: "Press Your Luck",
        onLocal: () => {},
        onHost: () => {},
        onJoin: () => {},
        onExit: () => {},
        busy: false,
        error: null,
      }),
    );
    expect(html).toContain("Press Your Luck");
    expect(html).toContain("Play vs AI");
  });
  it("renders the game board", () => {
    const html = renderToString(createElement(FarkleGame, { rules: CLASSIC, name: "Press Your Luck", onExit: () => {} }));
    expect(html).toContain("this turn");
  });
});
