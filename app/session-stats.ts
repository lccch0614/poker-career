export type TrackedAction = "fold" | "checkcall" | "raise";

export type PlayerHandTracker = {
  vpip: boolean;
  pfr: boolean;
  threeBet: boolean;
  threeBetOpportunity: boolean;
  sawFlop: boolean;
};

export type PlayerSessionStats = {
  hands: number;
  profit: number;
  vpipHands: number;
  pfrHands: number;
  threeBetHands: number;
  threeBetOpportunities: number;
  sawFlopHands: number;
  showdownHands: number;
  showdownWins: number;
  decisions: number;
  coachPoints: number;
};

export const emptyHandTracker = (): PlayerHandTracker => ({
  vpip: false,
  pfr: false,
  threeBet: false,
  threeBetOpportunity: false,
  sawFlop: false,
});

export const emptySessionStats = (): PlayerSessionStats => ({
  hands: 0,
  profit: 0,
  vpipHands: 0,
  pfrHands: 0,
  threeBetHands: 0,
  threeBetOpportunities: 0,
  sawFlopHands: 0,
  showdownHands: 0,
  showdownWins: 0,
  decisions: 0,
  coachPoints: 0,
});

export function trackPreflopAction(tracker: PlayerHandTracker, action: TrackedAction, toCall: number, raisesBeforeAction: number) {
  const voluntary = action === "raise" || action === "checkcall" && toCall > 0;
  const raised = action === "raise";
  return {
    vpip: tracker.vpip || voluntary,
    pfr: tracker.pfr || raised,
    threeBet: tracker.threeBet || raised && raisesBeforeAction >= 1,
    threeBetOpportunity: tracker.threeBetOpportunity || raisesBeforeAction >= 1,
    sawFlop: tracker.sawFlop,
  };
}

export function settlePlayerSession(stats: PlayerSessionStats, tracker: PlayerHandTracker, result: {
  active: boolean;
  startStack: number;
  endStack: number;
  sawFlop: boolean;
  sawShowdown: boolean;
  wonShowdown: boolean;
}) {
  if (!result.active) return stats;
  return {
    ...stats,
    hands: stats.hands + 1,
    profit: stats.profit + result.endStack - result.startStack,
    vpipHands: stats.vpipHands + Number(tracker.vpip),
    pfrHands: stats.pfrHands + Number(tracker.pfr),
    threeBetHands: stats.threeBetHands + Number(tracker.threeBet),
    threeBetOpportunities: stats.threeBetOpportunities + Number(tracker.threeBetOpportunity),
    sawFlopHands: stats.sawFlopHands + Number(result.sawFlop),
    showdownHands: stats.showdownHands + Number(result.sawShowdown),
    showdownWins: stats.showdownWins + Number(result.wonShowdown),
  };
}

export function statPercent(part: number, total: number) {
  return total ? Math.round(part / total * 100) : 0;
}

export type OpponentProfile = {
  hands: number; vpipHands: number; pfrHands: number; threeBetHands: number;
  threeBetOpportunities: number; sawFlopHands: number; showdownHands: number;
  showdownWins: number; lastHandKey: string;
};

export function restoreOpponentProfiles(value: unknown): Record<string, OpponentProfile> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const profiles: Record<string, OpponentProfile> = {};
  for (let seat = 1; seat <= 7; seat++) {
    const key = `ai:${seat}`;
    const raw = (value as Record<string, unknown>)[key];
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const record = raw as Record<string, unknown>;
    const count = (field: string) => Number.isSafeInteger(record[field]) && (record[field] as number) >= 0 ? record[field] as number : 0;
    profiles[key] = { hands: count('hands'), vpipHands: count('vpipHands'), pfrHands: count('pfrHands'),
      threeBetHands: count('threeBetHands'), threeBetOpportunities: count('threeBetOpportunities'),
      sawFlopHands: count('sawFlopHands'), showdownHands: count('showdownHands'), showdownWins: count('showdownWins'),
      lastHandKey: typeof record.lastHandKey === 'string' ? record.lastHandKey.slice(0, 120) : '' };
  }
  return profiles;
}

export function recordOpponentProfile(previous: OpponentProfile | undefined, handKey: string, tracker: PlayerHandTracker, sawShowdown: boolean, wonShowdown: boolean): OpponentProfile {
  const current = previous ?? { hands: 0, vpipHands: 0, pfrHands: 0, threeBetHands: 0, threeBetOpportunities: 0, sawFlopHands: 0, showdownHands: 0, showdownWins: 0, lastHandKey: '' };
  if (current.lastHandKey === handKey) return current;
  return { hands: current.hands + 1, vpipHands: current.vpipHands + Number(tracker.vpip),
    pfrHands: current.pfrHands + Number(tracker.pfr), threeBetHands: current.threeBetHands + Number(tracker.threeBet),
    threeBetOpportunities: current.threeBetOpportunities + Number(tracker.threeBetOpportunity),
    sawFlopHands: current.sawFlopHands + Number(tracker.sawFlop), showdownHands: current.showdownHands + Number(sawShowdown),
    showdownWins: current.showdownWins + Number(sawShowdown && wonShowdown), lastHandKey: handKey };
}
