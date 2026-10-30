import type { Card } from "./poker-engine";
import { handCode, positionOpenPercent, preflopHandScore, type TablePosition } from "./preflop-strategy";

export const RANGE_POSITIONS: TablePosition[] = ["UTG", "UTG+1", "MP", "HJ", "CO", "BTN", "SB", "BB"];
export type PositionHandRanges = Record<TablePosition, string[]>;
export type HandFilter = {
  enabled: boolean;
  scope: "global" | "position";
  hands: string[];
  positionHands: PositionHandRanges;
};

export const RANGE_RANKS = ["A", "K", "Q", "J", "T", "9", "8", "7", "6", "5", "4", "3", "2"];
const VALUES = [14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2];

export function rangeCell(row: number, column: number) {
  if (row === column) return `${RANGE_RANKS[row]}${RANGE_RANKS[column]}`;
  if (row < column) return `${RANGE_RANKS[row]}${RANGE_RANKS[column]}s`;
  return `${RANGE_RANKS[column]}${RANGE_RANKS[row]}o`;
}

export const ALL_HANDS = Array.from({ length: 13 }, (_, row) =>
  Array.from({ length: 13 }, (_, column) => rangeCell(row, column)),
).flat();
const HAND_SET = new Set(ALL_HANDS);

function combos(code: string) { return code.length === 2 ? 6 : code.endsWith("s") ? 4 : 12; }
function score(code: string) {
  const high = VALUES[RANGE_RANKS.indexOf(code[0])];
  const low = VALUES[RANGE_RANKS.indexOf(code[1])];
  const hole: Card[] = [{ rank: high, suit: "s" }, { rank: low, suit: code.endsWith("s") ? "s" : "h" }];
  return preflopHandScore(hole);
}
const SORTED = [...ALL_HANDS].sort((a, b) => score(b) - score(a) || a.localeCompare(b));

export function rangePreset(percent: number) {
  if (percent >= 100) return [...ALL_HANDS];
  const result: string[] = [];
  let count = 0;
  for (const code of SORTED) {
    if (count + combos(code) / 2 > 1326 * percent / 100) break;
    result.push(code);
    count += combos(code);
  }
  return result;
}

export function rangePercent(hands: string[]) {
  return Math.round(hands.reduce((sum, code) => sum + (HAND_SET.has(code) ? combos(code) : 0), 0) / 1326 * 1000) / 10;
}

function cleanHands(value: unknown, fallback: string[]) {
  return Array.isArray(value)
    ? [...new Set(value.filter((hand): hand is string => typeof hand === "string" && HAND_SET.has(hand)))]
    : [...fallback];
}

export function positionRangePresets(tableSize = 8): PositionHandRanges {
  return Object.fromEntries(RANGE_POSITIONS.map(position => [position, rangePreset(positionOpenPercent(position, tableSize))])) as PositionHandRanges;
}

export function handsForPosition(filter: HandFilter, position?: TablePosition) {
  return filter.scope === "position" && position ? filter.positionHands[position] : filter.hands;
}

export function restoreHandFilter(value: unknown): HandFilter {
  const defaultHands = rangePreset(25);
  const defaultPositionHands = positionRangePresets();
  if (!value || typeof value !== "object") return { enabled: false, scope: "global", hands: defaultHands, positionHands: defaultPositionHands };
  const entry = value as Partial<HandFilter>;
  const hands = cleanHands(entry.hands, defaultHands);
  const savedPositions = entry.positionHands && typeof entry.positionHands === "object" ? entry.positionHands : null;
  const positionHands = Object.fromEntries(RANGE_POSITIONS.map(position => [
    position,
    cleanHands(savedPositions?.[position], hands),
  ])) as PositionHandRanges;
  const scope = entry.scope === "position" ? "position" : "global";
  const canEnable = scope === "global" ? hands.length > 0 : RANGE_POSITIONS.some(position => positionHands[position].length > 0);
  return { enabled: entry.enabled === true && canEnable, scope, hands, positionHands };
}

export function shouldAutoFold(hole: Card[], filter: HandFilter, position?: TablePosition) {
  return filter.enabled && hole.length === 2 && !handsForPosition(filter, position).includes(handCode(hole));
}

export function wasAutoFolded(timeline: Array<{ actor: number | null; street: string; action: string }>) {
  return timeline.some(frame => frame.actor === 0 && frame.street === "preflop" && frame.action.includes("按起手牌範圍自動棄牌"));
}
