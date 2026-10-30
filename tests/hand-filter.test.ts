import test from "node:test";
import assert from "node:assert/strict";
import { ALL_HANDS, RANGE_POSITIONS, positionRangePresets, rangeCell, rangePercent, rangePreset, restoreHandFilter, shouldAutoFold, wasAutoFolded } from "../app/hand-filter";
import type { Card } from "../app/poker-engine";

function hole(high: number, low: number, suited = false): Card[] {
  return [{ rank: high, suit: "s" }, { rank: low, suit: suited ? "s" : "h" }];
}

test("169 unique hand classes cover pairs, suited and offsuit", () => {
  assert.equal(new Set(ALL_HANDS).size, 169);
  assert.equal(rangeCell(0, 0), "AA");
  assert.equal(rangeCell(0, 1), "AKs");
  assert.equal(rangeCell(1, 0), "AKo");
  assert.equal(rangePercent(ALL_HANDS), 100);
});

test("presets expand by hand strength and count actual combinations", () => {
  const tight = rangePreset(10);
  const medium = rangePreset(25);
  const wide = rangePreset(40);
  assert.ok(tight.includes("AA"));
  assert.ok(tight.every(code => medium.includes(code)));
  assert.ok(medium.every(code => wide.includes(code)));
  assert.ok(Math.abs(rangePercent(tight) - 10) <= 0.5);
  assert.ok(Math.abs(rangePercent(medium) - 25) <= 0.5);
});

test("filter distinguishes suited and offsuit, and stays off by default", () => {
  const filter = restoreHandFilter({ enabled: true, hands: ["AA", "AKs"] });
  assert.equal(shouldAutoFold(hole(14, 13, true), filter), false);
  assert.equal(shouldAutoFold(hole(14, 13), filter), true);
  assert.equal(shouldAutoFold(hole(14, 14), filter), false);
  assert.equal(shouldAutoFold(hole(7, 2), { ...filter, enabled: false }), false);
});

test("older saves default to off and malformed saves cannot enable an empty range", () => {
  assert.equal(restoreHandFilter(undefined).enabled, false);
  const restored = restoreHandFilter({ enabled: true, hands: ["AA", "AA", "bogus"] });
  assert.equal(restored.enabled, true);
  assert.equal(restored.scope, "global");
  assert.deepEqual(restored.hands, ["AA"]);
  assert.ok(RANGE_POSITIONS.every(position => restored.positionHands[position].includes("AA")));
  assert.equal(restoreHandFilter({ enabled: true, hands: [] }).enabled, false);
});

test("position mode uses the active seat range and preserves independent edits", () => {
  const base = restoreHandFilter({ enabled: true, hands: ["AA"] });
  const filter = {
    ...base,
    scope: "position" as const,
    positionHands: { ...base.positionHands, UTG: ["AA"], BTN: [...ALL_HANDS] },
  };
  assert.equal(shouldAutoFold(hole(14, 13), filter, "UTG"), true);
  assert.equal(shouldAutoFold(hole(14, 13), filter, "BTN"), false);
  assert.equal(shouldAutoFold(hole(14, 14), filter, "UTG"), false);
});

test("recommended positional presets are tighter early and wider late", () => {
  const ranges = positionRangePresets(8);
  assert.ok(rangePercent(ranges.UTG) < rangePercent(ranges.BTN));
  assert.ok(rangePercent(ranges.HJ) < rangePercent(ranges.CO));
  assert.equal(Object.keys(ranges).length, 8);
});

test("only a recorded range auto-fold qualifies for automatic next hand", () => {
  assert.equal(wasAutoFolded([{ actor: 0, street: "preflop", action: "你 按起手牌範圍自動棄牌" }]), true);
  assert.equal(wasAutoFolded([{ actor: 0, street: "preflop", action: "你 棄牌" }]), false);
  assert.equal(wasAutoFolded([{ actor: 2, street: "preflop", action: "AI 2 棄牌" }]), false);
});
