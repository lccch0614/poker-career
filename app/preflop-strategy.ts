import type { Card } from "./poker-engine";

export type TablePosition = "UTG" | "UTG+1" | "MP" | "HJ" | "CO" | "BTN" | "SB" | "BB";
export type StrategyAction = "fold" | "check" | "call" | "raise" | "threeBet" | "fourBet" | "jam";

type RangeProfile = {
  open: number;
  call: number;
  threeBet: number;
  fourBet: number;
  openPercent: number;
};

export type PreflopAdvice = {
  position: TablePosition;
  hand: string;
  action: StrategyAction;
  label: string;
  score: number;
  openPercent: number;
  mixedBluff: boolean;
  reason: string;
};

export const POSITION_RANGES: Record<TablePosition, RangeProfile> = {
  UTG: { open: 0.62, call: 0.67, threeBet: 0.78, fourBet: 0.89, openPercent: 18 },
  "UTG+1": { open: 0.59, call: 0.64, threeBet: 0.76, fourBet: 0.88, openPercent: 21 },
  MP: { open: 0.56, call: 0.61, threeBet: 0.74, fourBet: 0.87, openPercent: 24 },
  HJ: { open: 0.52, call: 0.58, threeBet: 0.72, fourBet: 0.86, openPercent: 28 },
  CO: { open: 0.46, call: 0.53, threeBet: 0.69, fourBet: 0.84, openPercent: 34 },
  BTN: { open: 0.38, call: 0.48, threeBet: 0.65, fourBet: 0.82, openPercent: 48 },
  SB: { open: 0.42, call: 0.51, threeBet: 0.67, fourBet: 0.83, openPercent: 42 },
  BB: { open: 0.44, call: 0.42, threeBet: 0.68, fourBet: 0.84, openPercent: 55 },
};

function rangeProfile(position: TablePosition, tableSize = 8): RangeProfile {
  if (tableSize <= 2 && position === "SB") return { open: 0.24, call: 0.45, threeBet: 0.64, fourBet: 0.82, openPercent: 78 };
  if (tableSize <= 2 && position === "BB") return { open: 0.4, call: 0.3, threeBet: 0.61, fourBet: 0.8, openPercent: 70 };
  return POSITION_RANGES[position];
}

export function positionOpenPercent(position: TablePosition, tableSize = 8) {
  return rangeProfile(position, tableSize).openPercent;
}

const RANK_CHAR: Record<number, string> = { 14: "A", 13: "K", 12: "Q", 11: "J", 10: "T", 9: "9", 8: "8", 7: "7", 6: "6", 5: "5", 4: "4", 3: "3", 2: "2" };

export function handCode(hole: Card[]) {
  const [high, low] = [...hole].sort((a, b) => b.rank - a.rank);
  if (!high || !low) return "—";
  if (high.rank === low.rank) return `${RANK_CHAR[high.rank]}${RANK_CHAR[low.rank]}`;
  return `${RANK_CHAR[high.rank]}${RANK_CHAR[low.rank]}${high.suit === low.suit ? "s" : "o"}`;
}

export function preflopHandScore(hole: Card[]) {
  const [high, low] = [...hole].sort((a, b) => b.rank - a.rank);
  if (!high || !low) return 0;
  if (high.rank === low.rank) return Math.min(0.99, 0.51 + ((high.rank - 2) / 12) * 0.48);
  const gap = high.rank - low.rank;
  let score = ((high.rank - 2) / 12) * 0.405 + ((low.rank - 2) / 12) * 0.215;
  if (high.suit === low.suit) score += 0.078;
  if (gap === 1) score += 0.078;
  else if (gap === 2) score += 0.046;
  else if (gap === 3) score += 0.02;
  if (high.rank >= 10 && low.rank >= 10) score += 0.095;
  if (high.rank === 14) score += 0.06;
  return Math.max(0.04, Math.min(0.96, score));
}

export function getTablePosition(active: boolean[], button: number, actor: number): TablePosition {
  const live: number[] = [];
  const cursor = button;
  for (let step = 0; step < active.length; step++) {
    const index = (cursor + step) % active.length;
    if (active[index]) live.push(index);
  }
  if (live.length <= 2) return actor === button ? "SB" : "BB";
  if (actor === live[0]) return "BTN";
  if (actor === live[1]) return "SB";
  if (actor === live[2]) return "BB";
  const preButton = live.slice(3);
  const maps: Record<number, TablePosition[]> = {
    1: ["CO"],
    2: ["UTG", "CO"],
    3: ["UTG", "HJ", "CO"],
    4: ["UTG", "MP", "HJ", "CO"],
    5: ["UTG", "UTG+1", "MP", "HJ", "CO"],
  };
  return maps[preButton.length]?.[preButton.indexOf(actor)] ?? "MP";
}

export function getPreflopAdvice(hole: Card[], position: TablePosition, raises: number, toCall: number, limpers = 0, tableSize = 8): PreflopAdvice {
  const profile = rangeProfile(position, tableSize);
  const score = preflopHandScore(hole);
  const hand = handCode(hole);
  const suited = hole[0]?.suit === hole[1]?.suit;
  const ranks = hole.map(card => card.rank);
  const low = Math.min(...ranks);
  const gap = Math.abs((ranks[0] ?? 0) - (ranks[1] ?? 0));
  const wheelAce = suited && ranks.includes(14) && low <= 5;
  const suitedConnector = suited && gap <= 2 && Math.max(...ranks) <= 11 && Math.max(...ranks) >= 6;
  const mixedBluff = wheelAce || suitedConnector;
  let action: StrategyAction;
  let reason: string;

  if (raises === 0 && limpers === 0) {
    action = score >= profile.open || mixedBluff && score >= profile.open - 0.055 ? "raise" : toCall === 0 ? "check" : "fold";
    reason = `${position} 約 ${profile.openPercent}% open range`;
  } else if (raises === 0) {
    if (score >= profile.open + 0.035) action = "raise";
    else if (score >= profile.open - 0.085 || position === "BB" && toCall === 0) action = "call";
    else action = "fold";
    reason = `${position} 面對 ${limpers} 位 limper 嘅 isolation range`;
  } else if (raises === 1) {
    if (score >= profile.threeBet || mixedBluff && score >= profile.call - 0.035) action = "threeBet";
    else if (score >= profile.call || position === "BB" && score >= profile.call - 0.055) action = "call";
    else action = "fold";
    reason = `${position} 面對 open 嘅 call／3-bet range`;
  } else if (raises === 2) {
    if (score >= profile.fourBet) action = "fourBet";
    else if (score >= profile.fourBet - 0.105) action = "call";
    else action = "fold";
    reason = `${position} 面對 3-bet 嘅 4-bet／防守 range`;
  } else {
    action = score >= 0.91 ? "jam" : score >= 0.86 ? "call" : "fold";
    reason = "面對 4-bet+ 嘅頂端繼續 range";
  }

  const label: Record<StrategyAction, string> = {
    fold: "棄牌", check: "過牌", call: "跟注", raise: limpers ? "隔離加注" : "開池加注",
    threeBet: "3-bet", fourBet: "4-bet", jam: "全押",
  };
  return { position, hand, action, label: label[action], score, openPercent: profile.openPercent, mixedBluff, reason };
}
