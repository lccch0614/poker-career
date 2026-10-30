import { payoutShares } from "./tournament";
import { MTT_ENTRIES, mttPrize } from "./mtt-field";

export const CAREER_STARTING_BANKROLL = 3000;
export const CASH_BIG_BLINDS = [1, 2, 5, 10] as const;
export const TOURNAMENT_ENTRIES = [20, 50, 100, 250] as const;
export const AOF_BIG_BLINDS = [1, 2, 5, 10] as const;

export type CareerMode = "cash" | "tournament" | "aof";
export type CareerStakeRisk = {
  initialCost: number; maximumCost: number; affordableEntries: number;
  recommendedEntries: number | null; level: "comfortable" | "caution" | "unaffordable";
};

// The ceiling includes two optional re-buys / extra lives, not an upfront charge.
export function careerStakeRisk(mode: CareerMode, balance: number, stake: number): CareerStakeRisk {
  const initialCost = mode === "cash" ? 100 * stake : mode === "aof" ? 8 * stake : stake;
  const maximumCost = mode === "cash" ? initialCost * 3 : mode === "aof" ? initialCost * 3 : initialCost;
  const recommendedEntries = mode === "cash" ? 30 : mode === "tournament" ? 60 : null;
  const affordableEntries = Math.floor((balance + 1e-8) / initialCost);
  const level = affordableEntries < 1 ? "unaffordable"
    : recommendedEntries !== null && affordableEntries < recommendedEntries ? "caution"
    : mode === "aof" && balance < maximumCost ? "caution"
    : "comfortable";
  return { initialCost, maximumCost, affordableEntries, recommendedEntries, level };
}

export type CareerTransaction = {
  id: string; sessionId: string; mode: "cash" | "tournament" | "aof";
  kind: "buy-in" | "rebuy" | "cash-out" | "entry" | "prize" | "life";
  amount: number; at: number;
};
export type CareerWallet = {
  version: 1; balance: number; transactions: CareerTransaction[];
  cash?: { id: string; bb: number; buyInsPaid: number };
  tournament?: { id: string; entry: number; tableSize: number };
  aof?: { id: string; bb: number; livesPaid: number };
};

export function newCareerWallet(): CareerWallet {
  return { version: 1, balance: CAREER_STARTING_BANKROLL, transactions: [] };
}

export function restoreCareerWallet(value: unknown, legacy = false): CareerWallet {
  if (legacy && value === undefined) return newCareerWallet();
  if (!value || typeof value !== "object") throw new Error("Career wallet missing");
  const wallet = value as Partial<CareerWallet>;
  if (wallet.version !== 1 || !Array.isArray(wallet.transactions)) throw new Error("Career wallet invalid");
  const ids = new Set<string>();
  for (const entry of wallet.transactions) {
    if (!entry || typeof entry.id !== "string" || ids.has(entry.id) || !Number.isFinite(entry.amount) || !Number.isFinite(entry.at)) throw new Error("Career transactions invalid");
    ids.add(entry.id);
  }
  const balance = Math.round((CAREER_STARTING_BANKROLL + wallet.transactions.reduce((sum, entry) => sum + entry.amount, 0)) * 100) / 100;
  if (!Number.isFinite(balance) || balance < 0 || Math.abs(balance - (wallet.balance ?? NaN)) > 0.001) throw new Error("Career balance mismatch");
  if (wallet.cash && (!ids.has(`cash:${wallet.cash.id}:buy-in`) || wallet.cash.buyInsPaid < 1 || wallet.cash.buyInsPaid > 3)) throw new Error("Cash session invalid");
  if (wallet.tournament && !ids.has(`tournament:${wallet.tournament.id}:entry`)) throw new Error("Tournament session invalid");
  if (wallet.aof && (!ids.has(`aof:${wallet.aof.id}:life:1`) || wallet.aof.livesPaid < 1 || wallet.aof.livesPaid > 3)) throw new Error("AOF session invalid");
  return { ...wallet, version: 1, balance, transactions: wallet.transactions };
}

function transact(wallet: CareerWallet, entry: CareerTransaction): CareerWallet | null {
  if (wallet.transactions.some(previous => previous.id === entry.id)) return wallet;
  const balance = Math.round((wallet.balance + entry.amount) * 100) / 100;
  if (!Number.isFinite(entry.amount) || !Number.isFinite(balance) || balance < 0) return null;
  return { ...wallet, balance, transactions: [...wallet.transactions, entry] };
}

export function openCash(wallet: CareerWallet, id: string, bb: number): CareerWallet | null {
  if (wallet.cash || !CASH_BIG_BLINDS.includes(bb as typeof CASH_BIG_BLINDS[number]) || wallet.transactions.some(entry => entry.sessionId === id)) return null;
  const paid = transact(wallet, { id: `cash:${id}:buy-in`, sessionId: id, mode: "cash", kind: "buy-in", amount: -100 * bb, at: Date.now() });
  return paid && { ...paid, cash: { id, bb, buyInsPaid: 1 } };
}

export function rebuyCash(wallet: CareerWallet, id: string): CareerWallet | null {
  const session = wallet.cash;
  if (!session || session.id !== id || session.buyInsPaid >= 3) return null;
  const paid = transact(wallet, { id: `cash:${id}:rebuy:${session.buyInsPaid}`, sessionId: id, mode: "cash", kind: "rebuy", amount: -100 * session.bb, at: Date.now() });
  return paid && { ...paid, cash: { ...session, buyInsPaid: session.buyInsPaid + 1 } };
}

export function closeCash(wallet: CareerWallet, id: string, stackBb: number): CareerWallet | null {
  const session = wallet.cash;
  if (!session || session.id !== id || !Number.isFinite(stackBb) || stackBb < 0) return null;
  const paid = transact(wallet, { id: `cash:${id}:cash-out`, sessionId: id, mode: "cash", kind: "cash-out", amount: stackBb * session.bb, at: Date.now() });
  return paid && { ...paid, cash: undefined };
}

export function cashCannotRebuy(wallet: CareerWallet, id: string, stackBb: number, rebuysUsed: number) {
  if (stackBb > 0) return false;
  return rebuysUsed >= 2 || wallet.transactions.some(tx => tx.id === `cash:${id}:cash-out`)
    || !!wallet.cash && wallet.cash.id === id && wallet.balance < 100 * wallet.cash.bb;
}

export function openTournament(wallet: CareerWallet, id: string, entry: number, tableSize: number): CareerWallet | null {
  if (wallet.tournament || !TOURNAMENT_ENTRIES.includes(entry as typeof TOURNAMENT_ENTRIES[number]) || tableSize < 2 || tableSize > 8 && tableSize !== MTT_ENTRIES || wallet.transactions.some(tx => tx.sessionId === id)) return null;
  const paid = transact(wallet, { id: `tournament:${id}:entry`, sessionId: id, mode: "tournament", kind: "entry", amount: -entry, at: Date.now() });
  return paid && { ...paid, tournament: { id, entry, tableSize } };
}

export function settleTournament(wallet: CareerWallet, id: string, place: number, tiedPlaces: number[] = []): CareerWallet | null {
  const session = wallet.tournament;
  if (!session || session.id !== id || place < 1 || place > session.tableSize) return null;
  const shares = payoutShares(session.tableSize);
  const tied = Math.max(1, tiedPlaces.filter(value => value === place).length);
  const fraction = Array.from({ length: tied }, (_, offset) => shares[place - 1 + offset] ?? 0).reduce((sum, share) => sum + share, 0) / tied / 100;
  const prize = session.tableSize === MTT_ENTRIES ? mttPrize(session.entry, place, tiedPlaces) : Math.round(session.entry * session.tableSize * fraction * 100) / 100;
  const paid = transact(wallet, { id: `tournament:${id}:prize`, sessionId: id, mode: "tournament", kind: "prize", amount: prize, at: Date.now() });
  return paid && { ...paid, tournament: undefined };
}

export function openAof(wallet: CareerWallet, id: string, bb: number): CareerWallet | null {
  if (wallet.aof || !AOF_BIG_BLINDS.includes(bb as typeof AOF_BIG_BLINDS[number]) || wallet.transactions.some(entry => entry.sessionId === id)) return null;
  const paid = transact(wallet, { id: `aof:${id}:life:1`, sessionId: id, mode: "aof", kind: "life", amount: -8 * bb, at: Date.now() });
  return paid && { ...paid, aof: { id, bb, livesPaid: 1 } };
}

export function buyAofLife(wallet: CareerWallet, id: string): CareerWallet | null {
  const session = wallet.aof;
  if (!session || session.id !== id || session.livesPaid >= 3) return null;
  const life = session.livesPaid + 1;
  const paid = transact(wallet, { id: `aof:${id}:life:${life}`, sessionId: id, mode: "aof", kind: "life", amount: -8 * session.bb, at: Date.now() });
  return paid && { ...paid, aof: { ...session, livesPaid: life } };
}

export function closeAof(wallet: CareerWallet, id: string, stackBb: number): CareerWallet | null {
  const session = wallet.aof;
  if (!session || session.id !== id || !Number.isFinite(stackBb) || stackBb < 0) return null;
  const paid = transact(wallet, { id: `aof:${id}:cash-out`, sessionId: id, mode: "aof", kind: "cash-out", amount: stackBb * session.bb, at: Date.now() });
  return paid && { ...paid, aof: undefined };
}
