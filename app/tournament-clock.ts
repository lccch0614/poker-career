export const BASE_DECISION_MS = 15_000;
export const MAX_DECISION_MS = 30_000;
export const TIME_BANK_MS = 90_000;

export type TournamentDecisionClock = {
  bankMs: number;
  turnKey: string;
  remainingMs: number;
  extensionMs: number;
  extended: boolean;
  runningAt: number | null;
};

export function newDecisionClock(turnKey: string, bankMs = TIME_BANK_MS, now = Date.now()): TournamentDecisionClock {
  return { bankMs: Math.max(0, Math.min(TIME_BANK_MS, bankMs)), turnKey, remainingMs: BASE_DECISION_MS, extensionMs: 0, extended: false, runningAt: now };
}

export function tickDecisionClock(clock: TournamentDecisionClock, now = Date.now()): TournamentDecisionClock {
  if (clock.runningAt === null || now <= clock.runningAt || clock.remainingMs <= 0) return clock;
  const spent = Math.min(clock.remainingMs, now - clock.runningAt);
  const beforeExtension = Math.max(0, clock.remainingMs - clock.extensionMs);
  const bankSpent = Math.max(0, spent - beforeExtension);
  return { ...clock, remainingMs: clock.remainingMs - spent, bankMs: Math.max(0, clock.bankMs - bankSpent), extensionMs: Math.max(0, clock.extensionMs - bankSpent), runningAt: now };
}

export function extendDecisionClock(clock: TournamentDecisionClock, now = Date.now()): TournamentDecisionClock {
  const current = tickDecisionClock(clock, now);
  if (current.remainingMs <= 0 || current.extended || current.bankMs <= 0) return current;
  const extra = Math.min(15_000, current.bankMs, MAX_DECISION_MS - current.remainingMs);
  return { ...current, remainingMs: current.remainingMs + extra, extensionMs: extra, extended: true };
}

export function pauseDecisionClock(clock: TournamentDecisionClock, now = Date.now()): TournamentDecisionClock {
  return { ...tickDecisionClock(clock, now), runningAt: null };
}

export function restoreDecisionClock(value: unknown): TournamentDecisionClock | null {
  if (!value || typeof value !== "object") return null;
  const clock = value as TournamentDecisionClock;
  if (typeof clock.turnKey !== "string" || !Number.isFinite(clock.bankMs) || !Number.isFinite(clock.remainingMs) || !Number.isFinite(clock.extensionMs)) return null;
  return { bankMs: Math.max(0, Math.min(TIME_BANK_MS, clock.bankMs)), turnKey: clock.turnKey, remainingMs: Math.max(0, Math.min(MAX_DECISION_MS, clock.remainingMs)), extensionMs: Math.max(0, Math.min(15_000, clock.extensionMs)), extended: clock.extended === true, runningAt: null };
}
