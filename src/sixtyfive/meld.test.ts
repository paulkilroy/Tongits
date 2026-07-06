import { describe, it, expect } from "vitest";
import { type RCard, type Rank, type Suit } from "./rules";
import { analyze, isValidMeld } from "./meld";

let n = 0;
const rc = (rank: RRankLike, suit: Suit | null): RCard => ({ id: `c${n++}`, rank: rank as Rank, suit });
type RRankLike = Rank | "JOKER";
const J = (): RCard => ({ id: `j${n++}`, rank: "JOKER", suit: null });

describe("65 hand analyzer", () => {
  it("finds a clean run and a clean set (no deadwood)", () => {
    const run = analyze([rc("4", "hearts"), rc("5", "hearts"), rc("6", "hearts")], null);
    expect(run.points).toBe(0);
    expect(run.melds).toHaveLength(1);

    const set = analyze([rc("7", "clubs"), rc("7", "diamonds"), rc("7", "spades")], null);
    expect(set.points).toBe(0);
  });

  it("uses a joker to complete a run", () => {
    const a = analyze([rc("4", "hearts"), J(), rc("6", "hearts")], null);
    expect(a.points).toBe(0);
    expect(a.deadwood).toHaveLength(0);
  });

  it("uses the round's wild rank as a wild", () => {
    // 3s are wild → 5♥,7♥ + a 3 fills the 6 for a 5-6-7 run.
    const a = analyze([rc("5", "hearts"), rc("7", "hearts"), rc("3", "clubs")], "3");
    expect(a.points).toBe(0);
  });

  it("scores leftover deadwood: 2–8 = 5, 9–K = 10, ace = 15", () => {
    const a = analyze([rc("4", "hearts"), rc("9", "spades"), rc("A", "diamonds")], null);
    expect(a.melds.flat()).toHaveLength(0);
    expect(a.points).toBe(5 + 10 + 15);
  });

  it("treats the ace as HIGH only (Q-K-A is a run; A-2-3 is not)", () => {
    const high = analyze([rc("Q", "spades"), rc("K", "spades"), rc("A", "spades")], null);
    expect(high.points).toBe(0);

    const low = analyze([rc("A", "spades"), rc("2", "spades"), rc("3", "spades")], null);
    expect(low.points).toBe(15 + 5 + 5); // ace can't sit below the 2
  });

  it("picks the partition that minimises points", () => {
    // 7♥ belongs to the run 7-8-9♥; the other three 7s form a clean set → nothing left.
    const a = analyze(
      [rc("7", "hearts"), rc("8", "hearts"), rc("9", "hearts"), rc("7", "clubs"), rc("7", "diamonds"), rc("7", "spades")],
      null,
    );
    expect(a.points).toBe(0);
    // But if the anchor 7 were needed by both, one pair is stranded:
    const b = analyze([rc("7", "hearts"), rc("8", "hearts"), rc("9", "hearts"), rc("7", "clubs"), rc("7", "spades")], null);
    expect(b.points).toBe(10); // keep the run, two lone 7s = 10
  });

  it("validates a single meld", () => {
    expect(isValidMeld([rc("4", "hearts"), rc("5", "hearts"), rc("6", "hearts")], null)).toBe(true);
    expect(isValidMeld([rc("4", "hearts"), J(), rc("6", "hearts")], null)).toBe(true);
    expect(isValidMeld([rc("4", "hearts"), rc("6", "hearts")], null)).toBe(false); // only 2
    expect(isValidMeld([rc("4", "hearts"), rc("9", "spades"), rc("K", "clubs")], null)).toBe(false);
  });
});
