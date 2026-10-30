import assert from "node:assert/strict";
import test from "node:test";
import { getPreflopAdvice, getTablePosition, handCode, positionOpenPercent, type TablePosition } from "../app/preflop-strategy";
import type { Card } from "../app/poker-engine";

const card = (rank: number, suit: Card["suit"]): Card => ({ rank, suit });

test("full eight-max table assigns every standard position", () => {
  const positions = Array.from({ length: 8 }, (_, actor) => getTablePosition(Array(8).fill(true), 0, actor));
  assert.deepEqual(positions, ["BTN", "SB", "BB", "UTG", "UTG+1", "MP", "HJ", "CO"]);
});

test("two-to-seven player tables assign the correct live positions", () => {
  const expected: Record<number, TablePosition[]> = {
    2: ["SB", "BB"],
    3: ["BTN", "SB", "BB"],
    4: ["BTN", "SB", "BB", "CO"],
    5: ["BTN", "SB", "BB", "UTG", "CO"],
    6: ["BTN", "SB", "BB", "UTG", "HJ", "CO"],
    7: ["BTN", "SB", "BB", "UTG", "MP", "HJ", "CO"],
  };
  for (const [size, positions] of Object.entries(expected)) {
    const active = Array(Number(size)).fill(true);
    assert.deepEqual(active.map((_, actor) => getTablePosition(active, 0, actor)), positions);
  }
});

test("heads-up uses a wider button and big-blind strategy", () => {
  assert.equal(positionOpenPercent("SB", 2), 78);
  assert.equal(positionOpenPercent("BB", 2), 70);
  assert.equal(getPreflopAdvice([card(14, "s"), card(2, "h")], "SB", 0, 0.5, 0, 2).action, "raise");
});

test("late position opens wider than early position", () => {
  const hand = [card(9, "s"), card(7, "s")];
  assert.equal(getPreflopAdvice(hand, "UTG", 0, 1).action, "fold");
  assert.equal(getPreflopAdvice(hand, "BTN", 0, 1).action, "raise");
});

test("premium hand moves from open to 3-bet and 4-bet", () => {
  const aces = [card(14, "s"), card(14, "h")];
  const actions = [0, 1, 2].map(raises => getPreflopAdvice(aces, "HJ", raises, 2).action);
  assert.deepEqual(actions, ["raise", "threeBet", "fourBet"]);
});

test("hand notation identifies pairs, suited and offsuit hands", () => {
  assert.equal(handCode([card(13, "s"), card(13, "h")]), "KK");
  assert.equal(handCode([card(14, "s"), card(5, "s")]), "A5s");
  assert.equal(handCode([card(12, "h"), card(11, "c")]), "QJo");
});

test("all supported positions return an actionable recommendation", () => {
  const positions: TablePosition[] = ["UTG", "UTG+1", "MP", "HJ", "CO", "BTN", "SB", "BB"];
  for (const position of positions) assert.ok(getPreflopAdvice([card(14, "s"), card(10, "s")], position, 1, 2).label);
});
