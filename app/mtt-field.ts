import type { Card } from "./poker-engine";
import { TOURNAMENT_BLINDS, type TournamentSpeed } from "./tournament";

export const MTT_ENTRIES = 200;
export const MTT_PAID = 30;
export const MTT_BACKGROUND_INTERVAL_MS = 8000;
export const MTT_LEVEL_MS: Record<TournamentSpeed, number> = { turbo: 3 * 60_000, standard: 6 * 60_000, deep: 10 * 60_000 };
export type MttFinish = { id: number; place: number; handNo: number };
export type MttHighlight = {
  id: string; table: number; handNo: number; at: number; label: string;
  ids: number[]; starting: number[]; ending: number[]; holes: Card[][]; board: Card[];
  actions: string[]; winners: number[]; potSummary: string[]; busts: number[];
};
export type MttField = {
  version: 1; stacks: number[]; tables: number[][]; finishes: MttFinish[];
  handNo: number; heroPlace: number | null;
  clock?: { elapsedMs: number; lastTickAt: number; nextBackgroundAt: number };
  tableHands?: number[]; buttons?: number[]; moved?: number[]; highlights?: MttHighlight[];
  backgroundCursor?: number;
};

export function mttPayoutShares() {
  // Thirty paid positions. Normalize so the complete prize pool is distributed.
  const weights = Array.from({ length: MTT_PAID }, (_, index) => index === 0 ? 110 : index === 1 ? 72 : index === 2 ? 53 : 36 / Math.sqrt(index + 1));
  const total = weights.reduce((sum, value) => sum + value, 0);
  return weights.map(value => value * 100 / total);
}

export function mttPrize(entry: number, place: number, tiedPlaces: number[] = []) {
  const tied = Math.max(1, tiedPlaces.filter(value => value === place).length);
  const shares = mttPayoutShares();
  const share = Array.from({ length: tied }, (_, offset) => shares[place - 1 + offset] ?? 0).reduce((sum, value) => sum + value, 0) / tied;
  return Math.round(entry * MTT_ENTRIES * share) / 100;
}

export function newMttField(startingStack: number, now = Date.now()): MttField {
  return {
    version: 1,
    stacks: Array(MTT_ENTRIES).fill(startingStack),
    tables: Array.from({ length: 25 }, (_, table) => Array.from({ length: 8 }, (_, seat) => table * 8 + seat)),
    finishes: [], handNo: 1, heroPlace: null,
    clock: { elapsedMs: 0, lastTickAt: now, nextBackgroundAt: now + MTT_BACKGROUND_INTERVAL_MS },
    tableHands: Array(25).fill(0), buttons: Array.from({ length: 25 }, (_, index) => index * 8),
    moved: Array(MTT_ENTRIES).fill(0), highlights: [],
    backgroundCursor: 0,
  };
}

export function restoreMttField(field: MttField, now = Date.now()): MttField {
  return { ...field,
    clock: { elapsedMs: Math.max(0, field.clock?.elapsedMs ?? 0), lastTickAt: now, nextBackgroundAt: now + MTT_BACKGROUND_INTERVAL_MS },
    tableHands: field.tableHands?.length === field.tables.length ? field.tableHands : field.tables.map(() => 0),
    buttons: field.buttons?.length === field.tables.length ? field.buttons : field.tables.map(table => table[0]),
    moved: field.moved?.length === MTT_ENTRIES ? field.moved : Array(MTT_ENTRIES).fill(0),
    highlights: Array.isArray(field.highlights) ? field.highlights.slice(0, 40) : [],
    backgroundCursor: Number.isInteger(field.backgroundCursor) ? field.backgroundCursor : 0,
  };
}

export function mttElapsed(field: MttField, now = Date.now()) {
  return Math.max(0, (field.clock?.elapsedMs ?? 0) + Math.max(0, now - (field.clock?.lastTickAt ?? now)));
}
export function mttLevel(field: MttField, speed: TournamentSpeed, now = Date.now()) {
  return Math.min(TOURNAMENT_BLINDS.length - 1, Math.floor(mttElapsed(field, now) / MTT_LEVEL_MS[speed]));
}
export function mttClockTick(field: MttField, now: number, scheduleBackground = true): MttField {
  const elapsedMs = mttElapsed(field, now);
  return { ...field, clock: { elapsedMs, lastTickAt: now, nextBackgroundAt: scheduleBackground ? now + MTT_BACKGROUND_INTERVAL_MS : field.clock?.nextBackgroundAt ?? now + MTT_BACKGROUND_INTERVAL_MS } };
}

export function isMttField(value: unknown): value is MttField {
  if (!value || typeof value !== "object") return false;
  const field = value as MttField;
  const seats = field.tables?.flat();
  return field.version === 1 && Array.isArray(field.stacks) && field.stacks.length === MTT_ENTRIES &&
    field.stacks.every(stack => Number.isFinite(stack) && stack >= 0) &&
    Array.isArray(field.tables) && Array.isArray(seats) && seats.every(id => Number.isInteger(id) && id >= 0 && id < MTT_ENTRIES) &&
    new Set(seats).size === seats.length && seats.length === field.stacks.filter(stack => stack > 0).length && seats.every(id => field.stacks[id] > 0) &&
    field.finishes instanceof Array && field.finishes.every(entry => Number.isInteger(entry.id) && entry.id >= 0 && entry.id < MTT_ENTRIES && Number.isInteger(entry.place) && entry.place >= 2 && entry.place <= MTT_ENTRIES) &&
    field.finishes.length + seats.length === MTT_ENTRIES && new Set(field.finishes.map(entry => entry.id)).size === field.finishes.length &&
    field.finishes.every(entry => field.stacks[entry.id] === 0) &&
    Number.isInteger(field.handNo) && field.handNo >= 1;
}

export function mttRemaining(field: MttField) { return field.stacks.filter(stack => stack > 0).length; }
export function mttAverage(field: MttField) {
  return field.stacks.reduce((sum, stack) => sum + stack, 0) / Math.max(1, mttRemaining(field));
}

export type MttOutcome = { ids: number[]; stacks: number[]; table?: number };

/** Resolve a hand or synchronized group. Equal starting stacks in the group tie. */
export function completeMttBatch(field: MttField, outcomes: MttOutcome[], handNo = field.handNo): MttField {
  const stacks = [...field.stacks];
  const seen = new Set<number>();
  for (const outcome of outcomes) {
    if (outcome.ids.length !== outcome.stacks.length) throw new Error("Invalid MTT table outcome");
    const table = outcome.table === undefined ? undefined : field.tables[outcome.table];
    if (outcome.table !== undefined && (!table || outcome.ids.length !== table.length || outcome.ids.some((id, index) => table[index] !== id))) throw new Error("MTT seats changed during a hand");
    outcome.ids.forEach((id, index) => {
      if (seen.has(id) || !field.tables.some(table => table.includes(id)) || !Number.isFinite(outcome.stacks[index]) || outcome.stacks[index] < 0) throw new Error("Invalid MTT seat");
      seen.add(id); stacks[id] = outcome.stacks[index];
    });
  }
  const oldTotal = field.stacks.reduce((sum, stack) => sum + stack, 0);
  const newTotal = stacks.reduce((sum, stack) => sum + stack, 0);
  if (Math.abs(oldTotal - newTotal) > 0.01) throw new Error("MTT chips were not conserved");
  const survivors = stacks.filter(stack => stack > 0).length;
  const busted = [...seen].filter(id => field.stacks[id] > 0 && stacks[id] <= 0)
    .sort((a, b) => field.stacks[b] - field.stacks[a] || a - b);
  const finishes = [...field.finishes, ...busted.map(id => ({
    id, place: survivors + 1 + busted.filter(other => field.stacks[other] > field.stacks[id]).length, handNo,
  }))];
  const heroPlace = field.heroPlace ?? finishes.find(entry => entry.id === 0)?.place ?? null;
  const tables = field.tables.map(table => table.filter(id => stacks[id] > 0));
  const tableHands = [...(field.tableHands ?? field.tables.map(() => 0))];
  const buttons = [...(field.buttons ?? field.tables.map(table => table[0]))];
  for (const outcome of outcomes) {
    if (outcome.table === undefined) continue;
    const index = outcome.table;
    tableHands[index] = (tableHands[index] ?? 0) + 1;
    if (!tables[index]?.length) continue;
    const old = field.tables[index];
    const buttonIndex = Math.max(0, old.indexOf(buttons[index]));
    buttons[index] = Array.from({ length: old.length }, (_, offset) => old[(buttonIndex + offset + 1) % old.length]).find(id => stacks[id] > 0) ?? tables[index][0];
  }
  return { ...field, stacks, tables, finishes, heroPlace, tableHands, buttons };
}

/** Move seats only between hands, favoring players who have moved fewer times. */
export function rebalanceMttField(field: MttField): MttField {
  const alive = mttRemaining(field);
  // Preserve seats and break a table only when the field can fit on fewer tables.
  // Balance at hand boundaries, with no more than one seat difference.
  const tableCount = Math.max(1, Math.ceil(alive / 8));
  const entries = field.tables.map((table, index) => ({ table: [...table], button: field.buttons?.[index] ?? table[0], hands: field.tableHands?.[index] ?? 0 })).filter(entry => entry.table.length > 0);
  const tables = entries.map(entry => entry.table);
  if (!tables.length) throw new Error("MTT has no surviving players");
  const heroTable = tables.findIndex(table => table.includes(0));
  if (heroTable > 0) [entries[0], entries[heroTable]] = [entries[heroTable], entries[0]];
  const moved = [...(field.moved ?? Array(MTT_ENTRIES).fill(0))];
  const moving: Array<{ id: number; offset: number }> = [];
  while (entries.length > tableCount) {
    const shortest = entries.reduce((index, entry, current) => current !== 0 && entry.table.length < entries[index].table.length ? current : index, entries.length > 1 ? 1 : 0);
    const broken = entries.splice(shortest, 1)[0];
    const oldButton = Math.max(0, broken.table.indexOf(broken.button));
    broken.table.forEach((id, index) => moving.push({ id, offset: (index - oldButton + broken.table.length) % broken.table.length }));
  }
  const insert = ({ id, offset }: { id: number; offset: number }, target: number) => {
    const destination = entries[target];
    const button = Math.max(0, destination.table.indexOf(destination.button));
    const insertion = Math.max(destination.table.includes(0) ? 1 : 0, Math.min(destination.table.length, button + Math.max(1, offset)));
    destination.table.splice(insertion, 0, id);
    moved[id]++;
  };
  for (const item of moving) {
    const target = entries.reduce((index, entry, current) => entry.table.length < entries[index].table.length ? current : index, 0);
    insert(item, target);
  }
  while (entries.length > 1) {
    const smallest = entries.reduce((index, entry, current) => entry.table.length < entries[index].table.length ? current : index, 0);
    const largest = entries.reduce((index, entry, current) => entry.table.length > entries[index].table.length ? current : index, 0);
    if (entries[largest].table.length - entries[smallest].table.length <= 1) break;
    const source = entries[largest];
    const movable = source.table.filter(id => id !== 0).sort((a, b) => moved[a] - moved[b] || a - b)[0];
    if (movable === undefined) break;
    const offset = (source.table.indexOf(movable) - Math.max(0, source.table.indexOf(source.button)) + source.table.length) % source.table.length;
    source.table.splice(source.table.indexOf(movable), 1);
    if (source.button === movable) source.button = source.table[0];
    insert({ id: movable, offset }, smallest);
  }
  return { ...field, tables: entries.map(entry => entry.table), buttons: entries.map(entry => entry.button), tableHands: entries.map(entry => entry.hands), moved, handNo: field.handNo + 1 };
}

/** One synchronized hand at all tables, used at the bubble and the final table. */
export function completeMttRound(field: MttField, outcomes: MttOutcome[]): MttField {
  if (outcomes.length !== field.tables.length || outcomes.some((outcome, index) => outcome.ids.length !== field.tables[index].length || outcome.ids.some((id, seat) => field.tables[index][seat] !== id))) throw new Error("Incomplete MTT round");
  const finished = completeMttBatch(field, outcomes.map((outcome, table) => ({ ...outcome, table })));
  return rebalanceMttField(finished);
}

export function mttStandings(field: MttField) {
  const active = field.stacks.map((stack, id) => ({ id, stack })).filter(entry => entry.stack > 0)
    .sort((a, b) => b.stack - a.stack || a.id - b.id).map((entry, index) => ({ ...entry, place: index + 1 }));
  return [...active, ...field.finishes.map(entry => ({ id: entry.id, stack: 0, place: entry.place }))].sort((a, b) => a.place - b.place || a.id - b.id);
}
