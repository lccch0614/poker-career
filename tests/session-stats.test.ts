import assert from "node:assert/strict";
import test from "node:test";
import { emptyHandTracker, emptySessionStats, settlePlayerSession, statPercent, trackPreflopAction } from "../app/session-stats";

test("limp counts as VPIP but not PFR", () => {
  const tracked = trackPreflopAction(emptyHandTracker(), "checkcall", 1, 0);
  assert.equal(tracked.vpip, true);
  assert.equal(tracked.pfr, false);
  assert.equal(tracked.threeBet, false);
});

test("big blind check is not voluntary money", () => {
  const tracked = trackPreflopAction(emptyHandTracker(), "checkcall", 0, 0);
  assert.equal(tracked.vpip, false);
});

test("raise facing an open records a three-bet and opportunity", () => {
  const tracked = trackPreflopAction(emptyHandTracker(), "raise", 2.5, 1);
  assert.deepEqual(tracked, { vpip: true, pfr: true, threeBet: true, threeBetOpportunity: true, sawFlop: false });
});

test("fold facing an open records only a three-bet opportunity", () => {
  const tracked = trackPreflopAction(emptyHandTracker(), "fold", 2.5, 1);
  assert.deepEqual(tracked, { vpip: false, pfr: false, threeBet: false, threeBetOpportunity: true, sawFlop: false });
});

test("settlement records profit, flop and showdown once", () => {
  const tracker = trackPreflopAction(emptyHandTracker(), "raise", 1, 0);
  const stats = settlePlayerSession(emptySessionStats(), tracker, {
    active: true, startStack: 100, endStack: 112.5, sawFlop: true, sawShowdown: true, wonShowdown: true,
  });
  assert.equal(stats.hands, 1);
  assert.equal(stats.profit, 12.5);
  assert.equal(stats.vpipHands, 1);
  assert.equal(stats.pfrHands, 1);
  assert.equal(stats.sawFlopHands, 1);
  assert.equal(stats.showdownWins, 1);
  assert.equal(statPercent(stats.vpipHands, stats.hands), 100);
});
