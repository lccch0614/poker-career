import assert from "node:assert/strict";
import test from "node:test";
import { bestScore, buildSidePots, compareScore, completeBoard, scoreFive, type Card } from "../app/poker-engine";

const card = (rank: number, suit: Card["suit"]): Card => ({ rank, suit });

test("river all-in does not append the remaining deck", () => {
  const board = [card(13, "d"), card(6, "c"), card(13, "h"), card(13, "s"), card(12, "c")];
  const deck = [card(2, "s"), card(3, "s"), card(4, "s")];
  const completed = completeBoard(deck, board);
  assert.deepEqual(completed.board, board);
  assert.deepEqual(completed.deck, deck);
});

test("user screenshot: KKKQQ full house beats AI's KKKAQ trips", () => {
  const board = [card(13, "d"), card(6, "c"), card(13, "h"), card(13, "s"), card(12, "c")];
  const hero = [card(12, "h"), card(8, "d")];
  const villain = [card(14, "c"), card(4, "c")];
  const heroScore = bestScore([...hero, ...board]);
  const villainScore = bestScore([...villain, ...board]);
  assert.deepEqual(heroScore, [6, 13, 12]);
  assert.deepEqual(villainScore, [3, 13, 14, 12]);
  assert.ok(compareScore(heroScore, villainScore) > 0);
});

test("board completion adds only the missing community cards", () => {
  const board = [card(2, "h"), card(7, "d"), card(11, "c")];
  const deck = [card(3, "s"), card(4, "s"), card(10, "h"), card(14, "h")];
  const completed = completeBoard(deck, board);
  assert.deepEqual(completed.board, [...board, card(10, "h"), card(14, "h")]);
  assert.deepEqual(completed.deck, [card(3, "s"), card(4, "s")]);
});

test("all nine hand categories rank in the correct order", () => {
  const hands: Card[][] = [
    [card(14,"s"), card(11,"h"), card(9,"d"), card(6,"c"), card(3,"s")],
    [card(14,"s"), card(14,"h"), card(9,"d"), card(6,"c"), card(3,"s")],
    [card(14,"s"), card(14,"h"), card(9,"d"), card(9,"c"), card(3,"s")],
    [card(14,"s"), card(14,"h"), card(14,"d"), card(6,"c"), card(3,"s")],
    [card(6,"s"), card(5,"h"), card(4,"d"), card(3,"c"), card(2,"s")],
    [card(14,"h"), card(11,"h"), card(9,"h"), card(6,"h"), card(3,"h")],
    [card(14,"s"), card(14,"h"), card(14,"d"), card(9,"c"), card(9,"s")],
    [card(14,"s"), card(14,"h"), card(14,"d"), card(14,"c"), card(3,"s")],
    [card(6,"h"), card(5,"h"), card(4,"h"), card(3,"h"), card(2,"h")],
  ];
  const scores = hands.map(scoreFive);
  scores.forEach((score, category) => assert.equal(score[0], category));
  for (let i = 1; i < scores.length; i++) assert.ok(compareScore(scores[i], scores[i - 1]) > 0);
});

test("multiway all-ins create the correct main pot and side pots", () => {
  const pots = buildSidePots([100, 100, 50, 20], [false, false, false, false]);
  assert.deepEqual(pots.map(pot => pot.amount), [80, 90, 100]);
  assert.deepEqual(pots.map(pot => pot.eligible), [[0, 1, 2, 3], [0, 1, 2], [0, 1]]);
  assert.equal(pots.reduce((sum, pot) => sum + pot.amount, 0), 270);
});

test("folded players fund pots but cannot win them", () => {
  const pots = buildSidePots([100, 100, 50], [true, false, false]);
  assert.deepEqual(pots.map(pot => pot.amount), [150, 100]);
  assert.deepEqual(pots.map(pot => pot.eligible), [[1, 2], [1]]);
});
