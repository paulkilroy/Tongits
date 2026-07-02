import { describe, it, expect } from "vitest";
import { card } from "../engine/cards";
import { scoreShow, scorePlay, playTotal } from "./scoring";

const C = card;

describe("cribbage — the show", () => {
  it("scores the perfect 29 hand", () => {
    // Three 5s + the matching-suit Jack, starter is the fourth 5.
    const hand = [C("5", "clubs"), C("5", "diamonds"), C("5", "hearts"), C("J", "spades")];
    const starter = C("5", "spades");
    const s = scoreShow(hand, starter);
    expect(s.fifteens).toBe(16); // four {5,J} + four {5,5,5}
    expect(s.pairs).toBe(12); // four 5s
    expect(s.nobs).toBe(1); // J♠ matches starter ♠
    expect(s.total).toBe(29);
  });

  it("scores a plain nothing hand as 0", () => {
    const hand = [C("A", "clubs"), C("3", "diamonds"), C("7", "hearts"), C("10", "spades")];
    const starter = C("K", "clubs");
    expect(scoreShow(hand, starter).total).toBe(0);
  });

  it("scores a double run with fifteens", () => {
    // 4 5 5 6 + J(10): runs 4-5-6 twice = 6, pair of 5s = 2,
    // fifteens {4,5,6}×2 + {5,J}×2 = 8. total 16.
    const hand = [C("4", "clubs"), C("5", "diamonds"), C("5", "hearts"), C("6", "spades")];
    const starter = C("J", "clubs");
    const s = scoreShow(hand, starter);
    expect(s.runs).toBe(6);
    expect(s.pairs).toBe(2);
    expect(s.fifteens).toBe(8);
    expect(s.total).toBe(16);
  });

  it("counts a four-card flush only outside the crib", () => {
    const hand = [C("2", "hearts"), C("4", "hearts"), C("6", "hearts"), C("8", "hearts")];
    const starterOff = C("K", "spades");
    expect(scoreShow(hand, starterOff, false).flush).toBe(4);
    expect(scoreShow(hand, starterOff, true).flush).toBe(0); // crib needs all five
    const starterOn = C("K", "hearts");
    expect(scoreShow(hand, starterOn, true).flush).toBe(5); // five-card flush counts in crib
  });

  it("scores nobs only for a Jack matching the starter's suit", () => {
    const hand = [C("J", "hearts"), C("2", "clubs"), C("4", "diamonds"), C("8", "spades")];
    expect(scoreShow(hand, C("6", "hearts")).nobs).toBe(1);
    expect(scoreShow(hand, C("6", "spades")).nobs).toBe(0);
  });
});

describe("cribbage — the play (pegging)", () => {
  const seqTotal = (cs: ReturnType<typeof C>[]) => scorePlay(cs, playTotal(cs));

  it("scores fifteen and thirty-one", () => {
    expect(seqTotal([C("7", "clubs"), C("8", "diamonds")])).toBe(2); // total 15
    expect(seqTotal([C("8", "clubs"), C("7", "diamonds"), C("K", "hearts"), C("6", "spades")])).toBe(2); // total 31 (8+7+10+6)
  });

  it("scores pairs, pair royal and double pair royal", () => {
    expect(seqTotal([C("5", "clubs"), C("5", "diamonds")])).toBe(2);
    expect(seqTotal([C("5", "clubs"), C("5", "diamonds"), C("5", "hearts")])).toBe(6 + 2); // trips + fifteen(15)
    expect(seqTotal([C("2", "clubs"), C("2", "diamonds"), C("2", "hearts"), C("2", "spades")])).toBe(12);
  });

  it("scores a run only from the most-recent consecutive distinct cards", () => {
    expect(seqTotal([C("4", "clubs"), C("6", "diamonds"), C("5", "hearts")])).toBe(3 + 2); // run 4-5-6 + fifteen
    expect(seqTotal([C("8", "clubs"), C("4", "diamonds"), C("6", "hearts"), C("5", "spades")])).toBe(3); // 4-6-5 run, 8 breaks longer
    expect(seqTotal([C("3", "clubs"), C("4", "diamonds"), C("5", "hearts"), C("5", "spades")])).toBe(2); // trailing 5-5 pair, no run
  });
});
