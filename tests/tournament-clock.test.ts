import test from "node:test";
import assert from "node:assert/strict";
import { extendDecisionClock, newDecisionClock, pauseDecisionClock, restoreDecisionClock, tickDecisionClock } from "../app/tournament-clock";

test("decision expires at 15 seconds without time-bank and can be paused", () => {
  const started = newDecisionClock("hand:1", 90_000, 1000);
  const paused = pauseDecisionClock(started, 6000);
  assert.equal(paused.remainingMs, 10_000);
  assert.equal(tickDecisionClock(paused, 30_000).remainingMs, 10_000);
  assert.equal(tickDecisionClock({ ...paused, runningAt: 30_000 }, 40_000).remainingMs, 0);
});

test("time-bank adds at most 15 seconds per action and only charges elapsed extension", () => {
  let clock = extendDecisionClock(newDecisionClock("hand:2", 20_000, 0), 5000);
  assert.equal(clock.remainingMs, 25_000);
  clock = tickDecisionClock(clock, 15_000);
  assert.equal(clock.bankMs, 20_000);
  clock = tickDecisionClock(clock, 20_000);
  assert.equal(clock.bankMs, 15_000);
  clock = tickDecisionClock(clock, 30_000);
  assert.equal(clock.remainingMs, 0);
  assert.equal(clock.bankMs, 5_000);
  assert.equal(extendDecisionClock(clock, 30_000).remainingMs, 0);
  const next = newDecisionClock("hand:3", clock.bankMs, 31_000);
  assert.equal(extendDecisionClock(next, 31_000).remainingMs, 20_000);
});

test("restored clock preserves remaining time and never counts closed-page time", () => {
  const saved = tickDecisionClock(extendDecisionClock(newDecisionClock("old:4", 90_000, 1000), 1000), 18_000);
  const restored = restoreDecisionClock(JSON.parse(JSON.stringify(saved)));
  assert.equal(restored?.runningAt, null);
  assert.equal(restored?.remainingMs, 13_000);
  assert.equal(tickDecisionClock(restored!, 900_000).remainingMs, 13_000);
  assert.equal(extendDecisionClock(restored!, 900_000).remainingMs, 13_000);
  assert.equal(restoreDecisionClock({ turnKey: "bad", bankMs: -Infinity }), null);
});
