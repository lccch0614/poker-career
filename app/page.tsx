"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { bubbleAdjustment, equityVsShoveRange, shoveRangePercent, tournamentPreflopAction } from "./tournament-strategy";
import { icmCallThreshold } from "./icm";
import { bestScore, buildSidePots, compareScore, completeBoard, type Card, type Suit } from "./poker-engine";
import { getPreflopAdvice, getTablePosition, positionOpenPercent, type TablePosition } from "./preflop-strategy";
import { RANGE_POSITIONS, RANGE_RANKS, handsForPosition, positionRangePresets, rangeCell, rangePercent, rangePreset, restoreHandFilter, shouldAutoFold, wasAutoFolded, type HandFilter } from "./hand-filter";
import { emptyHandTracker, emptySessionStats, settlePlayerSession, statPercent, trackPreflopAction, type PlayerHandTracker, type PlayerSessionStats } from "./session-stats";
import { TOURNAMENT_BLINDS, TOURNAMENT_SPEEDS, handsUntilBlindUp, payoutShares, potsWithBigBlindAnte, prizeForPlace, recordTournamentFinishes, tournamentBigBlindAnte, tournamentBlinds, tournamentCanContinue, tournamentLevel, tournamentPhase, tournamentStandings, type TournamentFinish, type TournamentSpeed } from "./tournament";
import { AOF_BIG_BLINDS, CASH_BIG_BLINDS, TOURNAMENT_ENTRIES, buyAofLife, careerStakeRisk, cashCannotRebuy, closeAof, closeCash, newCareerWallet, openAof, openCash, openTournament, rebuyCash, restoreCareerWallet, settleTournament, type CareerWallet, type CareerStakeRisk } from "./career-bankroll";
import { MTT_BACKGROUND_INTERVAL_MS, MTT_ENTRIES, MTT_LEVEL_MS, MTT_PAID, completeMttBatch, completeMttRound, isMttField, mttAverage, mttClockTick, mttElapsed, mttLevel, mttPayoutShares, mttPrize, mttRemaining, mttStandings, newMttField, rebalanceMttField, restoreMttField, type MttField, type MttHighlight } from "./mtt-field";
import { extendDecisionClock, newDecisionClock, pauseDecisionClock, restoreDecisionClock, tickDecisionClock, type TournamentDecisionClock } from "./tournament-clock";
import { saveKeepalive } from "./save-transport";
import { pokerStateFetch, readSaveBackup } from "./browser-storage";

type Street = "preflop" | "flop" | "turn" | "river" | "showdown";
type Difficulty = "casual" | "hard" | "pro";
type GameMode = "cash" | "tournament";
type HeroAction = "fold" | "checkcall" | "raise";
type CoachGrade = "最佳" | "合理" | "可疑" | "失誤";
type ScenarioKind = "btn_open" | "blind_defence" | "vs_threebet" | "flop_cbet" | "face_checkraise" | "turn_barrel" | "river_bluffcatch" | "river_overbet" | "multiway_flop";
type ActionEv = { action: HeroAction; label: string; ev: number; loss: number; best: boolean; size: string; confidence: "高" | "中" | "低" };
type PracticePlan = { label: string; reason: string; kinds: ScenarioKind[] };
type Seat = {
  id: number; name: string; stack: number; hole: Card[]; folded: boolean; allIn: boolean;
  streetBet: number; totalBet: number; lastAction: string;
};
type HandFrame = {
  id: number; street: Street; board: Card[]; pot: number; currentBet: number;
  actor: number | null; action: string;
  players: Array<Pick<Seat, "id" | "name" | "stack" | "streetBet" | "totalBet" | "folded" | "allIn" | "lastAction">>;
};
type Game = {
  handNo: number; button: number; sb: number; bb: number; players: Seat[]; deck: Card[];
  board: Card[]; street: Street; currentBet: number; minRaise: number; pending: boolean[];
  turn: number | null; finished: boolean; message: string; log: string[]; winners: number[];
  potSummary: string[]; actionId: number; preflopRaises: number;
  startingStacks: number[]; handTrackers: PlayerHandTracker[];
  allInBoard: Card[] | null; allInCap: number; settledBets: number[];
  rebuysUsed: number[]; tableId: string; timeline: HandFrame[]; aiDecisions: AiStudyDecision[]; ante?: number;
  smallBlind?: number; bigBlind?: number; bigBlindAnte?: number; bigBlindAntePaid?: number;
  tournamentFinishes?: TournamentFinish[];
  mttSeatIds?: number[];
  allowRunouts?: boolean; runoutPending?: boolean; runoutBoards?: Card[][];
};
type CoachReview = { id: string; grade: CoachGrade; score: number; title: string; detail: string; evLoss: number; street: Street; actionId: number; action?: HeroAction; position?: string; evs?: ActionEv[] };
type AiStudyDecision = { id: string; actor: number; street: Street; actionId: number; action: string; title: string; detail: string; range: string; metrics: string[] };
type GtoHint = { handNo: number; actionId: number; action: string; size: string; title: string; detail: string; metrics: string[]; evs: ActionEv[] };
type ProfitPoint = { hand: number; actual: number; allInEv: number; hadAllIn: boolean };
type StandardTableMotion = { id: number; tableId: string; handNo: number; deal: boolean; boardFrom: number | null; foldedSeat: number | null; chipSeat: number | null; winners: number[] };
type HandRecord = {
  id: string; handNo: number; completedAt: number; tableSize: number; favourite: boolean;
  heroHole: Card[]; playerHoles: Card[][]; finalFolded: boolean[]; board: Card[];
  winners: number[]; message: string; potSummary: string[]; frames: HandFrame[];
  decisions: CoachReview[]; aiDecisions?: AiStudyDecision[]; actualProfit: number; allInEvProfit: number;
};
type SavedPokerState = {
  aof?: AofState; aofOpen?: boolean;
  version: 1 | 2; savedAt: number; game: Game; started: boolean; hasActiveTable: boolean;
  lobbySize: number; difficulty: Difficulty; sessions: PlayerSessionStats[];
  coachReviews: CoachReview[]; profitHistory: ProfitPoint[]; handHistory: HandRecord[]; studyMode?: boolean;
  handFilter?: HandFilter;
  gameMode?: GameMode; lobbyGameMode?: GameMode; tournamentSpeed?: TournamentSpeed; lobbyTournamentSpeed?: TournamentSpeed;
  career?: CareerWallet; lobbyCashBb?: number; lobbyTournamentEntry?: number; lobbyAofBb?: number;
  mtt?: MttField; lobbyMtt?: boolean;
  mttSessions?: PlayerSessionStats[];
  tournamentClock?: TournamentDecisionClock | null;
};

const PLAYER_NAMES = ["你", "AI 1", "AI 2", "AI 3", "AI 4", "AI 5", "AI 6", "AI 7"];
const REBUY_STACK = 100;
const MAX_REBUYS = 2;
const TABLE_SIZES = [2, 3, 4, 5, 6, 7, 8] as const;
const SEAT_SLOTS: Record<number, number[]> = {
  2: [0, 4],
  3: [0, 3, 5],
  4: [0, 2, 4, 6],
  5: [0, 2, 3, 5, 6],
  6: [0, 1, 3, 4, 5, 7],
  7: [0, 1, 2, 3, 5, 6, 7],
  8: [0, 1, 2, 3, 4, 5, 6, 7],
};
const SUITS: Suit[] = ["s", "h", "d", "c"];
const SUIT_GLYPH: Record<Suit, string> = { s: "♠", h: "♥", d: "♦", c: "♣" };
const RANK_LABEL: Record<number, string> = { 14: "A", 13: "K", 12: "Q", 11: "J", 10: "T" };
const STREET_LABEL: Record<Street, string> = { preflop: "翻牌前", flop: "翻牌", turn: "轉牌", river: "河牌", showdown: "攤牌" };
const HAND_LABEL = ["高牌", "一對", "兩對", "三條", "順子", "同花", "葫蘆", "四條", "同花順"];
const DIFFICULTY_INFO: Record<Difficulty, { label: string; short: string; detail: string }> = {
  casual: { label: "休閒", short: "輕鬆", detail: "較少施壓，會出現判斷失誤" },
  hard: { label: "進階", short: "平衡", detail: "位置感知、合理賠率及主動 3-bet" },
  pro: { label: "專業", short: "GTO+", detail: "Range、SPR、牌面結構及混合策略" },
};
const SCENARIO_INFO: Record<ScenarioKind, { label: string; short: string; prompt: string }> = {
  btn_open: { label: "BTN 開池", short: "Open range", prompt: "未有人入池；根據BTN 100BB range作決定。" },
  blind_defence: { label: "BB 防守", short: "Vs open", prompt: "BTN開至2.5BB；選擇BB嘅主要防守策略。" },
  vs_threebet: { label: "面對 3-bet", short: "3-bet pot", prompt: "你開至2.5BB，BB 3-bet至9BB；決定繼續方式。" },
  flop_cbet: { label: "Flop C-bet", short: "SRP flop", prompt: "你係翻牌前進攻者，對手過牌；決定是否延續下注。" },
  face_checkraise: { label: "面對 Check-raise", short: "Flop pressure", prompt: "你作出c-bet後被check-raise；決定棄牌、跟注或再加注。" },
  turn_barrel: { label: "Turn Barrel", short: "Second barrel", prompt: "翻牌下注獲跟注，轉牌再次過到你；決定是否繼續施壓。" },
  river_bluffcatch: { label: "River Bluff-catch", short: "Postflop", prompt: "河牌面對約三分一底池下注；比較equity、pot odds及blocker。" },
  river_overbet: { label: "River Overbet", short: "Vs 125% pot", prompt: "河牌面對125%底池overbet；判斷value、bluff及blocker比例。" },
  multiway_flop: { label: "多人池 Flop", short: "Multiway", prompt: "三人單加注底池，行動過到你；多人池需要收緊下注range。" },
};

function fmt(value: number) {
  return Number.isInteger(value) ? `${value}` : value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}
function chip(value: number) { return Math.round(value * 2) / 2; }
function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => { state = (state * 1664525 + 1013904223) >>> 0; return state / 4294967296; };
}
function shuffle<T>(items: T[], rng: () => number = Math.random) {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
function makeDeck(rng: () => number = Math.random) {
  const deck: Card[] = [];
  for (const suit of SUITS) for (let rank = 2; rank <= 14; rank++) deck.push({ rank, suit });
  return shuffle(deck, rng);
}
function cardKey(card: Card) { return `${card.rank}${card.suit}`; }
function canAct(seat: Seat) { return !seat.folded && !seat.allIn && seat.stack > 0; }
function potTotal(game: Game) { return game.players.reduce((sum, player) => sum + player.totalBet, 0); }
function captureFrame(game: Game, action: string, actor: number | null): HandFrame {
  return {
    id: game.timeline.length,
    street: game.street,
    board: [...game.board],
    pot: potTotal(game),
    currentBet: game.currentBet,
    actor,
    action,
    players: game.players.map(player => ({
      id: player.id, name: player.name, stack: player.stack, streetBet: player.streetBet,
      totalBet: player.totalBet, folded: player.folded, allIn: player.allIn, lastAction: player.lastAction,
    })),
  };
}
function findNext(players: Seat[], from: number, predicate: (seat: Seat, index: number) => boolean) {
  for (let step = 1; step <= players.length; step++) {
    const index = (from + step) % players.length;
    if (predicate(players[index], index)) return index;
  }
  return null;
}
function addLog(game: Game, line: string, actor: number | null = null): Game {
  const next = { ...game, message: line, log: [line, ...game.log].slice(0, 18), actionId: game.actionId + 1 };
  return { ...next, timeline: [...game.timeline, captureFrame(next, line, actor)] };
}

function newHand(stacks: number[], requestedButton: number, handNo: number, rng: () => number = Math.random, rebuysUsed: number[] = stacks.map(() => 0), tableId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, ante = 0, smallBlind = 0.5, bigBlind = 1, bigBlindAnte = 0, tournamentFinishes?: TournamentFinish[]): Game {
  const deck = makeDeck(rng);
  const players: Seat[] = stacks.map((stack, id) => ({
    id, name: PLAYER_NAMES[id], stack, hole: [], folded: stack <= 0, allIn: false,
    streetBet: 0, totalBet: 0, lastAction: stack <= 0 ? "OUT" : "",
  }));
  const live = players.filter(player => player.stack > 0).length;
  const button = players[requestedButton]?.stack > 0 ? requestedButton : findNext(players, requestedButton, player => player.stack > 0) ?? 0;
  const dealOrder: number[] = [];
  let cursor = button;
  for (let i = 0; i < live; i++) {
    cursor = findNext(players, cursor, player => player.stack > 0)!;
    dealOrder.push(cursor);
  }
  for (let round = 0; round < 2; round++) for (const index of dealOrder) players[index].hole.push(deck.pop()!);

  const sb = live === 2 ? button : findNext(players, button, player => player.stack > 0)!;
  const bb = findNext(players, sb, player => player.stack > 0)!;
  if (ante > 0) players.forEach(player => {
    if (player.stack <= 0) return;
    const paid = Math.min(ante,player.stack);
    player.stack -= paid; player.totalBet += paid; player.allIn = player.stack === 0;
    player.lastAction = `Ante ${fmt(paid)}`;
  });
  const postBlind = (index: number, amount: number, label: string) => {
    const paid = Math.min(amount, players[index].stack);
    if (paid <= 0) return;
    players[index].stack -= paid; players[index].streetBet += paid; players[index].totalBet += paid;
    players[index].allIn = players[index].stack === 0; players[index].lastAction = `${label} ${fmt(paid)}`;
  };
  postBlind(sb, smallBlind, "SB"); postBlind(bb, bigBlind, "BB");
  const bigBlindAntePaid = bigBlindAnte > 0 ? Math.min(bigBlindAnte, players[bb].stack) : 0;
  if (bigBlindAntePaid > 0) {
    players[bb].stack -= bigBlindAntePaid;
    players[bb].totalBet += bigBlindAntePaid; // Dead money: not part of the live amount to call.
    players[bb].allIn = players[bb].stack === 0;
    players[bb].lastAction += ` · BB Ante ${fmt(bigBlindAntePaid)}`;
  }
  const pending = players.map(canAct);
  const turn = findNext(players, bb, (_, index) => pending[index]);
  const initialAllIns = players.filter(player => !player.folded && player.allIn);
  const game: Game = {
    handNo, button, sb, bb, players, deck, board: [], street: "preflop", currentBet: tournamentFinishes ? Math.max(bigBlind, players[sb].streetBet, players[bb].streetBet) : Math.max(players[sb].streetBet, players[bb].streetBet),
    minRaise: bigBlind, pending, turn, finished: false, message: `${players[button].name} 在莊位`,
    log: [`第 ${handNo} 手 · ${players[button].name} 是莊家`], winners: [], potSummary: [], actionId: 0, preflopRaises: 0,
    startingStacks: [...stacks], handTrackers: players.map(() => emptyHandTracker()),
    allInBoard: initialAllIns.length ? [] : null,
    allInCap: initialAllIns.length ? Math.max(...initialAllIns.map(player => player.totalBet)) : 0,
    settledBets: [],
    rebuysUsed: [...rebuysUsed],
    tableId,
    timeline: [],
    aiDecisions: [],
    ante,
    smallBlind,
    bigBlind,
    bigBlindAnte,
    bigBlindAntePaid,
    tournamentFinishes,
  };
  const dealt = { ...game, timeline: [captureFrame(game, bigBlindAnte > 0 ? "派牌、投入盲注及 BB Ante" : ante > 0 ? "派牌、投入 Ante 及盲注" : "派牌及投入盲注", null)] };
  return tournamentFinishes && turn === null && live >= 2 ? showdown(dealt) : dealt;
}

function awardUncontested(game: Game, winner: number) {
  const amount = potTotal(game);
  const settledBets = game.players.map(player => player.totalBet);
  const players = game.players.map(player => ({ ...player, streetBet: 0, totalBet: 0 }));
  players[winner].stack += amount;
  players[winner].lastAction = `贏得 ${fmt(amount)}BB`;
  const tournamentFinishes = game.tournamentFinishes ? recordTournamentFinishes(game.tournamentFinishes, game.startingStacks, players.map(player => player.stack), game.handNo) : undefined;
  return addLog({ ...game, players, settledBets, tournamentFinishes, pending: players.map(() => false), turn: null, finished: true, winners: [winner], potSummary: [`底池 ${fmt(amount)}BB：${players[winner].name}`] }, `${players[winner].name} 贏得 ${fmt(amount)}BB`);
}

function showdown(game: Game, runs = 1): Game {
  let remainingDeck = game.deck;
  const boards: Card[][] = [];
  for (let run = 0; run < runs; run++) {
    const completed = completeBoard(remainingDeck, game.board);
    boards.push(completed.board);
    remainingDeck = completed.deck;
  }
  const completed = { board: boards[0], deck: remainingDeck };
  const allScores = boards.map(board => game.players.map(player => player.folded ? null : bestScore([...player.hole, ...board])));
  const scores = allScores[0];
  const layers = potsWithBigBlindAnte(game.players.map(player => player.totalBet), game.players.map(player => player.folded), game.bb, game.bigBlindAntePaid ?? 0);
  const awards = game.players.map(() => 0);
  const settledBets = game.players.map(player => player.totalBet);
  const summaries: string[] = [];
  layers.forEach((layer, layerIndex) => {
    const eligible = layer.eligible.length ? layer.eligible : layer.contributors;
    allScores.forEach((boardScores, run) => {
      let winners = [eligible[0]];
      for (const index of eligible.slice(1)) {
        const comparison = compareScore(boardScores[index] ?? [-1], boardScores[winners[0]] ?? [-1]);
        if (comparison > 0) winners = [index]; else if (comparison === 0) winners.push(index);
      }
      winners.forEach(index => { awards[index] += layer.amount / runs / winners.length; });
      summaries.push(`${runs > 1 ? `第 ${run + 1} 次 · ` : ""}${layerIndex === 0 ? "主池" : `邊池 ${layerIndex}`} ${fmt(layer.amount / runs)}BB：${winners.map(index => game.players[index].name).join("、")}`);
    });
  });
  const players = game.players.map((player, index) => ({
    ...player, stack: player.stack + awards[index], streetBet: 0, totalBet: 0,
    lastAction: awards[index] > 0 ? `+${fmt(awards[index])}BB` : player.lastAction,
  }));
  const winners = awards.map((amount, index) => amount > 0 ? index : -1).filter(index => index >= 0);
  const lead = winners.sort((a, b) => awards[b] - awards[a])[0];
  const leadHand = lead === undefined || runs > 1 ? "" : `以${HAND_LABEL[(scores[lead] ?? [0])[0]]}`;
  const message = lead === undefined ? "牌局結束" : `${players[lead].name}${leadHand}贏得 ${fmt(awards[lead])}BB${winners.length > 1 ? "（另有分池）" : ""}`;
  const tournamentFinishes = game.tournamentFinishes ? recordTournamentFinishes(game.tournamentFinishes, game.startingStacks, players.map(player => player.stack), game.handNo) : undefined;
  return addLog({ ...game, ...completed, runoutPending: false, runoutBoards: boards, players, settledBets, tournamentFinishes, street: "showdown", pending: players.map(() => false), turn: null, finished: true, winners, potSummary: summaries }, message);
}

function AllInChoice({ game, onChoose }: { game: Game; onChoose: (runs: number) => void }) {
  const equity = useMemo(() => {
    const contenders = game.players.map((player, index) => !player.folded ? index : -1).filter(index => index >= 0);
    const known = [...game.board, ...contenders.flatMap(index => game.players[index].hole)];
    const deck = makeDeck(() => 0.5).filter(card => !known.some(item => cardKey(item) === cardKey(card)));
    const rng = seededRandom(game.handNo * 7919 + game.actionId * 101);
    const shares = game.players.map(() => 0);
    const trials = 400;
    for (let trial = 0; trial < trials; trial++) {
      const board = [...game.board, ...shuffle(deck, rng).slice(0, 5 - game.board.length)];
      const scores = contenders.map(index => bestScore([...game.players[index].hole, ...board]));
      let best = scores[0];
      for (const score of scores.slice(1)) if (compareScore(score, best) > 0) best = score;
      const winners = contenders.filter((_, index) => compareScore(scores[index], best) === 0);
      winners.forEach(index => { shares[index] += 1 / winners.length; });
    }
    return shares.map(value => value / trials * 100);
  }, [game]);
  const contenders = game.players.map((player, index) => !player.folded ? index : -1).filter(index => index >= 0);
  return <div className="review-overlay" role="dialog" aria-modal="true" aria-label="All-in 派牌選擇"><section className="review-modal runout-modal">
    <header className="review-header"><div><span>ALL-IN SHOWDOWN</span><h2>攤牌 · 揀派幾次</h2></div></header>
    <div className="runout-content"><p>下注已完成，剩餘玩家亮牌。勝率為 400 次隨機模擬嘅平均底池份額；和牌會分攤，實際邊池所得可能不同。</p>
      {contenders.map(index => <div className="runout-player" key={index}><b>{index ? `${game.players[index].name} · ${personality(index).name}` : "你"}</b><span>{game.players[index].hole.map(card => `${RANK_LABEL[card.rank] ?? card.rank}${SUIT_GLYPH[card.suit]}`).join(" ")}</span><strong>約 {equity[index].toFixed(1)}%</strong></div>)}
      <p>你提出次數；每位 AI 選擇最多接受幾次（每手可能不同），實際次數取共同接受的最低值。每次從同一副牌派出不同牌面，各主池及邊池平均分配。</p>
      <div className="runout-actions">{[1,2,3].map(count => <button key={count} onClick={() => onChoose(count)}>提議派 {count} 次</button>)}</div>
    </div></section></div>;
}

function advanceStreet(game: Game): Game {
  const actors = game.players.filter(canAct);
  if (actors.length <= 1) {
    const handTrackers = game.handTrackers.map((tracker, index) => ({ ...tracker, sawFlop: tracker.sawFlop || !game.players[index].folded }));
    if (game.allowRunouts && !game.players[0].folded && game.board.length < 5 && game.players.some(player => !player.folded && player.allIn)) {
      return { ...game, handTrackers, turn: null, runoutPending: true, message: "All-in 攤牌：選擇派牌次數" };
    }
    return showdown({ ...game, handTrackers });
  }
  if (game.street === "river") return showdown(game);
  const draw = game.street === "preflop" ? 3 : 1;
  const nextStreet: Street = game.street === "preflop" ? "flop" : game.street === "flop" ? "turn" : "river";
  const board = [...game.board, ...game.deck.slice(-draw)];
  const deck = game.deck.slice(0, -draw);
  const players = game.players.map(player => ({ ...player, streetBet: 0, lastAction: player.folded ? "棄牌" : player.allIn ? "ALL-IN" : "" }));
  const handTrackers = game.handTrackers.map((tracker, index) => ({ ...tracker, sawFlop: tracker.sawFlop || nextStreet === "flop" && !players[index].folded }));
  const pending = players.map(canAct);
  const turn = findNext(players, game.button, (_, index) => pending[index]);
  if (turn === null) return showdown({ ...game, players, board, deck, street: nextStreet, handTrackers });
  return addLog({ ...game, players, board, deck, street: nextStreet, currentBet: 0, minRaise: game.bigBlind ?? 1, pending, turn, handTrackers }, `${STREET_LABEL[nextStreet]} · ${players[turn].name} 行動`);
}

function finishAction(game: Game, actor: number): Game {
  const alive = game.players.map((player, index) => !player.folded ? index : -1).filter(index => index >= 0);
  if (alive.length === 1) return awardUncontested(game, alive[0]);
  const pending = game.pending.map((needed, index) => needed && canAct(game.players[index]));
  const next = { ...game, pending };
  if (!pending.some(Boolean)) return advanceStreet(next);
  return { ...next, turn: findNext(game.players, actor, (_, index) => pending[index]) };
}

function act(game: Game, actor: number, action: "fold" | "checkcall" | "raise", raiseTo = 0, autoFold = false): Game {
  if (game.finished || game.turn !== actor || !canAct(game.players[actor])) return game;
  const players = game.players.map(player => ({ ...player }));
  const seat = players[actor];
  let pending = [...game.pending];
  let currentBet = game.currentBet;
  let minRaise = game.minRaise;
  let preflopRaises = game.preflopRaises;
  const handTrackers = game.handTrackers.map(tracker => ({ ...tracker }));
  const toCall = Math.max(0, currentBet - seat.streetBet);
  if (game.street === "preflop") handTrackers[actor] = trackPreflopAction(handTrackers[actor], action, toCall, game.preflopRaises);
  let line = "";
  if (action === "fold") {
    seat.folded = true; seat.lastAction = autoFold ? "範圍自動棄牌" : "棄牌"; pending[actor] = false; line = autoFold ? `${seat.name} 按起手牌範圍自動棄牌` : `${seat.name} 棄牌`;
  } else if (action === "checkcall") {
    const paid = Math.min(toCall, seat.stack);
    seat.stack -= paid; seat.streetBet += paid; seat.totalBet += paid; seat.allIn = seat.stack === 0; pending[actor] = false;
    seat.lastAction = paid === 0 ? "過牌" : seat.allIn ? `ALL-IN ${fmt(seat.streetBet)}` : `跟注 ${fmt(paid)}`;
    line = paid === 0 ? `${seat.name} 過牌` : `${seat.name}${seat.allIn ? "全押" : "跟注"} ${fmt(paid)}BB`;
  } else {
    const maxTo = seat.streetBet + seat.stack;
    const minimum = Math.min(maxTo, currentBet + minRaise);
    const target = Math.max(minimum, Math.min(chip(raiseTo), maxTo));
    const paid = target - seat.streetBet;
    const raiseSize = target - currentBet;
    seat.stack -= paid; seat.streetBet = target; seat.totalBet += paid; seat.allIn = seat.stack === 0;
    currentBet = target; if (raiseSize >= minRaise) minRaise = raiseSize;
    if (game.street === "preflop") preflopRaises += 1;
    pending = players.map((player, index) => index !== actor && canAct(player));
    seat.lastAction = `${seat.allIn ? "ALL-IN" : game.currentBet === 0 ? "下注" : "加注"} ${fmt(target)}`;
    line = `${seat.name}${seat.allIn ? "全押至" : game.currentBet === 0 ? "下注" : "加注至"} ${fmt(target)}BB`;
  }
  let allInBoard = game.allInBoard;
  let allInCap = game.allInCap;
  const activeAllIns = players.filter(player => !player.folded && player.allIn);
  if (activeAllIns.length && !players[0].folded) {
    if (allInBoard === null) allInBoard = [...game.board];
    if (allInBoard.length === game.board.length) allInCap = Math.max(allInCap, ...activeAllIns.map(player => player.totalBet));
  }
  return finishAction(addLog({ ...game, players, pending, currentBet, minRaise, preflopRaises, handTrackers, allInBoard, allInCap }, line, actor), actor);
}

// Only compare simple heads-up all-ins where no side pot or future betting remains.
function tournamentAllInCall(game: Game, actor: number, field?: MttField | null, rng: () => number = Math.random): HeroAction | null {
  if (!game.tournamentFinishes || game.street !== "preflop") return null;
  const alive = game.players.map((p, i) => !p.folded ? i : -1).filter(i => i >= 0);
  if (alive.length !== 2 || !alive.includes(actor)) return null;
  const opponent = alive.find(i => i !== actor)!;
  const player = game.players[actor];
  const call = game.currentBet - player.streetBet;
  if (!game.players[opponent].allIn || call <= 0 || call > player.stack) return null;
  const matched = player.totalBet + call;
  if (game.players.some(p => p.totalBet > matched + 1e-8)) return null;
  const ids = game.mttSeatIds;
  if (field && !ids) return null;
  const original = field ? [...field.stacks] : game.players.map(p => p.stack);
  const actorId = ids ? ids[actor] : actor;
  const opponentId = ids ? ids[opponent] : opponent;
  game.players.forEach((p, i) => { original[ids ? ids[i] : i] = p.stack; });
  const pot = potTotal(game);
  const fold = [...original], win = [...original], lose = [...original];
  fold[opponentId] += pot;
  win[actorId] += pot;
  lose[actorId] -= call;
  lose[opponentId] += pot + call;
  const payouts = field ? mttPayoutShares() : payoutShares(game.players.length);
  const paid = field ? MTT_PAID : payoutShares(game.players.length).length;
  const remaining = field ? mttRemaining(field) : game.players.filter(p => p.stack + p.totalBet > 0).length;
  const depth = (player.stack + player.streetBet) / (game.bigBlind ?? 1);
  const covers = (game.startingStacks[actor] ?? 0) >= (game.startingStacks[opponent] ?? 0);
  const adjustment = bubbleAdjustment(remaining, paid, depth, covers);
  const threshold = field && remaining > 9 ? Math.min(.95, call / (pot + call) + adjustment.riskPremium) : icmCallThreshold(fold, win, lose, payouts, actorId);
  if (threshold === null) return null;
  const opponentPosition = tablePosition(game, opponent);
  const opponentDepth = (game.startingStacks[opponent] ?? (game.players[opponent].totalBet + game.players[opponent].stack)) / (game.bigBlind ?? 1);
  const range = shoveRangePercent(opponentPosition, opponentDepth, Math.max(0, game.preflopRaises - 1), activeTableSize(game));
  const equity = equityVsShoveRange(player.hole, game.board, range, rng, field ? 80 : 240);
  return equity >= threshold ? "checkcall" : "fold";
}

function tournamentPreflopMove(game: Game, actor: number, rng: () => number, aggression: number, field?: MttField | null): Game {
  const seat = game.players[actor];
  const big = game.bigBlind ?? 1;
  const toCall = Math.max(0, game.currentBet - seat.streetBet);
  const depth = (seat.stack + seat.streetBet) / big;
  const limpers = game.players.filter((p, i) => i !== actor && /跟注/.test(p.lastAction)).length;
  const remaining = field ? mttRemaining(field) : game.players.filter(p => p.stack + p.totalBet > 0).length;
  const paid = field ? MTT_PAID : payoutShares(game.players.length).length;
  const opponents = game.players.filter((p, i) => i !== actor && !p.folded);
  const covers = opponents.length > 0 && opponents.every(p => (game.startingStacks[actor] ?? 0) >= (game.startingStacks[p.id] ?? 0));
  const adjustment = bubbleAdjustment(remaining, paid, depth, covers);
  const action = tournamentPreflopAction(seat.hole, tablePosition(game, actor), depth, activeTableSize(game), game.preflopRaises, toCall / big, limpers, aggression + adjustment.aggression, rng);
  if (action === "fold") return act(game, actor, toCall ? "fold" : "checkcall");
  if (action === "checkcall") return act(game, actor, "checkcall");
  const maxTo = seat.stack + seat.streetBet;
  if (maxTo <= game.currentBet) return act(game, actor, "checkcall");
  const target = action === "jam" ? maxTo : game.preflopRaises ? game.currentBet * 3 : (2.2 + limpers) * big;
  return act(game, actor, "raise", Math.min(maxTo, target));
}

function mttAiMove(hand: Game, actor: number, field: MttField, rng: () => number, difficulty: Difficulty): Game {
  const seat = hand.players[actor];
  const toCall = Math.max(0, hand.currentBet - seat.streetBet);
  const big = hand.bigBlind ?? 1;
  const depth = (seat.stack + seat.streetBet) / big;
  const pressure = mttRemaining(field) > MTT_PAID && mttRemaining(field) <= MTT_PAID + 7;
  const maxTo = seat.stack + seat.streetBet;
  const icmAction = tournamentAllInCall(hand, actor, field, rng);
  if (icmAction) return act(hand, actor, icmAction);
  if (hand.street === "preflop") {
    const style = ((Number(seat.name.slice(3)) * 17 || actor * 11) % 7 - 3) * .012;
    return tournamentPreflopMove(hand, actor, rng, style, field);
  }
  const pot = potTotal(hand);
  const equity = estimateEquity(hand, actor, difficulty === "casual" ? 6 : difficulty === "pro" ? 16 : 10, rng);
  const odds = toCall / Math.max(1, pot + toCall);
  const riskPremium = pressure && depth > 10 ? .055 : 0;
  if (toCall && equity + .025 < odds + riskPremium && toCall > .5 * big) return act(hand, actor, "fold");
  const opponents = hand.players.filter((player, index) => index !== actor && !player.folded).length;
  const value = equity > (opponents > 1 ? .49 : .58) + riskPremium;
  const bluff = !pressure && opponents === 1 && hasNutBlocker(seat, hand.board) && rng() < .09;
  if (maxTo > hand.currentBet && (value && rng() < .62 || bluff)) {
    const size = boardWetness(hand.board) > .55 ? .72 : .42;
    const target = toCall ? hand.currentBet + Math.max(hand.minRaise, pot * size) : seat.streetBet + Math.max(big, pot * size);
    return act(hand, actor, "raise", Math.min(maxTo, target));
  }
  return act(hand, actor, "checkcall");
}

function simulateMttTable(field: MttField, table: number, speed: TournamentSpeed, now = Date.now(), difficulty: Difficulty = "hard"): Game | null {
  const ids = field.tables[table];
  if (ids.length < 2) return null;
  const handNo = (field.tableHands?.[table] ?? 0) + 1;
  const rng = seededRandom((handNo * 2654435761 + ids.reduce((sum, id) => sum * 31 + id, 7)) >>> 0);
  const level = mttLevel(field, speed, now);
  const blinds = TOURNAMENT_BLINDS[level];
  const stacks = ids.map(id => field.stacks[id]);
  const oldDealer = field.buttons?.[table];
  const button = oldDealer === undefined ? handNo % ids.length : Math.max(0, ids.indexOf(oldDealer));
  let hand = newHand(stacks, button, handNo, rng, stacks.map(() => MAX_REBUYS), `mtt-background-${table}`, 0, blinds.small, blinds.big, level >= 2 ? blinds.big : 0, []);
  hand = { ...hand, mttSeatIds: ids, players: hand.players.map((player, seat) => ({ ...player, name: `AI ${ids[seat]}` })) };
  let actions = 0;
  while (!hand.finished && hand.turn !== null && actions++ < 350) {
    hand = mttAiMove(hand, hand.turn, field, rng, difficulty);
  }
  if (!hand.finished) throw new Error("MTT background hand did not finish");
  return hand;
}

function mttHighlight(field: MttField, table: number, hand: Game, now: number): MttHighlight | null {
  const ids = field.tables[table];
  const busts = ids.filter((id, seat) => field.stacks[id] > 0 && hand.players[seat].stack <= 0);
  const pot = hand.settledBets.reduce((sum, value) => sum + value, 0);
  const label = busts.length && mttRemaining(field) <= MTT_PAID + 6 ? "錢圈關鍵淘汰" : busts.length ? "玩家出局" : field.tables.length === 1 ? "決賽桌" : pot >= Math.max(35, (hand.bigBlind ?? 1) * 25) ? "大底池" : "";
  if (!label) return null;
  return { id: `${table}-${hand.handNo}-${now}`, table: table + 1, handNo: hand.handNo, at: now, label,
    ids, starting: hand.startingStacks, ending: hand.players.map(player => player.stack),
    holes: hand.players.map(player => player.hole), board: hand.board,
    actions: hand.timeline.map(frame => `${STREET_LABEL[frame.street]} · ${frame.action}`).slice(-75),
    winners: hand.winners.map(seat => ids[seat]), potSummary: hand.potSummary, busts };
}

function withMttHighlights(field: MttField, highlights: Array<MttHighlight | null>): MttField {
  const added = highlights.filter((record): record is MttHighlight => !!record);
  return added.length ? { ...field, highlights: [...added.reverse(), ...(field.highlights ?? [])].slice(0, 40) } : field;
}

function mttHandForHand(field: MttField) {
  const remaining = mttRemaining(field);
  return remaining > MTT_PAID && remaining <= MTT_PAID + 8 || remaining === 9;
}

function advanceMttBackground(field: MttField, speed: TournamentSpeed, now = Date.now(), difficulty: Difficulty = "hard"): MttField {
  const ticked = mttClockTick(field, now, true);
  if (mttHandForHand(ticked)) return ticked;
  const eligible = ticked.tables.map((table, index) => index > 0 && table.length > 1 ? index : -1).filter(index => index > 0);
  const cursor = (ticked.backgroundCursor ?? 0) % Math.max(1, eligible.length);
  const selected = new Set(Array.from({ length: Math.min(4, eligible.length) }, (_, offset) => eligible[(cursor + offset) % eligible.length]));
  const games = ticked.tables.map((_, table) => selected.has(table) ? simulateMttTable(ticked, table, speed, now, difficulty) : null);
  const outcomes = games.flatMap((hand, table) => hand ? [{ table, ids: ticked.tables[table], stacks: hand.players.map(player => player.stack) }] : []);
  const settled = outcomes.length ? completeMttBatch(ticked, outcomes, ticked.handNo) : ticked;
  return withMttHighlights({ ...settled, backgroundCursor: cursor + selected.size }, games.map((hand, table) => hand && mttHighlight(ticked, table, hand, now)));
}

function advanceMttField(field: MttField, speed: TournamentSpeed, heroHand?: Game, difficulty: Difficulty = "hard"): MttField {
  const now = Date.now();
  const ticked = mttClockTick(field, now, false);
  if (heroHand && !mttHandForHand(field)) {
    const settled = completeMttBatch(ticked, [{ table: 0, ids: ticked.tables[0], stacks: heroHand.players.map(player => player.stack) }]);
    return rebalanceMttField(settled);
  }
  const games = ticked.tables.map((_, table) => heroHand && table === 0 ? null : simulateMttTable(ticked, table, speed, now, difficulty));
  const outcomes = ticked.tables.map((ids, table) => ({ ids, stacks: heroHand && table === 0 ? heroHand.players.map(player => player.stack) : games[table]?.players.map(player => player.stack) ?? ids.map(id => ticked.stacks[id]) }));
  const settled = completeMttRound(ticked, outcomes);
  return withMttHighlights(settled, games.map((hand, table) => hand && mttHighlight(ticked, table, hand, now)));
}

function allInEvDelta(game: Game) {
  const actualDelta = game.players[0].stack - game.startingStacks[0];
  if (game.allInBoard === null || game.players[0].folded || !game.settledBets.length || game.allInCap <= 0 || game.board.length < 5) {
    return { actualDelta, adjustedDelta: actualDelta, hadAllIn: false };
  }
  const capped = game.settledBets.map((amount, index) => Math.min(amount - (index === game.bb ? game.bigBlindAntePaid ?? 0 : 0), game.allInCap) + (index === game.bb ? game.bigBlindAntePaid ?? 0 : 0));
  const allLayers = potsWithBigBlindAnte(capped, game.players.map(player => player.folded), game.bb, game.bigBlindAntePaid ?? 0);
  const layers = allLayers
    .filter(layer => layer.eligible.includes(0) && layer.eligible.length > 1);
  if (!layers.length) return { actualDelta, adjustedDelta: actualDelta, hadAllIn: false };

  const heroPayout = (board: Card[]) => {
    const scores = game.players.map(player => player.folded ? null : bestScore([...player.hole, ...board]));
    return layers.reduce((total, layer) => {
      let winners = [layer.eligible[0]];
      for (const index of layer.eligible.slice(1)) {
        const comparison = compareScore(scores[index] ?? [-1], scores[winners[0]] ?? [-1]);
        if (comparison > 0) winners = [index]; else if (comparison === 0) winners.push(index);
      }
      return total + (winners.includes(0) ? layer.amount / winners.length : 0);
    }, 0);
  };

  const actualPayout = heroPayout(game.board);
  const missing = 5 - game.allInBoard.length;
  let expectedPayout = actualPayout;
  if (missing > 0) {
    const known = [
      ...game.allInBoard,
      ...game.players.filter(player => !player.folded).flatMap(player => player.hole),
    ];
    const rng = seededRandom(game.handNo * 7919 + game.allInCap * 100 + game.players.length * 97);
    const available = makeDeck(rng).filter(card => !known.some(seen => cardKey(seen) === cardKey(card)));
    const trials = 720;
    let payoutTotal = 0;
    for (let trial = 0; trial < trials; trial++) {
      const runout = shuffle(available, rng).slice(0, missing);
      payoutTotal += heroPayout([...game.allInBoard, ...runout]);
    }
    expectedPayout = payoutTotal / trials;
  }
  return { actualDelta, adjustedDelta: actualDelta + expectedPayout - actualPayout, hadAllIn: true };
}

function estimateEquity(game: Game, actor: number, trials = 42, rng: () => number = Math.random) {
  const seat = game.players[actor];
  const opponentCount = game.players.filter((player, index) => index !== actor && !player.folded).length;
  const known = [...seat.hole, ...game.board];
  const available = makeDeck(rng).filter(card => !known.some(seen => cardKey(seen) === cardKey(card)));
  let points = 0;
  for (let trial = 0; trial < trials; trial++) {
    const sample = shuffle(available, rng);
    let cursor = 0;
    const opponentHoles: Card[][] = [];
    for (let i = 0; i < opponentCount; i++) { opponentHoles.push(sample.slice(cursor, cursor + 2)); cursor += 2; }
    const board = [...game.board, ...sample.slice(cursor, cursor + 5 - game.board.length)];
    const ourScore = bestScore([...seat.hole, ...board]);
    const opponentScores = opponentHoles.map(hole => bestScore([...hole, ...board]));
    let bestOpponent = opponentScores[0] ?? [-1];
    opponentScores.slice(1).forEach(score => { if (compareScore(score, bestOpponent) > 0) bestOpponent = score; });
    const comparison = compareScore(ourScore, bestOpponent);
    if (comparison > 0) points += 1;
    else if (comparison === 0) points += 1 / (opponentScores.filter(score => compareScore(score, ourScore) === 0).length + 1);
  }
  return points / trials;
}

function positionBonus(game: Game, actor: number) {
  if (actor === game.button) return 0.18;
  if (actor === game.sb) return 0.11;
  if (actor === game.bb) return 0.07;
  const live = game.players.filter(player => !player.folded).length;
  let cursor = game.bb;
  for (let step = 1; step <= game.players.length; step++) {
    cursor = (cursor + 1) % game.players.length;
    if (game.players[cursor].folded) continue;
    if (cursor === actor) return 0.03 + (step / Math.max(2, live)) * 0.11;
  }
  return 0.03;
}

function tablePosition(game: Game, actor: number) {
  return getTablePosition(game.players.map(player => player.lastAction !== "OUT"), game.button, actor);
}

function activeTableSize(game: Game) {
  return game.players.filter(player => player.lastAction !== "OUT").length;
}

function displayPosition(game: Game, actor: number) {
  if (activeTableSize(game) === 2 && actor === game.button) return "BTN/SB";
  return tablePosition(game, actor);
}

function coachGrade(score: number): CoachGrade {
  if (score >= 90) return "最佳";
  if (score >= 72) return "合理";
  if (score >= 48) return "可疑";
  return "失誤";
}

function suggestedRaiseTarget(game: Game) {
  const seat = game.players[0];
  const pot = potTotal(game);
  const maxTo = seat.streetBet + seat.stack;
  if (game.street === "preflop") {
    if (game.preflopRaises === 0) return Math.min(maxTo, 2.5);
    if (game.preflopRaises === 1) return Math.min(maxTo, game.currentBet * (tablePosition(game, 0) === "SB" || tablePosition(game, 0) === "BB" ? 3.8 : 3.15));
    return Math.min(maxTo, game.currentBet * 2.35);
  }
  const wetness = boardWetness(game.board);
  const fraction = wetness < .34 ? .33 : wetness > .64 ? .78 : .55;
  return chip(Math.min(maxTo, game.currentBet + Math.max(game.minRaise, pot * fraction)));
}

function preflopActionQuality(game: Game, action: HeroAction) {
  const seat = game.players[0];
  const toCall = Math.max(0, game.currentBet - seat.streetBet);
  const position = tablePosition(game, 0);
  const limpers = game.players.filter((player, index) => index !== 0 && /跟注/.test(player.lastAction)).length;
  const advice = getPreflopAdvice(seat.hole, position, game.preflopRaises, toCall, limpers, activeTableSize(game));
  const recommended: HeroAction = advice.action === "fold" ? "fold" : advice.action === "call" || advice.action === "check" ? "checkcall" : "raise";
  if (action === recommended) return { quality: 100, advice };
  if (recommended === "raise" && action === "checkcall") return { quality: advice.score >= .84 ? 55 : 76, advice };
  if (recommended === "checkcall" && action === "fold") return { quality: 58, advice };
  if (recommended === "fold" && action === "checkcall") return { quality: advice.mixedBluff ? 66 : 30, advice };
  if (recommended === "fold" && action === "raise") return { quality: advice.mixedBluff ? 75 : 24, advice };
  if (recommended === "checkcall" && action === "raise") return { quality: 64, advice };
  return { quality: 42, advice };
}

function estimateActionEvs(game: Game, requestedTarget = 0): ActionEv[] {
  const seat = game.players[0];
  const pot = potTotal(game);
  const toCall = Math.max(0, game.currentBet - seat.streetBet);
  const target = requestedTarget > game.currentBet ? Math.min(seat.streetBet + seat.stack, requestedTarget) : suggestedRaiseTarget(game);
  const labels: Record<HeroAction, string> = { fold: "Fold", checkcall: toCall > 0 ? "Call" : "Check", raise: game.currentBet > 0 ? "Raise" : "Bet" };
  const sizes: Record<HeroAction, string> = { fold: "", checkcall: toCall > 0 ? `${fmt(Math.min(toCall, seat.stack))}BB` : "", raise: `${fmt(target)}BB` };
  let raw: Record<HeroAction, number>;
  let confidence: ActionEv["confidence"] = "高";

  if (game.street === "preflop") {
    const qualities = {
      fold: preflopActionQuality(game, "fold").quality,
      checkcall: preflopActionQuality(game, "checkcall").quality,
      raise: preflopActionQuality(game, "raise").quality,
    };
    const advice = preflopActionQuality(game, "fold").advice;
    const recommended: HeroAction = advice.action === "fold" ? "fold" : advice.action === "call" || advice.action === "check" ? "checkcall" : "raise";
    const weight = Math.max(.5, Math.min(10, toCall + pot * .34));
    const bestBase = recommended === "fold" ? 0 : Math.max(.08, weight * (.24 + Math.max(0, advice.score - .45) * .82));
    raw = {
      fold: 0,
      checkcall: bestBase - (100 - qualities.checkcall) / 100 * weight,
      raise: bestBase - (100 - qualities.raise) / 100 * weight,
    };
    if (recommended === "fold") raw.fold = 0;
    else if (recommended === "checkcall") raw.checkcall = bestBase;
    else raw.raise = bestBase;
  } else {
    const opponents = game.players.filter((player, index) => index !== 0 && !player.folded).length;
    const equity = estimateEquity(game, 0, opponents > 1 ? 120 : 180);
    const blocker = hasNutBlocker(seat, game.board);
    const wetness = boardWetness(game.board);
    const risk = Math.max(toCall, Math.min(seat.stack, Math.max(0, target - seat.streetBet)));
    const extraOpponentCall = Math.max(0, target - game.currentBet);
    const calledPot = pot + risk + extraOpponentCall;
    const continueEv = toCall > 0 ? equity * (pot + toCall) - toCall : equity * pot * (game.street === "river" ? 1 : .82);
    const pressure = Math.min(.7, risk / Math.max(1, pot));
    const foldEquity = Math.max(.05, Math.min(.52, .13 + pressure * .24 + (blocker ? .08 : 0) - wetness * .05 - Math.max(0, opponents - 1) * .055));
    const showdownEv = equity * calledPot - risk;
    const raiseEv = foldEquity * pot + (1 - foldEquity) * showdownEv;
    raw = { fold: 0, checkcall: continueEv, raise: raiseEv };
    confidence = opponents > 1 ? "低" : game.street === "river" ? "中" : "中";
  }

  const bestEv = Math.max(raw.fold, raw.checkcall, raw.raise);
  return (["fold", "checkcall", "raise"] as HeroAction[]).map(action => ({
    action,
    label: labels[action],
    ev: Math.round(raw[action] * 100) / 100,
    loss: Math.round(Math.max(0, bestEv - raw[action]) * 100) / 100,
    best: Math.abs(raw[action] - bestEv) < .005,
    size: sizes[action],
    confidence,
  }));
}

function rateHeroDecision(game: Game, action: HeroAction, _target = 0): CoachReview {
  const toCall = Math.max(0, game.currentBet - game.players[0].streetBet);
  const label = action === "fold" ? "棄牌" : action === "raise" ? "加注" : toCall > 0 ? "跟注" : "過牌";
  return { id: `${game.tableId}-${game.handNo}-${game.actionId}-${action}`, grade: "合理", score: 0, title: `${STREET_LABEL[game.street]} · ${label}`, detail: `你選擇${label}。`, evLoss: 0, street: game.street, actionId: game.actionId, action, position: tablePosition(game, 0) };
}

function boardWetness(board: Card[]) {
  if (board.length < 3) return 0;
  const suitCounts = SUITS.map(suit => board.filter(card => card.suit === suit).length);
  const ranks = [...new Set(board.map(card => card.rank))].sort((a, b) => a - b);
  if (ranks.includes(14)) ranks.unshift(1);
  let connected = 0;
  for (let index = 1; index < ranks.length; index++) if (ranks[index] - ranks[index - 1] <= 2) connected += 1;
  const paired = board.length - new Set(board.map(card => card.rank)).size;
  return Math.max(0, Math.min(1, (Math.max(...suitCounts) - 1) * 0.24 + connected * 0.14 - paired * 0.08));
}

function hasNutBlocker(seat: Seat, board: Card[]) {
  if (!board.length) return false;
  const dominantSuit = [...SUITS].sort((a, b) => board.filter(card => card.suit === b).length - board.filter(card => card.suit === a).length)[0];
  return board.filter(card => card.suit === dominantSuit).length >= 2 && seat.hole.some(card => card.rank === 14 && card.suit === dominantSuit);
}

function buildGtoHint(game: Game): GtoHint {
  const seat = game.players[0];
  const pot = potTotal(game);
  const toCall = Math.max(0, game.currentBet - seat.streetBet);
  const maxTo = seat.streetBet + seat.stack;
  const canRaise = maxTo > game.currentBet;

  if (game.street === "preflop") {
    const position = tablePosition(game, 0);
    const limpers = game.players.filter((player, index) => index !== 0 && /跟注/.test(player.lastAction)).length;
    const advice = getPreflopAdvice(seat.hole, position, game.preflopRaises, toCall, limpers, activeTableSize(game));
    const callers = game.players.filter((player, index) => index !== 0 && !player.folded && player.streetBet === game.currentBet).length;
    let size = "";
    if (advice.action === "raise") size = `建議至 ${fmt(Math.min(maxTo, (2.5 + limpers) * (game.bigBlind ?? 1)))} ${game.tournamentFinishes ? "籌碼" : "BB"}`;
    else if (advice.action === "threeBet") size = `建議至 ${fmt(Math.min(maxTo, game.currentBet * (position === "SB" || position === "BB" ? 3.8 : 3.15) + callers * (game.bigBlind ?? 1)))} ${game.tournamentFinishes ? "籌碼" : "BB"}`;
    else if (advice.action === "fourBet") size = `建議至 ${fmt(Math.min(maxTo, game.currentBet * 2.35))} BB`;
    else if (advice.action === "jam") size = `全押 ${fmt(maxTo)} BB`;
    else if (advice.action === "call") size = `跟注 ${fmt(Math.min(toCall, seat.stack))} BB`;
    return {
      handNo: game.handNo, actionId: game.actionId, action: advice.label, size,
      title: `${position} · ${advice.hand} · 翻牌前主策略`,
      detail: `${advice.reason}。${advice.mixedBluff ? "呢類牌屬混合頻率組合，實戰可以按對手傾向調整。" : "現時建議採用主要頻率行動。"}`,
      metrics: [`位置 ${position}`, `起手牌 ${advice.hand}`, `Open range ${advice.openPercent}%`],
      evs: [],
    };
  }

  const equity = estimateEquity(game, 0, 180);
  const potOdds = toCall / Math.max(0.01, pot + toCall);
  const blocker = hasNutBlocker(seat, game.board);
  const wetness = boardWetness(game.board);
  const opponentStacks = game.players.filter((player, index) => index !== 0 && !player.folded).map(player => player.stack);
  const effectiveStack = Math.min(seat.stack, ...(opponentStacks.length ? opponentStacks : [seat.stack]));
  const spr = effectiveStack / Math.max(1, pot);
  let action = "過牌";
  let size = "";
  let detail = "保留較弱 range，避免過度下注。";

  if (toCall > 0) {
    if (equity + (blocker ? 0.025 : 0) < potOdds - 0.02) {
      action = "棄牌";
      detail = "估算勝率低於所需 pot odds，繼續會令長期 EV 受損。";
    } else if (canRaise && equity > Math.max(0.56, 0.67 - game.players.filter(player => !player.folded).length * 0.025)) {
      const fraction = wetness > 0.6 ? 0.78 : 0.55;
      const target = Math.min(maxTo, game.currentBet + Math.max(game.minRaise, pot * fraction));
      action = "加注";
      size = `建議至 ${fmt(chip(target))} BB`;
      detail = wetness > 0.6 ? "濕潤牌面需要較大尺度收取聽牌價值。" : "牌力及 range 優勢足以作價值加注。";
    } else {
      action = "跟注";
      size = `跟注 ${fmt(Math.min(toCall, seat.stack))} BB`;
      detail = blocker ? "勝率足夠，加上關鍵 blocker，適合保留對手 bluff。" : "估算勝率達到繼續門檻，但未需要擴大底池。";
    }
  } else if (canRaise && equity > 0.54) {
    const fraction = wetness < 0.34 ? 0.33 : wetness > 0.64 ? 0.75 : 0.55;
    action = "下注";
    size = `建議 ${fmt(chip(Math.min(seat.stack, Math.max(1, pot * fraction))))} BB（${Math.round(fraction * 100)}% 池）`;
    detail = wetness < 0.34 ? "乾燥牌面適合細尺度、高頻率下注。" : wetness > 0.64 ? "牌面連接度高，使用較大尺度保護及取值。" : "中等尺度可以兼顧價值與 bluff range。";
  } else if (blocker && equity < 0.34) {
    action = "過牌為主";
    size = "可混合約 25% 頻率、33% 池 bluff";
    detail = "持有關鍵 blocker，可以將少量組合加入 bluff，但主策略仍然係過牌。";
  }

  return {
    handNo: game.handNo, actionId: game.actionId, action, size,
    title: `${STREET_LABEL[game.street]} · GTO 參考線`, detail,
    metrics: [`Equity ${Math.round(equity * 100)}%`, `Pot odds ${Math.round(potOdds * 100)}%`, `SPR ${spr.toFixed(1)}`, `牌面濕度 ${Math.round(wetness * 100)}%${blocker ? " · Blocker" : ""}`],
    evs: [],
  };
}

const AI_PERSONALITIES = [
  { name: "阿火", style: "激進進取", aggression: 0.12, caution: -0.06 },
  { name: "阿石", style: "耐心保守", aggression: -0.08, caution: 0.08 },
  { name: "阿浪", style: "喜歡跟注", aggression: 0.02, caution: -0.1 },
  { name: "阿鋒", style: "伺機施壓", aggression: 0.07, caution: 0.02 },
  { name: "阿明", style: "穩健觀察", aggression: -0.02, caution: 0.03 },
  { name: "阿豹", style: "大膽偷池", aggression: 0.1, caution: -0.02 },
  { name: "阿靜", style: "謹慎防守", aggression: -0.06, caution: 0.06 },
];
function personality(actor: number) { return AI_PERSONALITIES[(actor - 1) % AI_PERSONALITIES.length]; }

function aiMove(game: Game, actor: number, difficulty: Difficulty, field?: MttField | null): Game {
  const icmAction = tournamentAllInCall(game, actor, field);
  if (icmAction) return act(game, actor, icmAction);
  if (game.tournamentFinishes && game.street === "preflop") return tournamentPreflopMove(game, actor, Math.random, personality(actor).aggression, field);
  const seat = game.players[actor];
  const pot = potTotal(game);
  const toCall = Math.max(0, game.currentBet - seat.streetBet);
  const potOdds = toCall / Math.max(0.01, pot + toCall);
  const maxTo = seat.streetBet + seat.stack;
  const canRaise = maxTo > game.currentBet;
  const opponents = game.players.filter((player, index) => index !== actor && !player.folded).length;
  const random = Math.random();
  const character = personality(actor);

  if (game.street === "preflop") {
    const position = tablePosition(game, actor);
    const limpers = game.players.filter((player, index) => index !== actor && /跟注/.test(player.lastAction)).length;
    const advice = getPreflopAdvice(seat.hole, position, game.preflopRaises, toCall, limpers, activeTableSize(game));

    if (canRaise && advice.action === "fold" && random < Math.max(0, character.aggression) * 0.35 && toCall <= (game.bigBlind ?? 1) * 3) return act(game, actor, "raise", Math.min(maxTo, game.currentBet * 3));
    if (toCall > 0 && advice.action === "fold" && random < Math.max(0, -character.caution) * 0.7) return act(game, actor, "checkcall");
    if (difficulty === "casual") {
      if (toCall > 0.5 && advice.score < 0.43 && random > 0.24) return act(game, actor, "fold");
      if (canRaise && advice.score > 0.78 && random < 0.42) {
        const target = game.preflopRaises ? game.currentBet * 2.5 : 3 * (game.bigBlind ?? 1);
        return act(game, actor, "raise", Math.min(maxTo, target));
      }
      return act(game, actor, "checkcall");
    }

    const mixedFrequencyMiss = advice.mixedBluff && advice.action === "threeBet" && random > (difficulty === "pro" ? 0.46 : 0.3);
    const strategyMistake = difficulty === "hard" && random < 0.075;
    if (advice.action === "fold") return toCall === 0 || strategyMistake ? act(game, actor, "checkcall") : act(game, actor, "fold");
    if (advice.action === "check" || advice.action === "call" || mixedFrequencyMiss) return act(game, actor, "checkcall");
    if (!canRaise) return act(game, actor, "checkcall");
    const callers = game.players.filter((player, index) => index !== actor && !player.folded && player.streetBet === game.currentBet).length;
    const target = advice.action === "jam" ? maxTo
      : advice.action === "fourBet" ? game.currentBet * 2.35
      : advice.action === "threeBet" ? game.currentBet * (position === "SB" || position === "BB" ? 3.8 : 3.15) + callers
      : (2.5 + limpers) * (game.bigBlind ?? 1);
    return act(game, actor, "raise", Math.min(maxTo, target));
  }

  const trials = difficulty === "casual" ? 18 : difficulty === "hard" ? 64 : 140;
  let equity = estimateEquity(game, actor, trials);
  const wetness = boardWetness(game.board);
  const blocker = hasNutBlocker(seat, game.board);
  const effectiveStack = Math.min(seat.stack, ...game.players.filter((player, index) => index !== actor && !player.folded).map(player => player.stack));
  const spr = effectiveStack / Math.max(1, pot);
  const latePosition = positionBonus(game, actor) >= 0.11;
  const pressure = game.players.filter((player, index) => index !== actor && !player.folded && /加注|ALL-IN/.test(player.lastAction)).length;

  equity -= character.caution;
  if (difficulty === "casual") equity = Math.max(0, Math.min(1, equity + (random - 0.5) * 0.22));
  if (difficulty === "hard") equity -= pressure * 0.015;
  if (difficulty === "pro") equity += (latePosition ? 0.018 : 0) - pressure * 0.012;

  if (toCall > 0) {
    const foldMargin = difficulty === "casual" ? 0.72 : difficulty === "hard" ? 0.94 : 1.02;
    const bluffCatch = difficulty === "pro" && blocker ? 0.035 : 0;
    if (equity + bluffCatch < potOdds * foldMargin && random > (difficulty === "casual" ? 0.17 : 0.045) && toCall > 0.5) return act(game, actor, "fold");
    const strong = equity > Math.max(difficulty === "pro" ? 0.43 : 0.47, 0.69 - opponents * 0.045);
    const bluffRaise = difficulty === "pro" && blocker && equity < 0.38 && random < 0.105;
    const hardBluff = difficulty === "hard" && random < 0.025;
    if (canRaise && (strong || bluffRaise || hardBluff)) {
      const size = difficulty === "casual" ? 0.42 : difficulty === "hard" ? (wetness > 0.55 ? 0.68 : 0.5) : wetness > 0.62 ? 0.8 : 0.55;
      const jam = strong && spr < 1.15 && equity > 0.58;
      const target = jam ? maxTo : Math.min(maxTo, game.currentBet + Math.max(game.minRaise, pot * size));
      return act(game, actor, "raise", target);
    }
    return act(game, actor, "checkcall");
  }

  const valueThreshold = Math.max(difficulty === "pro" ? 0.31 : 0.35, 0.58 - opponents * 0.04);
  const valueBet = equity > valueThreshold;
  const bluffFrequency = Math.max(0.005, (difficulty === "casual" ? 0.018 : difficulty === "hard" ? 0.05 : blocker ? 0.14 : 0.035) + character.aggression);
  if (canRaise && (valueBet || random < bluffFrequency)) {
    let size = difficulty === "casual" ? 0.42 : difficulty === "hard" ? (wetness > 0.55 ? 0.7 : 0.45) : wetness < 0.34 ? 0.33 : wetness > 0.64 ? 0.78 : 0.55;
    if (difficulty === "pro" && game.street === "river" && (equity > 0.72 || blocker && equity < 0.3)) size = 1.08;
    const target = Math.min(maxTo, Math.max(game.currentBet + game.minRaise, seat.streetBet + Math.max(1, pot * size)));
    return act(game, actor, "raise", target);
  }
  return act(game, actor, "checkcall");
}

function recordAiStudyDecision(before: Game, after: Game, actor: number, difficulty: Difficulty): Game {
  if (after === before || after.actionId === before.actionId) return after;
  const frame = after.timeline[before.timeline.length] ?? after.timeline[after.timeline.length - 1];
  const action = frame?.action ?? `${before.players[actor].name} 完成行動`;
  const position = tablePosition(before, actor);
  const seat = before.players[actor];
  let title = `${position} · ${action.replace(`${seat.name}`, "").trim()}`;
  let detail = "AI根據自己range、底池賠率及目前難度嘅混合頻率作出決定。";
  let range = `${position} range`;
  let metrics: string[] = [`難度 ${DIFFICULTY_INFO[difficulty].label}`];

  if (before.street === "preflop" && before.tournamentFinishes) {
    const depth = (seat.stack + seat.streetBet) / (before.bigBlind ?? 1);
    title = `${position} · ${action.replace(`${seat.name}`, "").trim()}`;
    range = "錦標賽啟發式範圍";
    detail = "決策參考位置、籌碼深度及加注情況；部分單挑全押會考慮對手範圍及獎金結構。";
    metrics = [`位置 ${position}`, `籌碼 ${fmt(depth)} BB`, ...metrics];
  } else if (before.street === "preflop") {
    const toCall = Math.max(0, before.currentBet - seat.streetBet);
    const limpers = before.players.filter((player, index) => index !== actor && /跟注/.test(player.lastAction)).length;
    const advice = getPreflopAdvice(seat.hole, position, before.preflopRaises, toCall, limpers, activeTableSize(before));
    title = `${position} · ${advice.hand} · ${action.replace(`${seat.name}`, "").trim()}`;
    range = `${advice.reason}；主策略：${advice.label}`;
    const actualGroup = action.includes("棄牌") ? "fold" : action.includes("跟注") || action.includes("過牌") ? "continue" : "raise";
    const advisedGroup = advice.action === "fold" ? "fold" : advice.action === "call" || advice.action === "check" ? "continue" : "raise";
    detail = actualGroup === advisedGroup
      ? `實際行動符合主要range。${advice.mixedBluff ? "呢個組合亦會按頻率混合其他行動。" : "牌力落在目前位置嘅主要繼續範圍。"}`
      : `實際行動偏離主要策略，屬於${DIFFICULTY_INFO[difficulty].label}模式嘅混合頻率或exploit調整。`;
    metrics = [`手牌 ${advice.hand}`, `Open range ${advice.openPercent}%`, `Range分數 ${Math.round(advice.score * 100)}`, ...metrics];
  } else {
    const pot = potTotal(before);
    const toCall = Math.max(0, before.currentBet - seat.streetBet);
    const potOdds = toCall / Math.max(0.01, pot + toCall);
    const equity = estimateEquity(before, actor, 48);
    const wetness = boardWetness(before.board);
    const blocker = hasNutBlocker(seat, before.board);
    const opponents = before.players.filter((player, index) => index !== actor && !player.folded).map(player => player.stack);
    const spr = Math.min(seat.stack, ...(opponents.length ? opponents : [seat.stack])) / Math.max(1, pot);
    range = `${STREET_LABEL[before.street]} range · ${HAND_LABEL[bestScore([...seat.hole, ...before.board])[0]]}`;
    detail = action.includes("棄牌") ? "估算勝率未達繼續門檻，保留較強嘅繼續range。"
      : action.includes("跟注") || action.includes("過牌") ? "保留中等牌力及bluff-catcher，避免將range過度擴大。"
      : blocker && equity < 0.42 ? "持有關鍵blocker，因此把部分組合加入混合bluff。"
      : wetness > 0.6 ? "濕潤牌面使用較大尺度，向聽牌收取價值並保護range。"
      : "牌力或range優勢足以主動下注，尺度按SPR及牌面結構調整。";
    metrics = [`Equity ${Math.round(equity * 100)}%`, `Pot odds ${Math.round(potOdds * 100)}%`, `SPR ${spr.toFixed(1)}`, `牌面濕度 ${Math.round(wetness * 100)}%${blocker ? " · Blocker" : ""}`, ...metrics];
  }
  const decision: AiStudyDecision = {
    id: `${before.tableId}-${before.handNo}-${before.actionId}-${actor}`,
    actor, street: before.street, actionId: before.actionId, action, title, detail, range, metrics,
  };
  return { ...after, aiDecisions: [...(before.aiDecisions ?? []), decision] };
}

type AofTheme = "emerald" | "neon" | "royal" | "midnight";
type AofHighlight = { id: string; hand: number; title: string; detail: string; tone: "gold" | "red" | "green" };
type AofBoss = { id: string; name: string; title: string; seat: number; style: string; pushDelta: number; callDelta: number };
type AofCollectionEntry = { dealt: number; wins: number; lastHand: number; lastWinHand?: number };
type AofState = {
  revealStep?: number; game: Game; profits: ProfitPoint[];
  stats: Array<{ hands: number; profit: number; pushes: number; calls: number; pushOpportunities: number; callOpportunities: number }>;
  lives?: number[]; runNo?: number; runHands?: number; runFinished?: boolean; foldReveal?: boolean;
  xp?: number; streak?: number; bestStreak?: number; theme?: AofTheme; unlockedThemes?: AofTheme[]; highlights?: AofHighlight[];
  bossActive?: boolean; bossStage?: number; bossTrophies?: string[]; bossCycles?: number; bossLastResult?: "win" | "loss" | "complete"; bossLastStage?: number;
  collection?: Record<string,AofCollectionEntry>;
};

const AOF_MAX_LIVES = 3;
const AOF_ANTE = .25;
const AOF_THEMES: Array<{ id: AofTheme; label: string; unlock: number }> = [
  { id: "emerald", label: "翡翠牌桌", unlock: 0 },
  { id: "neon", label: "霓虹牌桌", unlock: 30 },
  { id: "royal", label: "皇家牌桌", unlock: 75 },
  { id: "midnight", label: "午夜牌桌", unlock: 140 },
];
const AOF_RANKS = [14,13,12,11,10,9,8,7,6,5,4,3,2];
const AOF_BOSSES: AofBoss[] = [
  { id: "stone", name: "石牆", title: "守門人", seat: 1, style: "耐心等強牌，面對 All-in 會收緊跟注。", pushDelta: .035, callDelta: .055 },
  { id: "fox", name: "赤狐", title: "追獵者", seat: 2, style: "未有人入池時主動施壓，但多人亂戰會回歸紀律。", pushDelta: -.055, callDelta: .015 },
  { id: "king", name: "夜王", title: "終局者", seat: 3, style: "推牌與跟注接近平衡，弱點最少。", pushDelta: -.012, callDelta: -.012 },
];

function aofHandKey(hole: Card[]) {
  if (hole.length < 2) return "";
  const [high,low] = [...hole].sort((a,b) => b.rank-a.rank);
  const highLabel = RANK_LABEL[high.rank] ?? `${high.rank}`;
  const lowLabel = RANK_LABEL[low.rank] ?? `${low.rank}`;
  return high.rank === low.rank ? `${highLabel}${lowLabel}` : `${highLabel}${lowLabel}${high.suit === low.suit ? "s" : "o"}`;
}

function aofMatrixKey(row: number, column: number) {
  const first = AOF_RANKS[row];
  const second = AOF_RANKS[column];
  if (first === second) return `${RANK_LABEL[first] ?? first}${RANK_LABEL[second] ?? second}`;
  const high = Math.max(first,second);
  const low = Math.min(first,second);
  return `${RANK_LABEL[high] ?? high}${RANK_LABEL[low] ?? low}${row < column ? "s" : "o"}`;
}

function aofCollectDeal(collection: Record<string,AofCollectionEntry> | undefined, hole: Card[], handNo: number) {
  const key = aofHandKey(hole);
  if (!key) return collection ?? {};
  const current = collection?.[key] ?? { dealt: 0, wins: 0, lastHand: -1 };
  if (current.lastHand === handNo) return collection ?? { [key]: current };
  return { ...(collection ?? {}), [key]: { ...current, dealt: current.dealt+1, lastHand: handNo } };
}

function aofCollectResult(collection: Record<string,AofCollectionEntry> | undefined, hole: Card[], handNo: number, won: boolean) {
  const withDeal = aofCollectDeal(collection,hole,handNo);
  const key = aofHandKey(hole);
  if (!won || !key) return withDeal;
  const current = withDeal[key];
  if (current.lastWinHand === handNo) return withDeal;
  return { ...withDeal, [key]: { ...current, wins: current.wins+1, lastWinHand: handNo } };
}

function aofBoss(state: AofState) {
  return state.bossActive ? AOF_BOSSES[Math.max(0,Math.min(AOF_BOSSES.length-1,state.bossStage ?? 0))] : null;
}

function aofLives(state: AofState) {
  return Array.from({ length: 4 }, (_, index) => Math.max(0, Math.min(AOF_MAX_LIVES, state.lives?.[index] ?? AOF_MAX_LIVES)));
}

function aofUnlocked(xp: number) {
  return AOF_THEMES.filter(theme => xp >= theme.unlock).map(theme => theme.id);
}

function newAof(): AofState {
  const game = newHand([8,8,8,8], 0, 1, Math.random, [0,0,0,0], undefined, AOF_ANTE);
  return {
    game, profits: [], lives: [3,3,3,3], runNo: 1, runHands: 0,
    runFinished: false, foldReveal: false, xp: 0, streak: 0, bestStreak: 0, theme: "emerald", unlockedThemes: ["emerald"], highlights: [],
    bossActive: false, bossStage: 0, bossTrophies: [], bossCycles: 0, collection: aofCollectDeal({},game.players[0].hole,game.handNo),
    stats: Array.from({ length: 4 }, () => ({ hands: 0, profit: 0, pushes: 0, calls: 0, pushOpportunities: 0, callOpportunities: 0 })),
  };
}

// AOF uses only own cards, seat and public actions. This is a short-stack heuristic, not a solved equilibrium.
function aofDecision(game: Game, actor: number, boss?: AofBoss | null) {
  const [high, low] = [...game.players[actor].hole].sort((a,b) => b.rank-a.rank);
  const pair = high.rank === low.rank;
  const suited = high.suit === low.suit;
  const strength = pair ? .54 + high.rank / 32 : high.rank / 28 + low.rank / 50 + (suited ? .06 : 0) + (high.rank-low.rank <= 2 ? .025 : 0);
  const shoves = game.players.filter(p => p.allIn && !p.folded).length;
  const position = tablePosition(game, actor);
  const actorStart = game.startingStacks[actor] ?? game.players[actor].stack+game.players[actor].totalBet;
  const opponentStarts = game.startingStacks.filter((stack,index) => index !== actor && stack > 0 && !game.players[index].folded);
  const effectiveStack = Math.min(actorStart,Math.max(...opponentStarts,actorStart));
  const stackAdjustment = effectiveStack <= 3 ? -.12 : effectiveStack <= 5 ? -.075 : effectiveStack >= 16 ? .075 : effectiveStack >= 12 ? .04 : 0;
  const anteAdjustment = (game.ante ?? 0) > 0 ? -.035 : 0;
  const toCall = Math.max(0,game.currentBet-game.players[actor].streetBet);
  const potOdds = toCall > 0 ? toCall/(potTotal(game)+toCall) : 0;
  const priceAdjustment = shoves && potOdds > 0 && potOdds < .3 ? -.035 : 0;
  const bossAdjustment = boss?.seat === actor ? shoves ? boss.callDelta : boss.pushDelta : 0;
  const threshold = (shoves ? .68 + (shoves-1)*.07 : position === "SB" ? .46 : position === "BTN" ? .55 : .62) + bossAdjustment + stackAdjustment + anteAdjustment + priceAdjustment;
  const pressure = effectiveStack <= 3 ? `有效籌碼只剩 ${fmt(effectiveStack)}BB，Ante 壓力令範圍明顯擴闊。` : effectiveStack <= 5 ? `有效籌碼 ${fmt(effectiveStack)}BB，短碼需要較主動爭取底池。` : effectiveStack >= 12 ? `有效籌碼 ${fmt(effectiveStack)}BB，深籌碼全押需要更強範圍。` : `有效籌碼約 ${fmt(effectiveStack)}BB。`;
  return { jam: strength >= threshold, reason: shoves ? `面對 ${shoves} 位全押者並考慮目前 pot odds。${pressure}` : `${position} 未有人全押；0.25BB Ante 增加死錢。${pressure}` };
}

function aofFacingAllIn(game: Game, actor: number) {
  return game.preflopRaises > 0 || game.players.some((player,index) => index !== actor && !player.folded && player.allIn);
}

function aofDuelLabel(holes: Card[][], equities: number[], board: Card[], names: string[] = holes.map((_,index) => PLAYER_NAMES[index])) {
  if (holes.length < 2 || equities.length !== holes.length) return null;
  const leaders = equities.map((value,index) => ({ value,index })).sort((a,b) => b.value-a.value);
  const leadName = names[leaders[0].index] ?? `玩家 ${leaders[0].index+1}`;
  if (holes.length >= 3) return {
    title: `${holes.length} 人亂戰`,
    detail: `${leadName} 暫時領先 · ${(leaders[0].value*100).toFixed(1)}%`, tone: "chaos",
  };
  const pairRank = holes.map(hole => hole[0].rank === hole[1].rank ? hole[0].rank : 0);
  const sharedRank = holes[0].some(a => holes[1].some(b => a.rank === b.rank));
  const gap = leaders[0].value-leaders[1].value;
  if (!board.length && pairRank.filter(Boolean).length === 1) {
    const pairIndex = pairRank[0] ? 0 : 1;
    const overs = holes[1-pairIndex].every(card => card.rank > pairRank[pairIndex]);
    return { title: overs ? "經典硬幣局" : "對子迎戰高牌", detail: `${leadName} 暫時領先 · ${(leaders[0].value*100).toFixed(1)}%`, tone: "coin" };
  }
  if (!board.length && pairRank[0] && pairRank[1]) return { title: "高對壓低對", detail: `${leadName} 佔明顯優勢 · ${(leaders[0].value*100).toFixed(1)}%`, tone: "danger" };
  if (!board.length && sharedRank) return { title: "踢腳支配", detail: `${leadName} 以較強 kicker 領先 · ${(leaders[0].value*100).toFixed(1)}%`, tone: "danger" };
  if (gap <= .08) return { title: "五五波對決", detail: `勝率非常接近 · ${(leaders[0].value*100).toFixed(1)}% 對 ${(leaders[1].value*100).toFixed(1)}%`, tone: "coin" };
  if (leaders[0].value >= .72) return { title: "壓倒性領先", detail: `${leadName} 暫有 ${(leaders[0].value*100).toFixed(1)}%`, tone: "danger" };
  return { title: board.length ? `${STREET_LABEL[board.length === 3 ? "flop" : board.length === 4 ? "turn" : "river"]} 對決` : "正面對決", detail: `${leadName} 暫時領先 · ${(leaders[0].value*100).toFixed(1)}%`, tone: "gold" };
}

function aofMoment(holes: Card[][], board: Card[], names: string[] = holes.map((_,index) => PLAYER_NAMES[index])) {
  if (holes.length < 2 || board.length < 3) return null;
  const previousBoard = board.length === 3 ? [] : board.slice(0,-1);
  const previous = aofExposedEquity(holes, previousBoard);
  const current = aofExposedEquity(holes, board);
  const maxPrevious = Math.max(...previous);
  const maxCurrent = Math.max(...current);
  const previousLeaders = previous.map((value,index) => Math.abs(value-maxPrevious) < .0001 ? index : -1).filter(index => index >= 0);
  const currentLeaders = current.map((value,index) => Math.abs(value-maxCurrent) < .0001 ? index : -1).filter(index => index >= 0);
  if (board.length >= 4) {
    const outs = aofOuts(holes, previousBoard);
    const card = board.at(-1)!;
    const hit = outs.findIndex(out => out.behind && out.win.some(candidate => cardKey(candidate) === cardKey(card)));
    if (hit >= 0 && outs[hit].win.length <= 2) return {
      title: `命中 ${outs[hit].win.length}-OUTER！`, detail: `${names[hit]} 用 ${RANK_LABEL[card.rank] ?? card.rank}${SUIT_GLYPH[card.suit]} 完成反超`, tone: "miracle",
    };
    const tied = outs.findIndex(out => out.behind && out.tie.some(candidate => cardKey(candidate) === cardKey(card)));
    if (tied >= 0) return { title: "絕地追平！", detail: `${names[tied]} 喺${board.length === 4 ? "Turn" : "River"}追成平手`, tone: "split" };
  }
  if (currentLeaders.some(index => !previousLeaders.includes(index))) return {
    title: `${board.length === 3 ? "FLOP" : board.length === 4 ? "TURN" : "RIVER"} 反超！`,
    detail: `${currentLeaders.map(index => names[index]).join("、")} 搶走領先`, tone: "comeback",
  };
  if (board.length === 5 && maxCurrent === 1 && maxPrevious < .93) return { title: "河牌定局", detail: `${names[currentLeaders[0]]} 守住最後一張`, tone: "gold" };
  return null;
}

function aofHandHighlights(game: Game, livesBefore: number[], livesAfter: number[]) {
  const entries: AofHighlight[] = [];
  const contenders = game.players.map((player,index) => !player.folded ? index : -1).filter(index => index >= 0);
  if (game.board.length === 5 && contenders.length >= 2) {
    const holes = contenders.map(index => game.players[index].hole);
    const pre = aofExposedEquity(holes, []);
    const winners = game.winners.map(index => contenders.indexOf(index)).filter(index => index >= 0);
    const bestBefore = Math.max(...pre);
    const upset = winners.find(index => pre[index] + .15 < bestBefore);
    if (upset !== undefined) entries.push({ id: `${game.handNo}-upset`, hand: game.handNo, title: "Underdog 反勝", detail: `${game.players[contenders[upset]].name} 由 ${(pre[upset]*100).toFixed(1)}% 反勝`, tone: "red" });
    if (contenders.length >= 3) entries.push({ id: `${game.handNo}-multi`, hand: game.handNo, title: `${contenders.length} 人 All-in`, detail: `${fmt(game.settledBets.reduce((sum,value) => sum+value,0))}BB 多人亂戰`, tone: "gold" });
    const rareWinner = game.winners.find(index => bestScore([...game.players[index].hole,...game.board])[0] >= 7);
    if (rareWinner !== undefined) {
      const label = HAND_LABEL[bestScore([...game.players[rareWinner].hole,...game.board])[0]];
      entries.push({ id: `${game.handNo}-rare`, hand: game.handNo, title: `${label}現身`, detail: `${game.players[rareWinner].name} 打出罕見牌型`, tone: "green" });
    }
  }
  livesAfter.forEach((life,index) => {
    if (life === 0 && livesBefore[index] > 0) entries.push({ id: `${game.handNo}-out-${index}`, hand: game.handNo, title: `${PLAYER_NAMES[index]} 出局`, detail: "三條命已全部用盡", tone: "red" });
  });
  if (!entries.length) {
    const winner = game.winners[0];
    entries.push({ id: `${game.handNo}-result`, hand: game.handNo, title: game.board.length === 5 ? "本手焦點" : "不戰而勝", detail: winner === undefined ? game.message : `${PLAYER_NAMES[winner]} 收下底池`, tone: "gold" });
  }
  return entries;
}

function aofAct(state: AofState, actor: number, jam: boolean): AofState {
  const before = state.game;
  if (before.finished || before.turn !== actor) return state;
  const facing = aofFacingAllIn(before,actor);
  const stats = state.stats.map(s => ({ ...s }));
  const s = stats[actor];
  if (facing) { s.callOpportunities++; if (jam) s.calls++; }
  else { s.pushOpportunities++; if (jam) s.pushes++; }
  const shoveTo = before.players[actor].streetBet+before.players[actor].stack;
  const game = act(before, actor, jam ? shoveTo > before.currentBet ? "raise" : "checkcall" : "fold", shoveTo+1);
  if (!game.finished) return { ...state, game, stats, foldReveal: false };
  stats.forEach((item,index) => {
    if (game.startingStacks[index] <= 0) return;
    item.hands++; item.profit += game.players[index].stack - game.startingStacks[index];
  });
  const result = allInEvDelta(game);
  const last = state.profits.at(-1);
  const livesBefore = aofLives(state);
  const lives = livesBefore.map((life,index) => game.startingStacks[index] > 0 && game.players[index].stack <= 0 ? Math.max(0,life-1) : life);
  const runFinished = lives[0] === 0 || lives.filter(life => life > 0).length <= 1;
  const heroWon = game.winners.includes(0);
  const boss = aofBoss(state);
  let bossActive = state.bossActive ?? false;
  let bossStage = state.bossStage ?? 0;
  let bossTrophies = [...(state.bossTrophies ?? [])];
  let bossCycles = state.bossCycles ?? 0;
  let bossLastResult = state.bossLastResult;
  let bossLastStage = state.bossLastStage;
  if (runFinished && boss) {
    bossLastStage = bossStage;
    if (lives[0] > 0) {
      bossTrophies = bossTrophies.includes(boss.id) ? bossTrophies : [...bossTrophies,boss.id];
      if (bossStage === AOF_BOSSES.length-1) { bossLastResult = "complete"; bossCycles++; }
      else { bossLastResult = "win"; bossStage++; }
    } else bossLastResult = "loss";
  }
  const highlights = aofHandHighlights(game,livesBefore,lives);
  const specialPoints = highlights.filter(item => !["本手焦點","不戰而勝"].includes(item.title)).length*4;
  const bossBonus = bossLastResult === "complete" ? 25 : bossLastResult === "win" ? 12 : 0;
  const xp = (state.xp ?? 0) + 2 + (game.players[0].allIn ? 2 : 0) + (heroWon ? 2 : 0) + specialPoints + bossBonus;
  const streak = heroWon ? (state.streak ?? 0)+1 : 0;
  return {
    ...state, game, stats, revealStep: game.board.length === 5 ? 0 : 5, foldReveal: false,
    lives, runNo: state.runNo ?? 1, runHands: (state.runHands ?? 0)+1, runFinished,
    xp, streak, bestStreak: Math.max(state.bestStreak ?? 0,streak), unlockedThemes: aofUnlocked(xp),
    bossActive, bossStage, bossTrophies, bossCycles, bossLastResult, bossLastStage,
    collection: aofCollectResult(state.collection,game.players[0].hole,game.handNo,heroWon),
    highlights: [...highlights,...(state.highlights ?? [])].slice(0,20),
    profits: [...state.profits, { hand: game.handNo, actual: (last?.actual ?? 0)+result.actualDelta, allInEv: (last?.allInEv ?? 0)+result.adjustedDelta, hadAllIn: result.hadAllIn }].slice(-1000),
  };
}

// Settlement happens once in aofAct. Presentation never awards chips or changes results.
function aofPresentation(state: AofState) {
  const game = state.game;
  const step = state.revealStep ?? 5; // Completed hands from older saves stay completed.
  const revealing = game.finished && game.board.length === 5 && step < 5;
  const boardCount = !game.finished ? 0 : !revealing ? game.board.length : step < 2 ? 0 : step === 2 ? 3 : step === 3 ? 4 : 5;
  const players = game.players.map((p,i) => revealing ? {
    ...p, stack: game.startingStacks[i] - game.settledBets[i],
    lastAction: p.folded ? "棄牌" : "ALL-IN",
  } : p);
  const settledLives = aofLives(state);
  const lives = revealing ? settledLives.map((life,index) => game.startingStacks[index] > 0 && game.players[index].stack <= 0 ? Math.min(AOF_MAX_LIVES,life+1) : life) : settledLives;
  return {
    step, revealing, players, board: game.board.slice(0,boardCount),
    lives,
    pot: revealing ? game.settledBets.reduce((sum,n) => sum+n,0) : potTotal(game),
    profits: revealing ? state.profits.slice(0,-1) : state.profits,
    stats: revealing ? state.stats.map((s,i) => game.startingStacks[i] > 0 ? ({ ...s, hands: s.hands-1, profit: s.profit-(game.players[i].stack-game.startingStacks[i]) }) : s) : state.stats,
  };
}

// Evaluate only the exposed holes and board. Unseen future board/deck and folded holes are not inputs.
function aofExposedEquity(holes: Card[][], board: Card[]) {
  if (holes.length < 2) return holes.map(() => 1);
  const known = [...holes.flat(), ...board];
  const available = makeDeck(seededRandom(808)).filter(c => !known.some(k => cardKey(c) === cardKey(k)));
  const rng = seededRandom(9107 + known.reduce((sum,c) => sum+c.rank*13+SUITS.indexOf(c.suit),0));
  const missing = 5-board.length;
  const runs = missing === 0 ? [[]] : missing === 1 ? available.map(c => [c]) : Array.from({length:600}, () => shuffle(available,rng).slice(0,missing));
  const points = holes.map(() => 0);
  runs.forEach(run => {
    const scores = holes.map(hole => bestScore([...hole,...board,...run]));
    const best = scores.reduce((a,b) => compareScore(a,b) >= 0 ? a : b);
    const winners = scores.map((s,i) => compareScore(s,best) === 0 ? i : -1).filter(i => i >= 0);
    winners.forEach(i => { points[i] += 1/winners.length; });
  });
  return points.map(p => p/runs.length);
}

function aofOuts(holes: Card[][], board: Card[]) {
  if (holes.length < 2 || (board.length !== 3 && board.length !== 4)) return [];
  const current = holes.map(hole => bestScore([...hole,...board]));
  const lead = current.reduce((a,b) => compareScore(a,b) >= 0 ? a : b);
  const result = current.map(score => ({ behind: compareScore(score,lead) < 0, win: [] as Card[], tie: [] as Card[] }));
  const known = new Set([...holes.flat(),...board].map(cardKey));
  // Enumerate every publicly unseen card; actual deck and mucked hands are deliberately absent.
  for (const suit of SUITS) for (let rank=14;rank>=2;rank--) {
    const card: Card = {rank,suit};
    if (known.has(cardKey(card))) continue;
    const scores = holes.map(hole => bestScore([...hole,...board,card]));
    const best = scores.reduce((a,b) => compareScore(a,b) >= 0 ? a : b);
    const winners = scores.map((score,i) => compareScore(score,best) === 0 ? i : -1).filter(i => i >= 0);
    winners.forEach(i => { if (result[i].behind) (winners.length === 1 ? result[i].win : result[i].tie).push(card); });
  }
  return result;
}

function aofBestFive(cards: Card[]) {
  const target = bestScore(cards);
  for(let a=0;a<cards.length-4;a++) for(let b=a+1;b<cards.length-3;b++) for(let c=b+1;c<cards.length-2;c++) for(let d=c+1;d<cards.length-1;d++) for(let e=d+1;e<cards.length;e++) {
    const five = [cards[a],cards[b],cards[c],cards[d],cards[e]];
    if(compareScore(bestScore(five),target) === 0) return five;
  }
  return [];
}

function aofNextHand(state: AofState): AofState {
  if (!state.game.finished) return state;
  const restart = state.runFinished ?? false;
  const lives = restart ? [3,3,3,3] : aofLives(state);
  const stacks = restart ? lives.map(life => life > 0 ? 8 : 0) : state.game.players.map((player,index) => player.stack > 0 ? player.stack : lives[index] > 0 ? 8 : 0);
  const completedBoss = restart && state.bossLastResult === "complete";
  const game = newHand(stacks,(state.game.button+1)%4,state.game.handNo+1,Math.random,[0,0,0,0],state.game.tableId,AOF_ANTE);
  return {
    ...state, lives, runNo: restart ? (state.runNo ?? 1)+1 : state.runNo ?? 1,
    runHands: restart ? 0 : state.runHands ?? 0, runFinished: false, foldReveal: false, revealStep: undefined,
    streak: restart ? 0 : state.streak ?? 0, bestStreak: restart ? 0 : state.bestStreak ?? 0,
    bossActive: completedBoss ? false : state.bossActive ?? false, bossStage: completedBoss ? 0 : state.bossStage ?? 0,
    bossLastResult: undefined, bossLastStage: undefined,
    game, collection: aofCollectDeal(state.collection,game.players[0].hole,game.handNo),
  };
}

function aofStartBossRun(state: AofState): AofState {
  if (!state.game.finished && state.game.actionId > 0) return state;
  const game = newHand([8,8,8,8],0,state.game.handNo+1,Math.random,[0,0,0,0],state.game.tableId,AOF_ANTE);
  return {
    ...state, game, lives: [3,3,3,3], runNo: (state.runNo ?? 1)+1,
    runHands: 0, runFinished: false, foldReveal: false, revealStep: undefined, streak: 0,
    bossActive: true, bossStage: 0, bossLastResult: undefined, bossLastStage: undefined,
    collection: aofCollectDeal(state.collection,game.players[0].hole,game.handNo),
  };
}

function aofRestartRun(state: AofState): AofState {
  const game = newHand([8,8,8,8],0,state.game.handNo+1,Math.random,[0,0,0,0],state.game.tableId,AOF_ANTE);
  const bossActive = state.bossActive ?? false;
  return {
    ...state, game, lives: [3,3,3,3], runNo: (state.runNo ?? 1)+1, runHands: 0,
    runFinished: false, foldReveal: false, revealStep: undefined, streak: 0,
    bossActive, bossStage: bossActive ? state.bossStage ?? 0 : 0,
    bossLastResult: undefined, bossLastStage: undefined,
    collection: aofCollectDeal(state.collection,game.players[0].hole,game.handNo),
  };
}

function aofWhatIfBoard(game: Game) {
  return completeBoard(game.deck,game.board).board;
}

function AofTable({ state, onChange, onExit, saveStatus, careerBalance = 0, careerStake = 1, bankrollMessage = "", legacy = false }: { state: AofState; onChange: (state: AofState) => void; onExit: () => void; saveStatus: string; careerBalance?: number; careerStake?: number; bankrollMessage?: string; legacy?: boolean }) {
  const { game } = state;
  const view = aofPresentation(state);
  const { stats, revealing, step, lives } = view;
  const paid = game.finished && !revealing;
  const boss = aofBoss(state);
  const [hint, setHint] = useState(false);
  const [fast, setFast] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [sound, setSound] = useState(false);
  const [collectionOpen, setCollectionOpen] = useState(false);
  const [selectedHand, setSelectedHand] = useState<string | null>(null);
  const audioRef = useRef<AudioContext | null>(null);
  useEffect(() => { setSelectedHand(null); }, [game.handNo]);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(media.matches);
    update(); media.addEventListener("change",update);
    return () => { media.removeEventListener("change",update); void audioRef.current?.close(); };
  }, []);
  useEffect(() => {
    if (game.finished || game.turn === null || game.turn === 0) return;
    const actor = game.turn;
    const timer = window.setTimeout(() => onChange(aofAct(state, actor, aofDecision(game, actor,boss).jam)), 650);
    return () => window.clearTimeout(timer);
  }, [state, game, onChange]);
  useEffect(() => {
    if (!revealing) return;
    const duration = reduced ? 60 : (fast ? .42 : 1) * [850,1300,1800,2300,1700][step];
    const timer = window.setTimeout(() => onChange({ ...state, revealStep: reduced ? 5 : step+1 }), duration);
    return () => window.clearTimeout(timer);
  }, [state, revealing, step, fast, reduced, onChange]);
  useEffect(() => {
    const ctx = audioRef.current;
    if (!sound || !ctx || ctx.state !== "running" || !game.finished) return;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = paid ? 660 : 280+step*70;
    gain.gain.setValueAtTime(.035,ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+.14);
    oscillator.connect(gain); gain.connect(ctx.destination);
    oscillator.start(); oscillator.stop(ctx.currentTime+.15);
  }, [sound, game.finished, game.handNo, step, paid]);
  useEffect(() => {
    if (!game.finished || reduced || !("vibrate" in navigator)) return;
    if (revealing && step === 0) navigator.vibrate?.(45);
    else if (revealing && step === 4) navigator.vibrate?.([30,45,70]);
    else if (paid) navigator.vibrate?.(game.winners.includes(0) ? [60,40,90] : 40);
  }, [game.finished, game.handNo, game.winners, paid, reduced, revealing, step]);
  const toggleSound = async () => {
    if (sound) { setSound(false); return; }
    try {
      if (!audioRef.current) audioRef.current = new AudioContext();
      await audioRef.current.resume(); setSound(true);
    } catch { setSound(false); }
  };
  const move = (jam: boolean) => { setHint(false); onChange(aofAct(state, 0, jam)); };
  const next = () => { setHint(false); onChange(aofNextHand(state)); };
  const startBoss = () => { setHint(false); onChange(aofStartBossRun(state)); };
  const restartRun = () => {
    const target = boss ? `${boss.name}呢一關` : "目前 AOF Run";
    if (!window.confirm(`重新開始${target}？\n\n四位玩家會回復三條命並重新發牌；XP、統計、169 收藏、精華及 Boss 獎盃會保留。`)) return;
    setHint(false); onChange(aofRestartRun(state));
  };
  const advice = aofDecision(game, 0);
  const facingAllIn = aofFacingAllIn(game,0);
  const canRaiseAllIn = game.players[0].streetBet+game.players[0].stack > game.currentBet;
  const latest = view.profits.at(-1);
  const exposed = game.finished && game.board.length === 5 && (paid || step >= 1);
  const foldReveal = !!state.foldReveal;
  const foldEligible = paid && game.board.length < 5 && game.players[0].folded && game.winners.length === 1;
  const whatIfBoard = foldReveal ? aofWhatIfBoard(game) : [];
  const displayBoard = foldReveal ? whatIfBoard : view.board;
  const contenders = game.players.map((p,i) => !p.folded ? i : -1).filter(i => i >= 0);
  const equities = useMemo(() => exposed && game.board.length === 5
    ? aofExposedEquity(contenders.map(i => game.players[i].hole), view.board) : [],
    [game, exposed, view.board.length]);
  const outs = useMemo(() => exposed ? aofOuts(contenders.map(i => game.players[i].hole),view.board) : [],
    [game, exposed, view.board.length]);
  const winners = paid ? game.winners : [];
  const winningHands = paid && game.board.length === 5 ? winners.map(i => ({
    index: i, cards: aofBestFive([...game.players[i].hole,...game.board]),
    label: HAND_LABEL[bestScore([...game.players[i].hole,...game.board])[0]],
  })) : [];
  const winningKeys = new Set(winningHands.flatMap(h => h.cards.map(cardKey)));
  const duel = useMemo(() => exposed && equities.length > 1 ? aofDuelLabel(contenders.map(i => game.players[i].hole),equities,view.board,contenders.map(i => game.players[i].name)) : null,
    [game.handNo,exposed,equities,view.board.length]);
  const moment = useMemo(() => exposed && view.board.length >= 3 ? aofMoment(contenders.map(i => game.players[i].hole),view.board,contenders.map(i => game.players[i].name)) : null,
    [game.handNo,exposed,view.board.length]);
  const xp = state.xp ?? 0;
  const unlocked = state.unlockedThemes ?? aofUnlocked(xp);
  const theme: AofTheme = unlocked.includes(state.theme ?? "emerald") ? state.theme ?? "emerald" : "emerald";
  const nextTheme = AOF_THEMES.find(item => item.unlock > xp);
  const previousUnlock = [...AOF_THEMES].reverse().find(item => item.unlock <= xp)?.unlock ?? 0;
  const rewardProgress = nextTheme ? Math.min(100,((xp-previousUnlock)/(nextTheme.unlock-previousUnlock))*100) : 100;
  const collection = state.collection ?? {};
  const discovered = Object.values(collection).filter(entry => entry.dealt > 0).length;
  const totalDeals = Object.values(collection).reduce((sum,entry) => sum+entry.dealt,0);
  const selectedEntry = selectedHand ? collection[selectedHand] : undefined;
  const bossCanStart = game.finished || game.actionId === 0;
  const stageLabel = ["全押對決","翻開底牌","FLOP · 翻牌","TURN · 轉牌","RIVER · 河牌"][step] ?? "結果";
  return <main className={`aof-shell aof-theme-${theme} ${reduced ? "aof-reduced" : ""}`}>
    <header className="aof-header"><div><span>ALL-IN OR FOLD · {boss ? "BOSS RUN" : "三命 RUN"}</span><h1>AOF · 4 人 · 8BB BUY-IN</h1></div><button onClick={onExit}>返回標準模式</button></header>
    <p className="aof-rules">0.5 / 1BB＋每人0.25BB Ante · 籌碼跨手延續 · 每條命8BB · 爆倉先扣命，用盡三命先出局。{saveStatus}</p>
    <div className="career-strip"><b>{legacy ? "舊版練習局 · 重新開始後才計入 Bankroll" : `AOF BB = ${careerStake} C · 每條命 ${careerStake * 8} C`}</b><span>Bankroll {fmt(careerBalance)} C</span></div>{bankrollMessage && <p className="bankroll-message" role="alert">{bankrollMessage}</p>}
    <div className="aof-run-strip"><div><span>RUN</span><b>第 {state.runNo ?? 1} 局</b></div><div><span>本局手數</span><b>{state.runHands ?? 0}</b></div><div><span>連勝</span><b>{state.streak ?? 0}</b></div><div><span>娛樂 XP</span><b>{xp}</b></div></div>
    <div className="aof-playback" aria-label="AOF動畫設定">
      <button aria-pressed={!fast} onClick={() => setFast(false)}>電影節奏</button><button aria-pressed={fast} onClick={() => setFast(true)}>快速</button>
      <button aria-pressed={reduced} onClick={() => setReduced(!reduced)}>減少動態 {reduced ? "ON" : "OFF"}</button>
      <button aria-pressed={sound} onClick={toggleSound}>音效 {sound ? "ON" : "OFF"}</button>
      <button className="aof-restart" onClick={restartRun}>重新開始 ↻</button>
    </div>
    <section className={`aof-boss-panel ${boss ? "active" : ""}`} aria-label="AOF Boss Run">
      <div className="aof-boss-head"><div><span>BOSS RUN</span><h2>{boss ? `第 ${(state.bossStage ?? 0)+1} 關 · ${boss.name}` : "挑戰三位 Boss"}</h2></div><strong>{state.bossCycles ?? 0} 冠</strong></div>
      <div className="aof-boss-map">{AOF_BOSSES.map((item,index) => <div key={item.id} className={`${boss ? index < (state.bossStage ?? 0) ? "cleared" : "" : (state.bossTrophies ?? []).includes(item.id) ? "cleared" : ""} ${boss && index === (state.bossStage ?? 0) ? "current" : ""}`}><i>{index+1}</i><span>{item.name}</span><small>{item.title}</small></div>)}</div>
      {boss ? <div className="aof-boss-card"><div className="aof-boss-avatar">♛</div><div><b>{boss.name} · {boss.title}</b><p>{boss.style} Boss 只改變公開可見嘅策略傾向，牌序與勝率完全不變。</p></div></div>
        : <><p>由石牆、赤狐到夜王，連續完成三個三命 Run 即可奪冠。每關使用真實牌局規則，沒有加權抽牌。</p><button className="aof-boss-start" disabled={!bossCanStart} onClick={startBoss}>{bossCanStart ? "開始 Boss Run" : "本手完結後開始"}</button></>}
      {paid && state.runFinished && state.bossLastResult && <div className={`aof-boss-result ${state.bossLastResult}`}><b>{state.bossLastResult === "complete" ? "三王擊破 · Boss Run 冠軍！" : state.bossLastResult === "win" ? `擊破 ${AOF_BOSSES[state.bossLastStage ?? 0].name}！` : `${AOF_BOSSES[state.bossLastStage ?? 0].name} 守住關卡`}</b><span>{state.bossLastResult === "loss" ? "下一局可原關重試" : state.bossLastResult === "complete" ? "+25 XP · 已記錄冠軍次數" : "+12 XP · 下一關已解鎖"}</span></div>}
      {boss && paid && state.runFinished && <button className="aof-boss-exit" onClick={() => onChange({ ...state, bossActive: false, bossStage: 0, bossLastResult: undefined, bossLastStage: undefined })}>返回一般三命 Run</button>}
    </section>
    <section className={`aof-table ${revealing ? "aof-showdown aof-cinematic" : ""} ${moment ? "aof-destiny" : ""}`} aria-label="AOF牌桌">
      {revealing && <div className="aof-stage-banner" key={`${game.handNo}-${step}`}><small>SHOWDOWN 2.0</small><strong>{stageLabel}</strong><i><span style={{ width: `${((step+1)/5)*100}%` }} /></i></div>}
      {duel && <div className={`aof-duel-tag ${duel.tone}`} key={`${game.handNo}-${view.board.length}-${duel.title}`}><b>{duel.title}</b><span>{duel.detail}</span></div>}
      {moment && <div className={`aof-moment ${moment.tone}`} key={`${game.handNo}-${view.board.length}-${moment.title}`}><span>✦ 命運時刻</span><strong>{moment.title}</strong><small>{moment.detail}</small>{[0,1,2,3,4,5].map(i => <i key={i} style={{ "--spark": i } as React.CSSProperties} />)}</div>}
      {view.players.map((p,index) => <div key={index} className={`aof-seat aof-seat-${index} ${game.turn === index ? "acting" : ""} ${p.folded ? "folded" : ""} ${lives[index] === 0 ? "eliminated" : ""} ${!revealing && p.stack > 0 && p.stack <= 3 && lives[index] > 0 ? "aof-short-stack" : ""} ${winners.includes(index) ? "aof-winner" : ""} ${boss?.seat === index ? "aof-boss-seat" : ""}`}>
        <div><b>{boss?.seat === index ? `${boss.name} · ${boss.title}` : p.name}</b><span>{lives[index] === 0 ? "OUT" : tablePosition(game,index)}</span></div><strong>{fmt(p.stack)} BB</strong>
        {!revealing && p.stack > 0 && p.stack <= 3 && lives[index] > 0 && <span className="aof-danger-badge">⚠ 短碼危險</span>}
        <div className="aof-lives" aria-label={`${p.name}剩餘${lives[index]}條命`}>{[0,1,2].map(life => <span key={life} className={life < lives[index] ? "live" : "lost"}>♥</span>)}</div>
        <div className="aof-cards">{p.hole.map((card,i) => {
          const faceUp = index === 0 || exposed && !p.folded || foldReveal && winners.includes(index);
          return <div key={`${game.handNo}-${i}-${faceUp}-${foldReveal}`} className={`${faceUp && index !== 0 && (exposed || foldReveal) ? "aof-flip" : ""} ${winners.includes(index) && winningKeys.has(cardKey(card)) ? "aof-card-used" : ""}`}><CardView card={card} mini hidden={!faceUp} /></div>;
        })}</div>
        <small>{p.lastAction}</small>
        {exposed && !p.folded && equities.length > 0 && <span className="aof-equity">{view.board.length < 4 ? "約 " : ""}{(equities[contenders.indexOf(index)]*100).toFixed(1)}% <small>底池權益</small></span>}
        {outs[contenders.indexOf(index)]?.behind && <span className="aof-outs-badge">{outs[contenders.indexOf(index)].win.length} 反超 outs · {outs[contenders.indexOf(index)].tie.length} 追平</span>}
        {revealing && step === 1 && !p.folded && <span className="aof-chip-travel">{fmt(game.settledBets[index] ?? 0)}BB</span>}
        {winners.includes(index) && <span className="aof-payout">收池 +{fmt(p.stack-(game.startingStacks[index]-game.settledBets[index]))}BB</span>}
      </div>)}
      <div className="aof-centre"><b>{foldReveal ? "娛樂揭牌" : paid ? "本手結束" : `底池 ${fmt(view.pot)}BB`}</b><div className="aof-board">{[0,1,2,3,4].map(i => <div key={`${game.handNo}-${i}-${!!displayBoard[i]}-${foldReveal}`} className={`${displayBoard[i] ? "aof-flip" : ""} ${paid && !foldReveal && displayBoard[i] && winningKeys.has(cardKey(displayBoard[i])) ? "aof-card-used" : ""}`}><CardView card={displayBoard[i]} mini /></div>)}</div><span>{foldReveal ? "假設牌面 · 不計入結果" : revealing ? stageLabel : `第 ${game.handNo} 手`}</span></div>
    </section>
    {outs.some(o => o.behind) && <section className="aof-outs-panel" aria-label="落後玩家的outs"><h2>{view.board.length === 3 ? "等 Turn" : "等 River"} · 落後方 OUTS</h2>{outs.map((o,i) => o.behind ? <div className="aof-outs-row" key={contenders[i]}><strong>{PLAYER_NAMES[contenders[i]]} · 反超 {o.win.length} 張／追平 {o.tie.length} 張</strong>{o.win.length > 0 && <div><b>反超</b>{o.win.map(c => <span className={c.suit === "h" || c.suit === "d" ? "red" : ""} key={cardKey(c)}>{RANK_LABEL[c.rank] ?? c.rank}{SUIT_GLYPH[c.suit]}</span>)}</div>}{o.tie.length > 0 && <div><b>追平</b>{o.tie.map(c => <span className={c.suit === "h" || c.suit === "d" ? "red" : ""} key={cardKey(c)}>{RANK_LABEL[c.rank] ?? c.rank}{SUIT_GLYPH[c.suit]}</span>)}</div>}{o.win.length+o.tie.length === 0 && <p>{view.board.length === 3 ? "下一張未能直接反超或追平；仍可能靠兩張連續好牌逆轉。" : "已無反超或追平嘅 River 牌。"}</p>}</div> : null)}<p>按目前牌型判定落後；列出下一張能超越全部對手或並列第一嘅牌。{view.board.length === 3 ? "Flop outs只代表Turn暫時領先，River仍可能被反超；不包括兩張連續好牌嘅組合。" : "Turn outs代表River最終結果。"}未揭底牌視為未知。</p></section>}
    {foldReveal && <p className="aof-fold-note">娛樂揭牌顯示收池 AI 嘅底牌及同一副牌嘅假設 runout；正式牌局已於你棄牌時完結，牌面不影響盈虧、命數或統計。</p>}
    <p className="aof-message" aria-live="polite">{revealing ? `${stageLabel} · 等待揭牌…` : foldReveal ? `${PLAYER_NAMES[game.winners[0]]} 亮牌 · 睇下如果繼續會發生咩事` : paid ? game.message : game.turn === 0 ? "輪到你：全押或棄牌" : `${game.players[game.turn ?? 0].name} 正在思考…`}</p>
    {revealing ? <div className="aof-actions"><button onClick={() => onChange({ ...state, revealStep: 5 })}>跳過動畫 · 顯示結果</button></div>
      : paid && state.runFinished ? <div className="aof-actions"><button className="aof-jam" onClick={next}>{state.bossLastResult === "complete" ? "完成 Boss Run · 返回三命 Run" : state.bossActive && state.bossLastResult === "win" ? "下一關 · 回復三條命" : state.bossActive ? "重試本關 · 回復三條命" : `開始第 ${(state.runNo ?? 1)+1} 局 · 回復三條命`}</button></div>
      : paid && foldEligible && !foldReveal ? <div className="aof-actions"><button onClick={() => onChange({ ...state, foldReveal: true })}>✦ 娛樂揭牌</button><button className="aof-jam" onClick={next}>下一手 · 籌碼延續</button></div>
      : paid ? <div className="aof-actions"><button className="aof-jam" onClick={next}>下一手 · 籌碼延續</button></div>
      : <div className="aof-actions"><button disabled={game.turn !== 0} onClick={() => move(false)}>Fold 棄牌</button><button className="aof-jam" disabled={game.turn !== 0} onClick={() => move(true)}>{facingAllIn && !canRaiseAllIn ? "Call All-in" : "All-in"} · {fmt(game.players[0].stack)}BB</button><button disabled={game.turn !== 0} onClick={() => setHint(!hint)}>AOF 提示</button></div>}
    {paid && state.runFinished && <section className="aof-run-result"><span>RUN 完結</span><h2>{lives[0] > 0 ? "你成為最後生還者！" : "你嘅三條命已用盡"}</h2><p>第 {state.runNo ?? 1} 局共完成 {state.runHands ?? 0} 手 · 最高連勝 {state.bestStreak ?? 0} · 累積 {xp} XP</p></section>}
    {winningHands.length > 0 && <section className="aof-winning-hands"><h2>{winners.length > 1 ? "平分底池" : "勝出牌型"}</h2>{winningHands.map(h => <div key={h.index}><strong>{PLAYER_NAMES[h.index]} · {h.label}</strong><div>{h.cards.map(c => <CardView key={cardKey(c)} card={c} mini />)}</div></div>)}</section>}
    {exposed && equities.length > 0 && <p className="aof-equity-note">百分比包含平分底池份額；翻牌前／Flop 為600次模擬，Turn／River 為完整枚舉。只根據已揭底牌及當前公共牌，未揭牌不參與計算。</p>}
    {hint && game.turn === 0 && <p className="aof-advice">估算建議：{advice.jam ? facingAllIn && !canRaiseAllIn ? "跟全押" : "全押" : "棄牌"}。{advice.reason}只使用你嘅底牌及公開行動；並非精確GTO。</p>}
    <section className="aof-panel aof-collection"><div className="aof-collection-head"><div><span>169 STARTING HANDS</span><h2>起手牌收藏冊</h2><p>{discovered} / 169 已發現 · 累積 {totalDeals} 次</p></div><div className="aof-collection-ring" style={{ "--progress": `${discovered/169*360}deg` } as React.CSSProperties}><b>{Math.round(discovered/169*100)}%</b></div></div>
      <button className="aof-collection-toggle" aria-expanded={collectionOpen} onClick={() => setCollectionOpen(!collectionOpen)}>{collectionOpen ? "收起收藏冊" : "打開 13 × 13 收藏冊"}</button>
      {collectionOpen && <><div className="aof-collection-grid" role="grid" aria-label="169款德州撲克起手牌">
        <i className="corner" />{AOF_RANKS.map(rank => <i key={`top-${rank}`}>{RANK_LABEL[rank] ?? rank}</i>)}
        {AOF_RANKS.map((rank,row) => <span className="aof-collection-row" key={`row-${rank}`}><i>{RANK_LABEL[rank] ?? rank}</i>{AOF_RANKS.map((_,column) => { const key = aofMatrixKey(row,column); const entry = collection[key]; return <button type="button" role="gridcell" aria-label={`${key}，${entry ? `獲發${entry.dealt}次，勝出${entry.wins}次` : "未發現"}`} className={`${entry ? "found" : ""} ${entry?.wins ? "won" : ""} ${selectedHand === key ? "selected" : ""}`} onClick={() => setSelectedHand(key)} key={key}><b>{key}</b>{entry && <small>{entry.dealt}</small>}</button>; })}</span>)}
      </div>{selectedHand && <div className="aof-collection-detail"><b>{selectedHand}</b><span>{selectedEntry ? `獲發 ${selectedEntry.dealt} 次 · 勝出 ${selectedEntry.wins} 次 · 勝率 ${Math.round(selectedEntry.wins/selectedEntry.dealt*100)}%` : "尚未獲發呢款起手牌"}</span></div>}<p>對角線係口袋對子；右上為同花，左下為非同花。每次真正獲發即永久收錄，Fold 亦會保留。</p></>}
    </section>
    <section className="aof-panel aof-rewards"><div className="aof-reward-head"><div><span>外觀獎勵</span><h2>娛樂等級 {Math.floor(xp/25)+1}</h2></div><strong>{xp} XP</strong></div><div className="aof-xp-track"><i style={{ width: `${rewardProgress}%` }} /></div><p>{nextTheme ? `再取得 ${nextTheme.unlock-xp} XP 解鎖「${nextTheme.label}」` : "所有牌桌主題已解鎖"}</p><div className="aof-theme-picker">{AOF_THEMES.map(item => { const available = unlocked.includes(item.id); return <button key={item.id} disabled={!available} aria-pressed={theme === item.id} onClick={() => available && onChange({ ...state, theme: item.id })}>{available ? item.label : `${item.unlock} XP`}</button>; })}</div></section>
    <section className="aof-panel aof-highlights"><div className="aof-reward-head"><div><span>SESSION REEL</span><h2>牌局精華</h2></div><strong>{(state.highlights ?? []).length}</strong></div>{(state.highlights ?? []).length ? <div>{(state.highlights ?? []).slice(0,6).map(item => <article className={item.tone} key={item.id}><b>#{item.hand}</b><span><strong>{item.title}</strong><small>{item.detail}</small></span></article>)}</div> : <p>完成牌局後，反勝、多人 All-in、罕見牌型及出局時刻會自動收錄。</p>}</section>
    <section className="aof-panel"><h2>AOF Session</h2><p>實際 {fmt(latest?.actual ?? 0)}BB · All-in EV {fmt(latest?.allInEv ?? 0)}BB{revealing ? " · 揭牌後更新" : ""}</p><ProfitChart points={view.profits} /><div className="aof-stats"><table><thead><tr><th>玩家</th><th>手數</th><th>盈虧 BB</th><th>推牌率</th><th>跟全押率</th></tr></thead><tbody>{stats.map((s,i) => <tr key={i}><td>{PLAYER_NAMES[i]}</td><td>{s.hands}</td><td>{fmt(s.profit)}</td><td>{s.pushOpportunities ? `${statPercent(s.pushes,s.pushOpportunities)}%` : "—"}</td><td>{s.callOpportunities ? `${statPercent(s.calls,s.callOpportunities)}%` : "—"}</td></tr>)}</tbody></table></div><p>推牌率只計未有人全押嘅機會；跟全押率只計面對全押嘅機會。每條命爆倉後補回8BB，補碼本身不計盈虧；標準桌統計不受影響。</p></section>
  </main>;
}

function CardView({ card, hidden = false, mini = false }: { card?: Card; hidden?: boolean; mini?: boolean }) {
  if (hidden) return <div className={`card card-back ${mini ? "mini-card" : ""}`} aria-label="隱藏的牌"><span>8</span></div>;
  if (!card) return <div className={`card card-empty ${mini ? "mini-card" : ""}`} aria-hidden="true" />;
  const red = card.suit === "h" || card.suit === "d";
  return <div className={`card ${red ? "red" : "black"} ${mini ? "mini-card" : ""}`} aria-label={`${RANK_LABEL[card.rank] ?? card.rank}${SUIT_GLYPH[card.suit]}`}><b>{RANK_LABEL[card.rank] ?? card.rank}</b><span>{SUIT_GLYPH[card.suit]}</span></div>;
}

function EvComparison({ evs, compact = false }: { evs?: ActionEv[]; compact?: boolean }) {
  if (!evs?.length) return null;
  const max = Math.max(...evs.map(item => item.ev));
  const min = Math.min(...evs.map(item => item.ev));
  const spread = Math.max(.25, max - min);
  return <section className={`ev-comparison ${compact ? "compact" : ""}`} aria-label="Fold Call Raise EV比較器">
    <div className="ev-title"><span>FOLD / CALL / RAISE</span><b>估算 EV 比較</b><small>信心度：{evs[0].confidence}</small></div>
    <div className="ev-list">{evs.map(item => <div className={`ev-row ${item.best ? "best" : ""}`} key={item.action}>
      <div><b>{item.label}</b><small>{item.size || "即時決定"}</small></div>
      <span className="ev-bar"><i style={{ width: `${18 + ((item.ev - min) / spread) * 82}%` }} /></span>
      <strong>{item.ev >= 0 ? "+" : ""}{fmt(item.ev)}BB</strong>
      <em>{item.best ? "最佳" : `損失 ${fmt(item.loss)}BB`}</em>
    </div>)}</div>
  </section>;
}

function ProfitChart({ points }: { points: ProfitPoint[] }) {
  const width = 320;
  const height = 158;
  const left = 38;
  const right = 10;
  const top = 12;
  const bottom = 25;
  if (!points.length) return <div className="profit-empty"><span>↗</span><b>完成第一手後顯示</b><small>全押牌局會按當時 equity 計算 EV</small></div>;

  const plotted = [{ hand: 0, actual: 0, allInEv: 0, hadAllIn: false }, ...points];
  const values = plotted.flatMap(point => [point.actual, point.allInEv, 0]);
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const spread = Math.max(4, rawMax - rawMin);
  const minY = rawMin - spread * 0.12;
  const maxY = rawMax + spread * 0.12;
  const maxHand = Math.max(1, plotted[plotted.length - 1].hand);
  const x = (hand: number) => left + (hand / maxHand) * (width - left - right);
  const y = (value: number) => top + ((maxY - value) / (maxY - minY)) * (height - top - bottom);
  const line = (key: "actual" | "allInEv") => plotted.map(point => `${x(point.hand).toFixed(1)},${y(point[key]).toFixed(1)}`).join(" ");
  const ticks = [maxY, (maxY + minY) / 2, minY];

  return <div className="profit-chart-wrap">
    <svg className="profit-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="每手累積實際盈虧及 All-in EV 曲線">
      {ticks.map((tick, index) => <g key={index}><line x1={left} x2={width - right} y1={y(tick)} y2={y(tick)} className="chart-grid" /><text x={left - 6} y={y(tick) + 3} textAnchor="end">{tick >= 0 ? "+" : ""}{tick.toFixed(0)}</text></g>)}
      {minY < 0 && maxY > 0 && <line x1={left} x2={width - right} y1={y(0)} y2={y(0)} className="chart-zero" />}
      <polyline points={line("allInEv")} className="curve curve-ev" />
      <polyline points={line("actual")} className="curve curve-actual" />
      <circle cx={x(points[points.length - 1].hand)} cy={y(points[points.length - 1].allInEv)} r="3" className="curve-dot dot-ev" />
      <circle cx={x(points[points.length - 1].hand)} cy={y(points[points.length - 1].actual)} r="3" className="curve-dot dot-actual" />
      <text x={left} y={height - 6} textAnchor="start">0</text><text x={width - right} y={height - 6} textAnchor="end">第 {maxHand} 手</text>
    </svg>
  </div>;
}

function buildHandRecord(game: Game, decisions: CoachReview[]): HandRecord {
  const result = allInEvDelta(game);
  return {
    id: `${game.tableId}-${game.handNo}`,
    handNo: game.handNo,
    completedAt: Date.now(),
    tableSize: game.players.length,
    favourite: false,
    heroHole: [...game.players[0].hole],
    playerHoles: game.players.map(player => [...player.hole]),
    finalFolded: game.players.map(player => player.folded),
    board: [...game.board],
    winners: [...game.winners],
    message: game.message,
    potSummary: [...game.potSummary],
    frames: game.timeline.map(frame => ({ ...frame, board: [...frame.board], players: frame.players.map(player => ({ ...player })) })),
    decisions: [...decisions].sort((a, b) => a.actionId - b.actionId),
    aiDecisions: [...(game.aiDecisions ?? [])],
    actualProfit: result.actualDelta,
    allInEvProfit: result.adjustedDelta,
  };
}

function isSavedPokerState(value: unknown): value is SavedPokerState {
  if (!value || typeof value !== "object") return false;
  const state = value as Partial<SavedPokerState>;
  return (state.version === 1 || state.version === 2) && !!state.game && Array.isArray(state.game.players) && Array.isArray(state.sessions) && Array.isArray(state.handHistory);
}

function HandFilterPanel({ filter, onChange, currentPosition, tableSize = 8 }: { filter: HandFilter; onChange: (next: HandFilter) => void; currentPosition?: TablePosition; tableSize?: number }) {
  const [editingPosition, setEditingPosition] = useState<TablePosition>(currentPosition ?? "BTN");
  const activeHands = filter.scope === "position" ? filter.positionHands[editingPosition] : filter.hands;
  const selected = new Set(activeHands);
  const percent = rangePercent(activeHands);
  const currentHands = handsForPosition(filter, currentPosition);
  const currentPercent = rangePercent(currentHands);
  const canEnable = filter.scope === "global" ? filter.hands.length > 0 : RANGE_POSITIONS.some(position => filter.positionHands[position].length > 0);
  const setActiveHands = (hands: string[]) => {
    const enabled = filter.enabled && (filter.scope === "global" ? hands.length > 0 : true);
    if (filter.scope === "global") onChange({ ...filter, enabled, hands });
    else onChange({ ...filter, enabled, positionHands: { ...filter.positionHands, [editingPosition]: hands } });
  };
  return <details className="hand-filter-panel">
    <summary><span><b>起手牌篩選</b><small>{filter.enabled ? filter.scope === "position" ? `按位置 ON${currentPosition ? ` · 本手 ${currentPosition} 約 ${currentPercent}%` : " · 8 個獨立 range"}` : `全位置 ON · 約 ${percent}% range` : "已關閉 · 由你決定每手牌"}</small></span><span className="hand-filter-open">設定</span></summary>
    <div className="hand-filter-content">
      <label className="hand-filter-switch"><input type="checkbox" checked={filter.enabled} disabled={!canEnable} onChange={event => onChange({ ...filter, enabled: event.target.checked })} /><span>啟用自動棄牌</span></label>
      <p>適用於 Cash Game 同錦標賽翻牌前、你第一次行動；不在範圍內就自動 Fold，結束後自動開下一手。盲注仍會扣除；符合範圍嘅手牌由你自行操作。AOF 不受影響。</p>
      <div className="hand-filter-scope" role="group" aria-label="選擇起手牌範圍模式">
        <button type="button" className={filter.scope === "global" ? "selected" : ""} aria-pressed={filter.scope === "global"} onClick={() => onChange({ ...filter, scope: "global", enabled: filter.enabled && filter.hands.length > 0 })}>全位置共用</button>
        <button type="button" className={filter.scope === "position" ? "selected" : ""} aria-pressed={filter.scope === "position"} onClick={() => onChange({ ...filter, scope: "position" })}>按位置設定</button>
      </div>
      {filter.scope === "position" && <>
        <div className="hand-filter-position-tabs" role="tablist" aria-label="選擇要編輯嘅位置">
          {RANGE_POSITIONS.map(position => <button type="button" role="tab" key={position} className={`${editingPosition === position ? "selected" : ""} ${currentPosition === position ? "current" : ""}`} aria-selected={editingPosition === position} onClick={() => setEditingPosition(position)}><b>{position}</b><small>{rangePercent(filter.positionHands[position])}%</small></button>)}
        </div>
        <div className="hand-filter-position-note"><span>正在編輯 <b>{editingPosition}</b>{currentPosition === editingPosition ? " · 本手位置" : ""}</span><button type="button" onClick={() => onChange({ ...filter, positionHands: positionRangePresets(tableSize) })}>載入建議位置 ranges</button></div>
      </>}
      <div className="hand-filter-presets" role="group" aria-label="快捷起手牌範圍">
        {[10, 25, 40, 100].map(size => <button type="button" key={size} onClick={() => setActiveHands(rangePreset(size))}>約 {size}%</button>)}
        <button type="button" onClick={() => setActiveHands([])}>清空{filter.scope === "position" ? ` ${editingPosition}` : ""}</button>
      </div>
      <div className="hand-filter-description"><span>{filter.scope === "position" ? `${editingPosition} · ` : ""}已選 {activeHands.length}/169 格 · 約 {percent}% 組合</span><span>點擊牌型自訂 · 同花 s ／非同花 o</span></div>
      <div className="hand-filter-scroll"><div className="hand-filter-matrix" role="group" aria-label="169 種起手牌範圍">
        {RANGE_RANKS.map((_, row) => RANGE_RANKS.map((__, column) => {
          const code = rangeCell(row, column);
          return <button type="button" key={code} className={`${selected.has(code) ? "selected" : ""} ${row === column ? "pair" : row < column ? "suited" : "offsuit"}`} aria-pressed={selected.has(code)} aria-label={`${code} ${selected.has(code) ? "已選" : "未選"}`} onClick={() => {
            const hands = selected.has(code) ? activeHands.filter(hand => hand !== code) : [...activeHands, code];
            setActiveHands(hands);
          }}>{code}</button>;
        }))}
      </div></div>
      <small>快捷範圍按起手牌強度估算，唔係求解器 GTO 表。</small>
    </div>
  </details>;
}

function decisionActionLabel(decision: CoachReview) {
  if (decision.action === "fold") return "棄牌";
  if (decision.action === "raise") return "加注";
  if (decision.action === "checkcall") return /你選擇過牌/.test(decision.detail) ? "過牌" : "跟注";
  return (["棄牌", "過牌", "跟注", "加注"].find(label => decision.detail.includes(`你選擇${label}`)) ?? "其他");
}

function LeakBucketList({ title, items, totalLoss }: { title: string; items: Array<{ label: string; count: number; loss: number }>; totalLoss: number }) {
  return <section className="leak-breakdown"><div className="panel-title"><h3>{title}</h3><span>累積損失</span></div>{items.length ? items.slice(0, 6).map(item => <div className="leak-bar-row" key={item.label}><div><span>{item.label}</span><small>{item.count} 個決定</small></div><div className="leak-bar"><i style={{ width: `${Math.max(5, Math.min(100, totalLoss ? item.loss / totalLoss * 100 : 0))}%` }} /></div><b>−{fmt(item.loss)}BB</b></div>) : <p className="decision-empty">未有足夠資料。</p>}</section>;
}

function buildPracticePlan(history: HandRecord[]): PracticePlan {
  const decisions = history.flatMap(hand => hand.decisions);
  if (!decisions.length) return { label: "基礎決策診斷", reason: "未有足夠牌局資料，先用翻牌前、單挑池及河牌常見局面建立基準。", kinds: ["btn_open", "blind_defence", "flop_cbet", "turn_barrel", "river_bluffcatch"] };
  const totals = new Map<string, { street: Street; action: string; loss: number }>();
  decisions.forEach(decision => {
    const action = decisionActionLabel(decision);
    const key = `${decision.street}-${action}`;
    const item = totals.get(key) ?? { street: decision.street, action, loss: 0 };
    item.loss += decision.evLoss;
    totals.set(key, item);
  });
  const worst = [...totals.values()].sort((a, b) => b.loss - a.loss)[0];
  const kinds: ScenarioKind[] = worst.street === "preflop"
    ? worst.action === "棄牌" ? ["blind_defence", "btn_open", "vs_threebet"] : ["btn_open", "vs_threebet", "blind_defence"]
    : worst.street === "flop" ? worst.action === "加注" ? ["face_checkraise", "multiway_flop", "flop_cbet"] : ["flop_cbet", "face_checkraise", "multiway_flop"]
    : worst.street === "turn" ? ["turn_barrel", "face_checkraise", "flop_cbet"]
    : ["river_bluffcatch", "river_overbet", "turn_barrel"];
  return {
    label: `${STREET_LABEL[worst.street]} · ${worst.action}漏洞`,
    reason: `呢類決定累積估算損失 ${fmt(worst.loss)}BB；系統會按比例混合相關常見局面，生成10題專屬練習。`,
    kinds,
  };
}

function LeakFinderModal({ onClose }: { history: HandRecord[]; onOpenHand: (id: string) => void; onStartPractice: (plan: PracticePlan) => void; onClose: () => void }) {
  return <div className="review-overlay" role="dialog" aria-modal="true" aria-label="打法分析">
    <section className="review-modal leak-modal"><header className="review-header"><div><span>LEAK FINDER</span><h2>打法分析暫停</h2></div><button onClick={onClose} aria-label="關閉">×</button></header><div className="leak-content"><p>舊版漏洞分析依賴未經充分驗證嘅 EV loss，暫時停用。你仍然可以重播牌局及使用情境練習。</p></div></section>
  </div>;
}

function makeScenarioGame(kind: ScenarioKind, sequence: number) {
  const rng = seededRandom(91001 + sequence * 8191 + Object.keys(SCENARIO_INFO).indexOf(kind) * 131);
  const size = kind === "btn_open" ? 6 : kind === "multiway_flop" ? 3 : 2;
  const button = kind === "blind_defence" ? 1 : 0;
  const base = newHand(Array(size).fill(100), button, sequence, rng, Array(size).fill(0), `training-${kind}`);
  const players = base.players.map(player => ({ ...player }));
  let board: Card[] = [];
  let deck = [...base.deck];
  let street: Street = "preflop";
  let currentBet = 1;
  let minRaise = 1;
  let preflopRaises = 0;
  let prompt = SCENARIO_INFO[kind].prompt;

  const dealBoard = (count: number) => { board = deck.slice(-count); deck = deck.slice(0, -count); };

  if (kind === "blind_defence") {
    players[1] = { ...players[1], stack: 97.5, streetBet: 2.5, totalBet: 2.5, lastAction: "加注至 2.5" };
    players[0] = { ...players[0], stack: 99, streetBet: 1, totalBet: 1, lastAction: "BB 1" };
    currentBet = 2.5; minRaise = 1.5; preflopRaises = 1;
  } else if (kind === "vs_threebet") {
    players[0] = { ...players[0], stack: 97.5, streetBet: 2.5, totalBet: 2.5, lastAction: "開池至 2.5" };
    players[1] = { ...players[1], stack: 91, streetBet: 9, totalBet: 9, lastAction: "3-bet至 9" };
    currentBet = 9; minRaise = 6.5; preflopRaises = 2;
  } else if (kind === "flop_cbet") {
    dealBoard(3); street = "flop";
    players[0] = { ...players[0], stack: 97, streetBet: 0, totalBet: 3, lastAction: "翻牌前加注者" };
    players[1] = { ...players[1], stack: 97, streetBet: 0, totalBet: 3, lastAction: "過牌" };
    currentBet = 0; minRaise = 1; preflopRaises = 1;
    prompt = "單加注底池，對手翻牌過牌；比較過牌同不同c-bet策略。";
  } else if (kind === "face_checkraise") {
    dealBoard(3); street = "flop";
    players[0] = { ...players[0], stack: 92, streetBet: 5, totalBet: 8, lastAction: "C-bet 5" };
    players[1] = { ...players[1], stack: 82, streetBet: 15, totalBet: 18, lastAction: "Check-raise至15" };
    currentBet = 15; minRaise = 10; preflopRaises = 1;
    prompt = "你c-bet 5BB後被check-raise至15BB；決定棄牌、跟注或再加注。";
  } else if (kind === "turn_barrel") {
    dealBoard(4); street = "turn";
    players[0] = { ...players[0], stack: 90, streetBet: 0, totalBet: 10, lastAction: "翻牌下注獲跟注" };
    players[1] = { ...players[1], stack: 90, streetBet: 0, totalBet: 10, lastAction: "轉牌過牌" };
    currentBet = 0; minRaise = 1; preflopRaises = 1;
    prompt = "20BB底池，翻牌c-bet獲跟注，轉牌對手再過牌；比較check同second barrel。";
  } else if (kind === "river_bluffcatch") {
    dealBoard(5); street = "river";
    players[0] = { ...players[0], stack: 87, streetBet: 0, totalBet: 13, lastAction: "過牌" };
    players[1] = { ...players[1], stack: 75, streetBet: 12, totalBet: 25, lastAction: "下注 12" };
    currentBet = 12; minRaise = 12; preflopRaises = 1;
    prompt = `河牌面對12BB下注；底池目前${fmt(players[0].totalBet + players[1].totalBet)}BB。`;
  } else if (kind === "river_overbet") {
    dealBoard(5); street = "river";
    players[0] = { ...players[0], stack: 90, streetBet: 0, totalBet: 10, lastAction: "河牌過牌" };
    players[1] = { ...players[1], stack: 65, streetBet: 25, totalBet: 35, lastAction: "Overbet 25" };
    currentBet = 25; minRaise = 25; preflopRaises = 1;
    prompt = "20BB底池面對25BB（125%池）河牌overbet；用blocker同最低防守頻率判斷。";
  } else if (kind === "multiway_flop") {
    dealBoard(3); street = "flop";
    players.forEach((player, index) => { players[index] = { ...player, stack: 97, streetBet: 0, totalBet: 3, lastAction: index === 0 ? "輪到你" : "過牌" }; });
    currentBet = 0; minRaise = 1; preflopRaises = 1;
    prompt = "三人單加注底池，兩位對手過牌；多人池需要更強value同更低bluff頻率。";
  }
  const game: Game = { ...base, players, board, deck, street, currentBet, minRaise, preflopRaises, turn: 0, pending: players.map((_, index) => index === 0), message: prompt, timeline: [], aiDecisions: [] };
  return { ...game, timeline: [captureFrame(game, prompt, null)] };
}

function ScenarioTrainer({ plan, onClose }: { plan: PracticePlan | null; onClose: () => void }) {
  const initialKind = plan?.kinds[0] ?? "btn_open";
  const [kind, setKind] = useState<ScenarioKind>(initialKind);
  const [sequence, setSequence] = useState(1);
  const [game, setGame] = useState(() => makeScenarioGame(initialKind, 1));
  const [answer, setAnswer] = useState<CoachReview | null>(null);
  const [summary, setSummary] = useState({ answered: 0, score: 0, loss: 0 });
  const hero = game.players[0];
  const pot = potTotal(game);
  const toCall = Math.max(0, game.currentBet - hero.streetBet);
  const raiseTarget = kind === "btn_open" ? 2.5 : kind === "blind_defence" ? 9.5 : kind === "vs_threebet" ? 21 : kind === "face_checkraise" ? 36 : suggestedRaiseTarget(game);
  const changeKind = (next: ScenarioKind) => { setKind(next); setSequence(value => value + 1); setGame(makeScenarioGame(next, sequence + 1)); setAnswer(null); };
  const nextQuestion = () => { const next = sequence + 1; const nextKind = plan ? plan.kinds[summary.answered % plan.kinds.length] : kind; setSequence(next); setKind(nextKind); setGame(makeScenarioGame(nextKind, next)); setAnswer(null); };
  const restart = () => { const next = sequence + 1; const nextKind = plan?.kinds[0] ?? kind; setSequence(next); setKind(nextKind); setGame(makeScenarioGame(nextKind, next)); setAnswer(null); setSummary({ answered: 0, score: 0, loss: 0 }); };
  const choose = (action: HeroAction) => {
    if (answer) return;
    const review = rateHeroDecision(game, action, action === "raise" ? raiseTarget : 0);
    setAnswer(review);
    setSummary(previous => ({ answered: previous.answered + 1, score: previous.score + review.score, loss: previous.loss + review.evLoss }));
  };

  return <div className="review-overlay" role="dialog" aria-modal="true" aria-label="情境訓練模式">
    <section className="review-modal scenario-modal">
      <header className="review-header"><div><span>SCENARIO LAB</span><h2>情境訓練模式</h2></div><button onClick={onClose} aria-label="關閉情境訓練">×</button></header>
      <div className="scenario-content">
        {plan ? <div className="practice-focus"><div><span>LEAK FINDER PERSONAL DRILL</span><b>{plan.label}</b><p>{plan.reason}</p></div><strong>{Math.min(summary.answered + (answer ? 0 : 1), 10)} / 10</strong></div> : <nav className="scenario-tabs">{(Object.keys(SCENARIO_INFO) as ScenarioKind[]).map(item => <button key={item} className={item === kind ? "active" : ""} onClick={() => changeKind(item)}><b>{SCENARIO_INFO[item].label}</b><small>{SCENARIO_INFO[item].short}</small></button>)}</nav>}
        <div className="scenario-score"><span>{plan ? "個人化訓練" : "本次訓練"}</span><b>{summary.answered}{plan ? "/10" : ""} 題</b></div>
        <section className="scenario-question">
          <div className="scenario-heading"><div><span>{SCENARIO_INFO[kind].short} · 第 {sequence} 題</span><h3>{SCENARIO_INFO[kind].label}</h3><p>{game.message}</p></div><div><span>位置</span><b>{displayPosition(game, 0)}</b></div></div>
          <div className="scenario-table"><div className="scenario-pot">底池 <b>{fmt(pot)}BB</b></div><div className="scenario-board">{[0,1,2,3,4].map(index => <CardView key={index} card={game.board[index]} mini />)}</div><div className="scenario-hole"><span>你嘅底牌</span><div>{hero.hole.map((card, index) => <CardView key={index} card={card} />)}</div></div></div>
          <div className="scenario-context"><span>要跟 {fmt(Math.min(toCall, hero.stack))}BB</span><span>有效籌碼 {fmt(hero.stack + hero.streetBet)}BB</span><span>{game.street === "preflop" ? "100BB位置range" : `牌面濕度 ${Math.round(boardWetness(game.board) * 100)}%`}</span></div>
          <div className="scenario-actions"><button disabled={!!answer} onClick={() => choose("fold")}>棄牌</button><button disabled={!!answer} onClick={() => choose("checkcall")}>{toCall ? `跟注 ${fmt(toCall)}` : "過牌"}</button><button disabled={!!answer} className="primary" onClick={() => choose("raise")}>{game.currentBet > 0 ? "加注至" : "下注"} {fmt(raiseTarget)}BB</button></div>
          {answer && <div className="scenario-answer"><div><span>你嘅選擇</span><strong>{decisionActionLabel(answer)}</strong><p>評分及 EV loss 暫停使用；可以繼續思考其他行動及背後原因。</p></div><button onClick={plan && summary.answered >= 10 ? restart : nextQuestion}>{plan && summary.answered >= 10 ? "再練10題 ↻" : "下一題 →"}</button></div>}
        </section>
        <p className="model-note">訓練結果唔會改動正式牌桌籌碼；自動評分暫停使用。</p>
      </div>
    </section>
  </div>;
}

function HandReviewModal({ history, selectedId, replayIndex, studyMode, onStudyMode, onSelect, onReplay, onToggleFavourite, onClose }: {
  history: HandRecord[]; selectedId: string | null; replayIndex: number;
  studyMode: boolean; onStudyMode: () => void;
  onSelect: (id: string) => void; onReplay: (index: number) => void;
  onToggleFavourite: (id: string) => void; onClose: () => void;
}) {
  const ordered = [...history].sort((a, b) => Number(b.favourite) - Number(a.favourite) || b.completedAt - a.completedAt);
  const selected = history.find(hand => hand.id === selectedId) ?? ordered[0];
  const frame = selected?.frames[Math.min(replayIndex, Math.max(0, selected.frames.length - 1))];
  const lastFrame = !!selected && replayIndex >= selected.frames.length - 1;
  const streetStarts = selected ? (["preflop", "flop", "turn", "river"] as Street[]).map(street => ({ street, index: selected.frames.findIndex(item => item.street === street) })).filter(item => item.index >= 0) : [];

  return <div className="review-overlay" role="dialog" aria-modal="true" aria-label="牌局紀錄及重播">
    <section className="review-modal">
      <header className="review-header"><div><span>HAND REVIEW</span><h2>最近 {history.length} 手牌</h2></div><div className="review-header-actions"><button className={studyMode ? "study-active" : ""} onClick={onStudyMode}>Study {studyMode ? "ON" : "OFF"}</button><button onClick={onClose} aria-label="關閉牌局紀錄">×</button></div></header>
      {!history.length ? <div className="review-empty"><b>未有已完成牌局</b><p>完成第一手後，完整行動同教練分析會自動保存。</p></div> : <div className="review-layout">
        <aside className="review-list" aria-label="最近100手牌">
          {ordered.map(hand => <div key={hand.id} className={`review-list-row ${selected?.id === hand.id ? "selected" : ""}`}>
            <button className="review-select" onClick={() => onSelect(hand.id)}><span className="review-hand-no">#{hand.handNo}</span><span className="review-hole">{hand.heroHole.map(card => `${RANK_LABEL[card.rank] ?? card.rank}${SUIT_GLYPH[card.suit]}`).join(" ")}</span><span className={hand.actualProfit >= 0 ? "positive" : "negative"}>{hand.actualProfit >= 0 ? "+" : ""}{fmt(hand.actualProfit)}BB</span><small>{hand.tableSize}-MAX · {new Date(hand.completedAt).toLocaleDateString("zh-HK", { month: "numeric", day: "numeric" })}</small></button>
            <button className={`review-star ${hand.favourite ? "starred" : ""}`} onClick={() => onToggleFavourite(hand.id)} aria-label={hand.favourite ? "取消收藏" : "收藏牌局"}>★</button>
          </div>)}
        </aside>
        {selected && frame && <article className="replayer">
          <div className="replayer-summary"><div><span>第 {selected.handNo} 手 · {selected.tableSize}-MAX</span><strong>{selected.message}</strong></div><button className={selected.favourite ? "starred" : ""} onClick={() => onToggleFavourite(selected.id)}>★ {selected.favourite ? "已收藏" : "收藏"}</button></div>
          <div className="replay-metrics"><span>實際 <b className={selected.actualProfit >= 0 ? "positive" : "negative"}>{selected.actualProfit >= 0 ? "+" : ""}{fmt(selected.actualProfit)}BB</b></span><span>All-in EV <b>{selected.allInEvProfit >= 0 ? "+" : ""}{fmt(selected.allInEvProfit)}BB</b></span></div>
          <div className="street-jumps">{streetStarts.map(item => <button key={item.street} className={frame.street === item.street ? "active" : ""} onClick={() => onReplay(item.index)}>{STREET_LABEL[item.street]}</button>)}<button className={lastFrame ? "active" : ""} onClick={() => onReplay(selected.frames.length - 1)}>結果</button></div>
          <div className="replay-table">
            <div className="replay-pot">底池 <b>{fmt(frame.pot)}BB</b></div>
            <div className="replay-board">{[0,1,2,3,4].map(index => <CardView key={index} card={frame.board[index]} mini />)}</div>
            <div className="replay-hero"><span>你嘅底牌</span><div>{selected.heroHole.map((card, index) => <CardView key={index} card={card} mini />)}</div></div>
          </div>
          <div className="replay-action"><span>{STREET_LABEL[frame.street]} · 步驟 {replayIndex + 1}/{selected.frames.length}</span><b>{frame.action}</b></div>
          <div className={`replay-seats seats-${selected.tableSize}`}>{frame.players.map((player, index) => <div key={player.id} className={`${player.folded ? "folded" : ""} ${frame.actor === index ? "acting" : ""}`}><span>{player.name}</span><b>{fmt(player.stack)}BB</b><small>{player.lastAction || "—"}</small></div>)}</div>
          {lastFrame && <div className="replay-showdown">{selected.playerHoles.map((hole, index) => index > 0 && (studyMode || !selected.finalFolded[index]) ? <div key={index} className={selected.finalFolded[index] ? "study-mucked" : ""}><b>{PLAYER_NAMES[index]}{selected.finalFolded[index] ? " · 已棄牌" : ""}</b><span>{hole.map(card => `${RANK_LABEL[card.rank] ?? card.rank}${SUIT_GLYPH[card.suit]}`).join(" ")}</span></div> : null)}</div>}
          <div className="replay-nav"><button disabled={replayIndex <= 0} onClick={() => onReplay(Math.max(0, replayIndex - 1))}>← 上一步</button><button disabled={replayIndex >= selected.frames.length - 1} onClick={() => onReplay(Math.min(selected.frames.length - 1, replayIndex + 1))}>下一步 →</button></div>
          <section className="decision-review"><div className="panel-title"><h3>你嘅決定</h3><span>行動紀錄</span></div>{selected.decisions.length ? selected.decisions.map(decision => <div key={decision.id} className="decision-row"><div><span>{STREET_LABEL[decision.street]}</span><b>{decisionActionLabel(decision)}</b></div></div>) : <p className="decision-empty">呢手未有記錄玩家行動。</p>}</section>
          {studyMode && <section className="study-review"><div className="panel-title"><h3>AI決策解釋</h3><span>完手後揭示</span></div>{selected.aiDecisions?.length ? selected.aiDecisions.map(decision => <div className="study-decision" key={decision.id}><div><span>{STREET_LABEL[decision.street]} · {PLAYER_NAMES[decision.actor]}</span><b>{decision.title}</b><p>{decision.detail}</p><small>{decision.range}</small></div><div>{decision.metrics.map(metric => <i key={metric}>{metric}</i>)}</div></div>) : <p className="decision-empty">舊牌局未有AI決策資料；新完成嘅牌局會自動記錄。</p>}</section>}
        </article>}
      </div>}
    </section>
  </div>;
}

export default function Home() {
  const [aof, setAof] = useState<AofState | null>(null);
  const [aofOpen, setAofOpen] = useState(false);
  const [game, setGame] = useState<Game>(() => newHand(Array(8).fill(100), 0, 1, seededRandom(8001)));
  const [started, setStarted] = useState(false);
  const [entryView, setEntryView] = useState<"home" | "setup" | "table">("home");
  const [setupMode, setSetupMode] = useState<"cash" | "tournament" | "aof">("cash");
  const [hasActiveTable, setHasActiveTable] = useState(false);
  const [gameMode, setGameMode] = useState<GameMode>("cash");
  const [lobbyGameMode, setLobbyGameMode] = useState<GameMode>("cash");
  const [tournamentSpeed, setTournamentSpeed] = useState<TournamentSpeed>("turbo");
  const [lobbyTournamentSpeed, setLobbyTournamentSpeed] = useState<TournamentSpeed>("turbo");
  const [career, setCareer] = useState<CareerWallet>(() => newCareerWallet());
  const careerRef = useRef<CareerWallet>(career);
  const aofRef = useRef<AofState | null>(aof);
  const [lobbyCashBb, setLobbyCashBb] = useState(1);
  const [lobbyTournamentEntry, setLobbyTournamentEntry] = useState(50);
  const [lobbyAofBb, setLobbyAofBb] = useState(1);
  const [bankrollMessage, setBankrollMessage] = useState("");
  const [lobbySize, setLobbySize] = useState(8);
  const [lobbyMtt, setLobbyMtt] = useState(false);
  const [mtt, setMtt] = useState<MttField | null>(null);
  const [clockNow, setClockNow] = useState(() => Date.now());
  const [tournamentClock, setTournamentClock] = useState<TournamentDecisionClock | null>(null);
  const [tournamentInfoOpen, setTournamentInfoOpen] = useState(false);
  const [autoResume, setAutoResume] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [localRecovery, setLocalRecovery] = useState<SavedPokerState | null>(null);
  const [cloudRecovery, setCloudRecovery] = useState<SavedPokerState | null>(null);
  const [mttHighlightsOpen, setMttHighlightsOpen] = useState(false);
  const [selectedMttHighlight, setSelectedMttHighlight] = useState<string | null>(null);
  const mttClockActiveRef = useRef<boolean | null>(null);
  const [mttSessions, setMttSessions] = useState<PlayerSessionStats[] | null>(null);
  const [raiseTo, setRaiseTo] = useState(2.5);
  const [raiseDraft, setRaiseDraft] = useState<string | null>(null);
  const [difficulty, setDifficulty] = useState<Difficulty>("hard");
  const [sessions, setSessions] = useState<PlayerSessionStats[]>(() => PLAYER_NAMES.map(() => emptySessionStats()));
  const [coachReviews, setCoachReviews] = useState<CoachReview[]>([]);
  const [selectedSeat, setSelectedSeat] = useState(0);
  const [hint, setHint] = useState<GtoHint | null>(null);
  const [profitHistory, setProfitHistory] = useState<ProfitPoint[]>([]);
  const [handHistory, setHandHistory] = useState<HandRecord[]>([]);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [leakFinderOpen, setLeakFinderOpen] = useState(false);
  const [scenarioOpen, setScenarioOpen] = useState(false);
  const [practicePlan, setPracticePlan] = useState<PracticePlan | null>(null);
  const [studyMode, setStudyMode] = useState(false);
  const [handFilter, setHandFilter] = useState<HandFilter>(() => restoreHandFilter(null));
  const [selectedHandId, setSelectedHandId] = useState<string | null>(null);
  const [replayIndex, setReplayIndex] = useState(0);
  const [restoreReady, setRestoreReady] = useState(false);
  const [persistenceReady, setPersistenceReady] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"loading" | "saving" | "saved" | "error">("loading");
  const [saveConflict, setSaveConflict] = useState(false);
  const [saveFailure, setSaveFailure] = useState("");
  const [tableMotion, setTableMotion] = useState<StandardTableMotion | null>(null);
  const [motionMode, setMotionMode] = useState<"normal" | "fast" | "off">("normal");
  const previousTable = useRef<Game | null>(null);
  const motionSerial = useRef(0);
  useEffect(() => {
    const saved = window.localStorage.getItem("poker-standard-motion");
    if (saved === "normal" || saved === "fast" || saved === "off") setMotionMode(saved);
    setAutoResume(window.localStorage.getItem("poker-auto-resume") === "yes");
  }, []);
  const changeMotionMode = (mode: "normal" | "fast" | "off") => {
    setMotionMode(mode);
    window.localStorage.setItem("poker-standard-motion", mode);
  };
  const saveRevision = useRef(0);
  const cacheOwner = useRef<string | null>(null);
  const saveInFlight = useRef(false);
  const pendingSave = useRef<string | null>(null);
  const lastScheduledCareer = useRef(career);
  const recordedHand = useRef("");
  const timedOutTurn = useRef("");
  careerRef.current = career;
  aofRef.current = aof;
  const hero = game.players[0];
  const pot = potTotal(game);
  const toCall = Math.max(0, game.currentBet - hero.streetBet);
  const maxTo = hero.streetBet + hero.stack;
  const minTo = Math.min(maxTo, game.currentBet + game.minRaise);
  const canRaise = canAct(hero) && maxTo > game.currentBet;
  const heroPosition = tablePosition(game, 0);
  const tableSize = game.players.length;
  const thinking = game.turn !== null && game.turn !== 0 && !game.finished ? game.players[game.turn].name : "";
  const effectiveRaiseTo = Math.max(minTo, Math.min(maxTo, raiseTo));
  const facingRaise = game.street === "preflop" ? game.preflopRaises > 0 : game.currentBet > 0;
  const preset = (kind: "open2" | "open25" | "open3" | "half" | "pot" | "x2" | "x3" | "allin") => {
    if (kind === "allin") return setRaiseTo(maxTo);
    const bb = game.bigBlind ?? 1;
    if (kind === "open2") return setRaiseTo(chip(Math.min(maxTo, Math.max(minTo, bb * 2))));
    if (kind === "open25") return setRaiseTo(chip(Math.min(maxTo, Math.max(minTo, bb * 2.5))));
    if (kind === "open3") return setRaiseTo(chip(Math.min(maxTo, Math.max(minTo, bb * 3))));
    if (kind === "half") return setRaiseTo(chip(Math.min(maxTo, Math.max(minTo, game.currentBet + pot * 0.5))));
    if (kind === "pot") return setRaiseTo(chip(Math.min(maxTo, Math.max(minTo, game.currentBet + pot))));
    return setRaiseTo(chip(Math.min(maxTo, Math.max(minTo, game.currentBet * (kind === "x2" ? 2 : 3)))));
  };

  const hydrateSaved = (saved: SavedPokerState) => {
    setAof(saved.aof ?? null);
    const resume = window.localStorage.getItem("poker-auto-resume") === "yes";
    setCareer(restoreCareerWallet(saved.career, saved.version === 1));
    setLobbyCashBb(CASH_BIG_BLINDS.includes(saved.lobbyCashBb as typeof CASH_BIG_BLINDS[number]) ? saved.lobbyCashBb! : 1);
    setLobbyTournamentEntry(TOURNAMENT_ENTRIES.includes(saved.lobbyTournamentEntry as typeof TOURNAMENT_ENTRIES[number]) ? saved.lobbyTournamentEntry! : 50);
    setLobbyAofBb(AOF_BIG_BLINDS.includes(saved.lobbyAofBb as typeof AOF_BIG_BLINDS[number]) ? saved.lobbyAofBb! : 1);
    const legacyFinishes = saved.gameMode === "tournament" && !saved.game.tournamentFinishes
      ? saved.game.players.filter(player => player.stack <= 0).map(player => ({ seat: player.id, place: tournamentCanContinue(saved.game.players.map(seat => seat.stack)) + 1, handNo: saved.game.handNo }))
      : saved.game.tournamentFinishes;
    setGame({ ...saved.game, timeline: saved.game.timeline ?? [], aiDecisions: saved.game.aiDecisions ?? [], smallBlind: saved.game.smallBlind ?? 0.5, bigBlind: saved.game.bigBlind ?? 1, tournamentFinishes: legacyFinishes });
    setStarted(resume && !!saved.started);
    setEntryView(resume && (saved.aofOpen && saved.aof || saved.started) ? "table" : "home");
    setAofOpen(resume && !!saved.aofOpen && !!saved.aof);
    setHasActiveTable(saved.hasActiveTable);
    setGameMode(saved.gameMode === "tournament" ? "tournament" : "cash");
    setLobbyGameMode(saved.lobbyGameMode === "tournament" ? "tournament" : saved.gameMode === "tournament" ? "tournament" : "cash");
    setTournamentSpeed(saved.tournamentSpeed && saved.tournamentSpeed in TOURNAMENT_SPEEDS ? saved.tournamentSpeed : "turbo");
    setLobbyTournamentSpeed(saved.lobbyTournamentSpeed && saved.lobbyTournamentSpeed in TOURNAMENT_SPEEDS ? saved.lobbyTournamentSpeed : saved.tournamentSpeed && saved.tournamentSpeed in TOURNAMENT_SPEEDS ? saved.tournamentSpeed : "turbo");
    setLobbySize(saved.lobbySize);
    setLobbyMtt(saved.lobbyMtt ?? false);
    setMtt(isMttField(saved.mtt) ? restoreMttField(saved.mtt) : null);
    setMttSessions(isMttField(saved.mtt) && Array.isArray(saved.mttSessions) && saved.mttSessions.length === MTT_ENTRIES ? saved.mttSessions : null);
    setTournamentClock(restoreDecisionClock(saved.tournamentClock));
    setDifficulty(saved.difficulty);
    setSessions(saved.sessions);
    setCoachReviews(saved.coachReviews ?? []);
    setProfitHistory(saved.profitHistory ?? []);
    setHandHistory(saved.handHistory.slice(0, 100));
    setStudyMode(saved.studyMode ?? false);
    setHandFilter(restoreHandFilter(saved.handFilter));
    const handKey = `${saved.game.tableId}-${saved.game.handNo}`;
    recordedHand.current = saved.game.finished && saved.handHistory.some(hand => hand.id === handKey) ? handKey : "";
    setLastSavedAt(saved.savedAt);
  };

  useEffect(() => {
    let active = true;
    pokerStateFetch("/api/poker-state", { cache: "no-store" })
      .then(async response => {
        if (response.ok) return response.json();
        const details = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(details.error === "Browser save is unavailable or damaged" ? "瀏覽器存檔無法讀取或已損壞。" : details.error || "讀取存檔失敗");
      })
      .then((payload: { state?: unknown; updatedAt?: number | null; cacheOwner?: string }) => {
        if (!active) return false;
        saveRevision.current = payload.updatedAt ?? 0;
        cacheOwner.current = typeof payload.cacheOwner === "string" ? payload.cacheOwner : null;
        let localCandidate: SavedPokerState | null = null;
        try {
          const local = cacheOwner.current && window.localStorage.getItem(`poker-local-save:${cacheOwner.current}`);
          if (local) { const candidate: unknown = JSON.parse(local); if (isSavedPokerState(candidate)) localCandidate = candidate; }
        } catch { /* Keep the cloud version when browser storage is unavailable. */ }
        if (isSavedPokerState(payload.state)) {
          if (localCandidate && localCandidate.savedAt > payload.state.savedAt + 1000) {
            setLocalRecovery(localCandidate);
            setCloudRecovery(payload.state);
            return false;
          }
          hydrateSaved(payload.state);
          try { if (cacheOwner.current) window.localStorage.setItem(`poker-local-save:${cacheOwner.current}`, JSON.stringify(payload.state)); } catch { /* Local backup may exceed browser quota. */ }
          return true;
        }
        if (localCandidate) { setLocalRecovery(localCandidate); return false; }
        if (payload.state != null) throw new Error("存檔格式無法辨認");
        return true;
      })
      .then(ready => { if (active && ready) { setPersistenceReady(true); setSaveStatus("saved"); } })
      .catch((error: unknown) => { if (active) { setSaveFailure(error instanceof Error && error.message.startsWith("Career ") ? "職涯資金記錄未能通過檢查；請先下載備份。" : error instanceof Error ? error.message : "讀取存檔失敗"); setSaveStatus("error"); } })
      .finally(() => { if (active) setRestoreReady(true); });
    return () => { active = false; };
  }, []);

  const tournamentTurnKey = `${game.tableId}:${game.handNo}:${game.actionId}:${game.street}`;
  const timedTurnActive = restoreReady && started && !aofOpen && gameMode === "tournament" && !game.finished && game.turn === 0;
  useEffect(() => {
    if (!restoreReady) return;
    setTournamentClock(previous => {
      if (!timedTurnActive || document.hidden) return previous?.runningAt !== null && previous ? pauseDecisionClock(previous) : previous;
      if (previous?.turnKey !== tournamentTurnKey) return newDecisionClock(tournamentTurnKey, previous?.bankMs ?? 90_000);
      return previous.runningAt === null ? { ...previous, runningAt: Date.now() } : previous;
    });
  }, [restoreReady, timedTurnActive, tournamentTurnKey]);

  useEffect(() => {
    if (!timedTurnActive || document.hidden) return;
    const timer = window.setInterval(() => setTournamentClock(previous => previous?.turnKey === tournamentTurnKey ? tickDecisionClock(previous) : previous), 1000);
    return () => window.clearInterval(timer);
  }, [timedTurnActive, tournamentTurnKey]);

  useEffect(() => {
    const handleVisibility = () => setTournamentClock(previous => {
      if (!previous || !timedTurnActive) return previous;
      if (document.hidden) return pauseDecisionClock(previous);
      return previous.runningAt === null ? { ...previous, runningAt: Date.now() } : previous;
    });
    const handlePageHide = () => setTournamentClock(previous => previous ? pauseDecisionClock(previous) : previous);
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("pagehide", handlePageHide);
    return () => { document.removeEventListener("visibilitychange", handleVisibility); window.removeEventListener("pagehide", handlePageHide); };
  }, [timedTurnActive]);

  useEffect(() => {
    if (!timedTurnActive || tournamentClock?.turnKey !== tournamentTurnKey || tournamentClock.remainingMs > 0 || timedOutTurn.current === tournamentTurnKey) return;
    timedOutTurn.current = tournamentTurnKey;
    heroAction(game.currentBet > game.players[0].streetBet ? "fold" : "checkcall");
  }, [timedTurnActive, tournamentTurnKey, tournamentClock?.remainingMs]);

  useEffect(() => {
    if (!restoreReady || !started || aofOpen || game.turn === null || game.turn === 0 || game.finished) return;
    const actor = game.turn;
    const timer = window.setTimeout(() => {
      setGame(previous => {
        if (previous.turn !== actor || previous.finished) return previous;
        const moved = aiMove(previous, actor, difficulty, mtt);
        return recordAiStudyDecision(previous, moved, actor, difficulty);
      });
    }, 360 + Math.random() * 360);
    return () => window.clearTimeout(timer);
  }, [restoreReady, started, aofOpen, game.turn, game.finished, game.handNo, game.actionId, difficulty, mtt]);

  useEffect(() => {
    if (!restoreReady) return;
    const previous = previousTable.current;
    previousTable.current = game;
    if (!started || aofOpen) { setTableMotion(null); return; }
    if (!previous || previous === game) return;
    const deal = previous.tableId !== game.tableId || previous.handNo !== game.handNo;
    const boardFrom = !deal && game.board.length > previous.board.length ? previous.board.length : null;
    const foldedSeat = !deal ? game.players.findIndex((seat, index) => !previous.players[index]?.folded && seat.folded) : -1;
    const chipSeat = !deal ? game.players.findIndex((seat, index) =>
      Math.max(seat.totalBet, game.settledBets[index] ?? 0) > (previous.players[index]?.totalBet ?? 0) + 0.001 && !seat.folded) : -1;
    const winners = !deal && !previous.finished && game.finished ? game.winners : [];
    if (deal || boardFrom !== null || foldedSeat >= 0 || chipSeat >= 0 || winners.length) {
      setTableMotion({ id: ++motionSerial.current, tableId: game.tableId, handNo: game.handNo, deal, boardFrom, foldedSeat: foldedSeat >= 0 ? foldedSeat : null, chipSeat: chipSeat >= 0 ? chipSeat : null, winners });
    }
  }, [restoreReady, started, aofOpen, game]);

  useEffect(() => {
    if (!restoreReady || !started || aofOpen || !handFilter.enabled || game.finished || game.street !== "preflop" || game.turn !== 0) return;
    if (game.timeline.some(frame => frame.actor === 0 && frame.street === "preflop")) return;
    if (!shouldAutoFold(game.players[0].hole, handFilter, heroPosition)) return;
    const timer = window.setTimeout(() => {
      setHint(null);
      setGame(previous => {
        if (previous.finished || previous.street !== "preflop" || previous.turn !== 0 || previous.timeline.some(frame => frame.actor === 0 && frame.street === "preflop") || !shouldAutoFold(previous.players[0].hole, handFilter, tablePosition(previous, 0))) return previous;
        return act(previous, 0, "fold", 0, true);
      });
    }, 500);
    return () => window.clearTimeout(timer);
  }, [restoreReady, started, aofOpen, handFilter, game.turn, game.finished, game.street, game.actionId, game.tableId, game.handNo]);

  useEffect(() => {
    const handKey = `${game.tableId}-${game.handNo}`;
    if (!restoreReady || !started || !game.finished || recordedHand.current === handKey) return;
    recordedHand.current = handKey;
    const result = allInEvDelta(game);
    const decisions = coachReviews.filter(review => review.id.startsWith(`${handKey}-`));
    const record = buildHandRecord(game, decisions);
    setHandHistory(previous => [record, ...previous.filter(hand => hand.id !== record.id)].slice(0, 100));
    setProfitHistory(previous => {
      const last = previous[previous.length - 1];
      return [...previous, {
        hand: (last?.hand ?? 0) + 1,
        actual: (last?.actual ?? 0) + result.actualDelta,
        allInEv: (last?.allInEv ?? 0) + result.adjustedDelta,
        hadAllIn: result.hadAllIn,
      }];
    });
    setSessions(previous => previous.map((stats, index) => {
      const sawShowdown = game.street === "showdown" && !game.players[index].folded;
      return settlePlayerSession(stats, game.handTrackers[index], {
        active: game.startingStacks[index] > 0,
        startStack: game.startingStacks[index],
        endStack: game.players[index].stack,
        sawFlop: game.handTrackers[index].sawFlop,
        sawShowdown,
        wonShowdown: sawShowdown && game.winners.includes(index),
      });
    }));
    if (mtt && game.mttSeatIds) setMttSessions(previous => {
      const next = previous?.length === MTT_ENTRIES ? [...previous] : Array.from({ length: MTT_ENTRIES }, () => emptySessionStats());
      game.mttSeatIds!.forEach((id, index) => {
        const sawShowdown = game.street === "showdown" && !game.players[index].folded;
        next[id] = settlePlayerSession(next[id], game.handTrackers[index], {
          active: game.startingStacks[index] > 0, startStack: game.startingStacks[index], endStack: game.players[index].stack,
          sawFlop: game.handTrackers[index].sawFlop, sawShowdown, wonShowdown: sawShowdown && game.winners.includes(index),
        });
      });
      return next;
    });
  }, [restoreReady, started, game, coachReviews, mtt]);

  useEffect(() => {
    if (!restoreReady || !persistenceReady) return;
    const payload: SavedPokerState = {
      aof: aof ?? undefined, aofOpen,
      version: 2,
      savedAt: Date.now(),
      game,
      started,
      hasActiveTable,
      gameMode,
      lobbyGameMode,
      tournamentSpeed,
      lobbyTournamentSpeed,
      career,
      lobbyCashBb,
      lobbyTournamentEntry,
      lobbyAofBb,
      lobbySize,
      lobbyMtt,
      mtt: mtt ?? undefined,
      mttSessions: mttSessions ?? undefined,
      tournamentClock,
      difficulty,
      sessions,
      coachReviews,
      profitHistory,
      handHistory: handHistory.slice(0, 100),
      studyMode,
      handFilter,
    };
    const flush = async (leavingPage = false) => {
      if (saveInFlight.current || saveConflict) return;
      saveInFlight.current = true;
      let attempted: string | null = null;
      let retrying = false;
      try {
        while (pendingSave.current) {
          const body = pendingSave.current;
          attempted = body;
          pendingSave.current = null;
          setSaveStatus("saving");
          const response = await pokerStateFetch("/api/poker-state", {
            method: "PUT",
            headers: { "content-type": "application/json", "x-save-revision": String(saveRevision.current) },
            body,
            keepalive: saveKeepalive(body, leavingPage),
          });
          if (response.status === 409) {
            setSaveConflict(true); setSaveStatus("error"); setSaveFailure("另一個分頁已更新存檔，請重新載入最新版本。"); pendingSave.current = null;
            return;
          }
          if (response.status >= 400 && response.status < 500) {
            setSaveConflict(true); setSaveStatus("error"); setSaveFailure(response.status === 401 ? "登入驗證已失效，請重新載入並再次進入網站。" : response.status === 413 ? "瀏覽器儲存空間不足或儲存被停用；目前畫面仍保留進度。" : `儲存被伺服器拒絕（${response.status}）。`); pendingSave.current = null;
            return;
          }
          if (!response.ok) throw new Error("save failed");
          const result = await response.json() as { updatedAt: number };
          saveRevision.current = result.updatedAt;
          setLastSavedAt((JSON.parse(body) as SavedPokerState).savedAt);
          try { if (cacheOwner.current) window.localStorage.setItem(`poker-local-save:${cacheOwner.current}`, body); } catch { /* Cloud save remains authoritative. */ }
        }
        setSaveFailure(""); setSaveStatus("saved");
      } catch {
        retrying = true;
        pendingSave.current ??= attempted;
        setSaveFailure("本機儲存暫時失敗，正每三秒重試；請保持頁面開啟。"); setSaveStatus("error");
        window.setTimeout(() => { void flush(); }, 3000);
      } finally {
        saveInFlight.current = false;
        if (!retrying && pendingSave.current && !saveConflict) queueMicrotask(() => { void flush(); });
      }
    };
    const urgent = lastScheduledCareer.current !== career;
    lastScheduledCareer.current = career;
    pendingSave.current = JSON.stringify(payload);
    try { if (cacheOwner.current) window.localStorage.setItem(`poker-local-save:${cacheOwner.current}`, pendingSave.current); } catch { /* Cloud sync still proceeds if local quota is full. */ }
    const timer = window.setTimeout(() => { void flush(); }, urgent ? 0 : 180);
    const onPageHide = () => { window.clearTimeout(timer); void flush(true); };
    window.addEventListener("pagehide", onPageHide);
    return () => { window.clearTimeout(timer); window.removeEventListener("pagehide", onPageHide); };
  }, [restoreReady, persistenceReady, game, started, hasActiveTable, gameMode, lobbyGameMode, tournamentSpeed, lobbyTournamentSpeed, career, lobbyCashBb, lobbyTournamentEntry, lobbyAofBb, lobbySize, lobbyMtt, mtt, mttSessions, tournamentClock, difficulty, sessions, coachReviews, profitHistory, handHistory, studyMode, handFilter, aof, aofOpen, saveConflict]);

  const heroHand = useMemo(() => game.board.length >= 3 ? HAND_LABEL[bestScore([...hero.hole, ...game.board])[0]] : "", [hero.hole, game.board]);
  const isTournament = gameMode === "tournament";
  const playersAbleToContinue = mtt && isTournament ? mttRemaining(mtt) : isTournament ? tournamentCanContinue(game.players.map(player => player.stack)) : game.players.filter((player, index) => player.stack > 0 || game.rebuysUsed[index] < MAX_REBUYS).length;
  const heroOut = hero.stack <= 0 && (isTournament || cashCannotRebuy(career, game.tableId, hero.stack, game.rebuysUsed[0]));
  const matchOver = game.finished && (isTournament ? mtt ? mtt.heroPlace !== null || playersAbleToContinue <= 1 : playersAbleToContinue <= 1 : heroOut || playersAbleToContinue <= 1);
  const activeStandardTable = hasActiveTable && !matchOver;
  const autoNextHand = restoreReady && started && !aofOpen && !reviewOpen && !leakFinderOpen && !scenarioOpen && handFilter.enabled && game.finished && !matchOver && !heroOut && wasAutoFolded(game.timeline);
  const autoSpectate = restoreReady && started && isTournament && !mtt && heroOut && game.finished && !matchOver && !reviewOpen && !leakFinderOpen && !scenarioOpen;

  useEffect(() => {
    if (!restoreReady || !started || !isTournament || !mtt || !game.finished || mtt.handNo !== game.handNo) return;
    // Every table completes one hand before eliminations and balancing are applied.
    const timer = window.setTimeout(() => setMtt(previous => previous && previous.handNo === game.handNo ? advanceMttField(previous, tournamentSpeed, game, difficulty) : previous), 0);
    return () => window.clearTimeout(timer);
  }, [restoreReady, started, isTournament, mtt, game, tournamentSpeed, difficulty]);

  useEffect(() => {
    if (!restoreReady || !started || aofOpen || !isTournament || !mtt || matchOver || mttRemaining(mtt) <= 1) return;
    const timer = window.setInterval(() => {
      if (document.hidden) return;
      const now = Date.now();
      setClockNow(now);
      setMtt(previous => {
        if (!previous || previous.clock && now < previous.clock.nextBackgroundAt || previous.handNo === game.handNo && game.finished) return previous;
        return advanceMttBackground(previous, tournamentSpeed, now, difficulty);
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [restoreReady, started, aofOpen, isTournament, !!mtt, matchOver, game.handNo, game.finished, tournamentSpeed, difficulty]);

  useEffect(() => {
    if (!restoreReady || !mtt) return;
    const visibility = () => {
      const now = Date.now();
      setClockNow(now);
      setMtt(previous => {
        if (!previous?.clock) return previous;
        if (document.hidden) return mttClockTick(previous, now, false);
        return { ...previous, clock: { ...previous.clock, lastTickAt: now, nextBackgroundAt: now + MTT_BACKGROUND_INTERVAL_MS } };
      });
    };
    document.addEventListener("visibilitychange", visibility);
    return () => document.removeEventListener("visibilitychange", visibility);
  }, [restoreReady, !!mtt]);

  useEffect(() => {
    const active = restoreReady && started && !aofOpen && isTournament && !!mtt;
    const previous = mttClockActiveRef.current;
    mttClockActiveRef.current = active;
    if (previous === null || previous === active || !mtt) return;
    const now = Date.now();
    setClockNow(now);
    setMtt(field => {
      if (!field?.clock) return field;
      if (!active) return mttClockTick(field, now, false);
      return { ...field, clock: { ...field.clock, lastTickAt: now, nextBackgroundAt: now + MTT_BACKGROUND_INTERVAL_MS } };
    });
  }, [restoreReady, started, aofOpen, isTournament, !!mtt]);

  useEffect(() => {
    if (!restoreReady || !started || !mtt || mtt.heroPlace === null || mttRemaining(mtt) <= 1) return;
    const timer = window.setTimeout(() => setMtt(previous => previous && previous.handNo === mtt.handNo ? advanceMttField({ ...previous, clock: { ...(previous.clock ?? { elapsedMs: 0, lastTickAt: Date.now(), nextBackgroundAt: Date.now() }), elapsedMs: (previous.clock?.elapsedMs ?? 0) + 45000, lastTickAt: Date.now() } }, tournamentSpeed, undefined, difficulty) : previous), 350);
    return () => window.clearTimeout(timer);
  }, [restoreReady, started, mtt, tournamentSpeed, difficulty]);

  useEffect(() => {
    if (!restoreReady || !persistenceReady || !game.finished) return;
    const wallet = careerRef.current;
    if (gameMode === "cash" && matchOver && wallet.cash?.id === game.tableId) {
      const closed = closeCash(wallet, game.tableId, game.players[0].stack);
      if (closed) commitCareer(closed);
    }
    if (gameMode === "tournament" && wallet.tournament?.id === game.tableId && (mtt ? mtt.heroPlace !== null || mttRemaining(mtt) <= 1 : game.players[0].stack <= 0 || playersAbleToContinue <= 1)) {
      if (mtt && mtt.handNo <= game.handNo) return;
      const standings = tournamentStandings(game.players.map(player => player.stack), game.tournamentFinishes ?? []);
      const place = mtt ? mtt.heroPlace ?? 1 : standings.find(entry => entry.seat === 0)?.place;
      if (place) {
        const paid = settleTournament(wallet, game.tableId, place, mtt ? mttStandings(mtt).map(entry => entry.place) : standings.map(entry => entry.place));
        if (paid) commitCareer(paid);
      }
    }
  }, [restoreReady, persistenceReady, game, gameMode, matchOver, playersAbleToContinue, mtt]);

  useEffect(() => {
    if (restoreReady && persistenceReady && matchOver && hasActiveTable) setHasActiveTable(false);
  }, [restoreReady, persistenceReady, matchOver, hasActiveTable]);

  function commitCareer(next: CareerWallet) {
    careerRef.current = next;
    setCareer(next);
  }

  function applyAofState(next: AofState) {
    const previous = aofRef.current;
    let wallet = careerRef.current;
    const newRun = !!previous && (next.runNo ?? 1) !== (previous.runNo ?? 1);
    if (newRun) {
      if (wallet.aof) wallet = closeAof(wallet, wallet.aof.id, previous!.game.players[0].stack) ?? wallet;
      const opened = openAof(wallet, `${next.game.tableId}:${next.runNo ?? 1}`, lobbyAofBb);
      if (!opened) { setBankrollMessage(`新 AOF Run 需要 ${8 * lobbyAofBb} C；目前餘額不足。`); return; }
      wallet = opened;
    } else if (previous && wallet.aof && next.game.handNo !== previous.game.handNo && previous.game.players[0].stack <= 0 && next.game.startingStacks[0] > 0) {
      const paid = buyAofLife(wallet, wallet.aof.id);
      if (!paid) {
        const ended = { ...previous, runFinished: true, lives: [0, ...aofLives(previous).slice(1)] };
        wallet = closeAof(wallet, wallet.aof.id, 0) ?? wallet;
        commitCareer(wallet); aofRef.current = ended; setAof(ended);
        setBankrollMessage("Bankroll 不足支付下一條命；本次 Run 已結束。可降低級別再開始。");
        return;
      }
      wallet = paid;
    }
    if (next.runFinished && wallet.aof && !newRun) wallet = closeAof(wallet, wallet.aof.id, next.game.players[0].stack) ?? wallet;
    if (wallet !== careerRef.current) commitCareer(wallet);
    aofRef.current = next;
    setAof(next);
    setBankrollMessage("");
  }

  useEffect(() => {
    if (!autoNextHand) return;
    const timer = window.setTimeout(() => nextHand(), 2200);
    return () => window.clearTimeout(timer);
  }, [autoNextHand, game.tableId, game.handNo]);

  useEffect(() => {
    if (!autoSpectate) return;
    const timer = window.setTimeout(() => nextHand(), 900);
    return () => window.clearTimeout(timer);
  }, [autoSpectate, game.tableId, game.handNo]);

  function nextHand() {
    if (mtt && isTournament && mtt.handNo <= game.handNo) return;
    if (matchOver) {
      openLobby();
    }
    else {
      if (mtt && isTournament) {
        const ids = mtt.tables[0];
        const nextNo = mtt.handNo;
        const level = mttLevel(mtt, tournamentSpeed, Date.now());
        const blinds = TOURNAMENT_BLINDS[level];
        const bbAnte = level >= 2 ? blinds.big : 0;
        const stacks = ids.map(id => mtt.stacks[id]);
        const nextButton = Math.max(0, ids.indexOf(mtt.buttons?.[0] ?? ids[0]));
        let dealt = newHand(stacks, nextButton, nextNo, Math.random, stacks.map(() => MAX_REBUYS), game.tableId, 0, blinds.small, blinds.big, bbAnte, []);
        dealt = { ...dealt, mttSeatIds: ids, players: dealt.players.map((seat, index) => ({ ...seat, name: ids[index] === 0 ? "你" : `AI ${ids[index]}` })) };
        const movedSeats = ids.some(id => !game.mttSeatIds?.includes(id));
        if (movedSeats) dealt = addLog(dealt, `全場破桌／平衡座位 · 你迎戰新對手`);
        if (blinds.big !== game.bigBlind) dealt = addLog(dealt, `全場盲注升至 ${fmt(blinds.small)} / ${fmt(blinds.big)}${bbAnte ? ` · BB Ante ${fmt(bbAnte)}` : ""}`);
        setGame(dealt);
        setSessions(ids.map(id => id === 0 ? sessions[0] : mttSessions?.[id] ?? emptySessionStats()));
        setSelectedSeat(0);
        return;
      }
      const rebuying = isTournament ? [] : game.players.map((player, index) => player.stack <= 0 && game.rebuysUsed[index] < MAX_REBUYS ? index : -1).filter(index => index >= 0);
      if (rebuying.includes(0) && careerRef.current.cash?.id === game.tableId) {
        const paid = rebuyCash(careerRef.current, game.tableId);
        if (!paid) { setBankrollMessage("餘額不足補回 100BB；請選較低級別開新桌。"); return; }
        commitCareer(paid);
      }
      const nextStacks = game.players.map((player, index) => rebuying.includes(index) ? REBUY_STACK : player.stack);
      const nextRebuys = game.rebuysUsed.map((used, index) => rebuying.includes(index) ? used + 1 : used);
      const nextSeats = game.players.map((player, index) => ({ ...player, stack: nextStacks[index] }));
      const nextButton = findNext(nextSeats, game.button, player => player.stack > 0) ?? 0;
      const nextNo = game.handNo + 1;
      const blinds = isTournament ? tournamentBlinds(nextNo, tournamentSpeed) : { small: 0.5, big: 1 };
      const bbAnte = isTournament ? tournamentBigBlindAnte(nextNo, tournamentSpeed) : 0;
      const dealt = { ...newHand(nextStacks, nextButton, nextNo, Math.random, nextRebuys, game.tableId, 0, blinds.small, blinds.big, bbAnte, isTournament ? game.tournamentFinishes ?? [] : undefined), allowRunouts: !isTournament };
      const blindUp = isTournament && blinds.big !== (game.bigBlind ?? 1);
      setGame(rebuying.length ? addLog(dealt, `${rebuying.map(index => PLAYER_NAMES[index]).join("、")} 自動 Re-buy 100BB`) : blindUp ? addLog(dealt, `盲注升至 ${fmt(blinds.small)} / ${fmt(blinds.big)}${bbAnte ? ` · BB Ante ${fmt(bbAnte)}` : ""}`) : dealt);
    }
  }

  function openLobby() {
    setLobbySize(tableSize);
    setLobbyGameMode(gameMode);
    setLobbyTournamentSpeed(tournamentSpeed);
    setStarted(false);
    setEntryView("home");
    setHint(null);
  }

  function startTable() {
    const tournament = lobbyGameMode === "tournament";
    const fieldSize = tournament && lobbyMtt ? MTT_ENTRIES : lobbySize;
    let wallet = careerRef.current;
    if (wallet.cash?.id === game.tableId) {
      if (!game.finished) { setBankrollMessage("請先完成目前一手 Cash Game，再開新牌桌。"); return; }
      wallet = closeCash(wallet, game.tableId, game.players[0].stack) ?? wallet;
    }
    if (wallet.tournament?.id === game.tableId) { setBankrollMessage("目前錦標賽仍未結束；請先完成賽事。"); return; }
    const id = crypto.randomUUID();
    const opened = tournament ? openTournament(wallet, id, lobbyTournamentEntry, fieldSize) : openCash(wallet, id, lobbyCashBb);
    if (!opened) { setBankrollMessage(`Bankroll 不足支付 ${tournament ? lobbyTournamentEntry : lobbyCashBb * 100} C 買入；請揀較低級別。`); return; }
    commitCareer(opened);
    setBankrollMessage("");
    const blinds = tournament ? tournamentBlinds(1, lobbyTournamentSpeed) : { small: 0.5, big: 1 };
    const seats = tournament && lobbyMtt ? 8 : lobbySize;
    const stacks = Array(seats).fill(tournament ? TOURNAMENT_SPEEDS[lobbyTournamentSpeed].startingStack : 100);
    const firstHand = { ...newHand(stacks, 0, 1, Math.random, Array(seats).fill(tournament ? MAX_REBUYS : 0), id, 0, blinds.small, blinds.big, 0, tournament ? [] : undefined), allowRunouts: !tournament };
    setGame(tournament && lobbyMtt ? { ...firstHand, mttSeatIds: Array.from({ length: 8 }, (_, index) => index) } : firstHand);
    setMtt(tournament && lobbyMtt ? newMttField(TOURNAMENT_SPEEDS[lobbyTournamentSpeed].startingStack) : null);
    setClockNow(Date.now());
    setMttHighlightsOpen(false);
    setMttSessions(tournament && lobbyMtt ? Array.from({ length: MTT_ENTRIES }, () => emptySessionStats()) : null);
    setTournamentClock(tournament ? newDecisionClock("", 90_000, Date.now()) : null);
    setGameMode(lobbyGameMode);
    setTournamentSpeed(lobbyTournamentSpeed);
    setSessions(PLAYER_NAMES.slice(0, seats).map(() => emptySessionStats()));
    setCoachReviews([]);
    setProfitHistory([]);
    setSelectedSeat(0);
    setHint(null);
    setRaiseTo(blinds.big * 2.5);
    recordedHand.current = "";
    setHasActiveTable(true);
    setStarted(true);
    setEntryView("table");
  }

  function heroAction(action: HeroAction, target = 0) {
    if (game.turn !== 0 || game.finished) return;
    const review = rateHeroDecision(game, action, target);
    setCoachReviews(previous => [review, ...previous].slice(0, 200));
    setHint(null);
    setGame(previous => act(previous, 0, action, target));
  }

  function openHandReview(id?: string) {
    const hand = handHistory.find(item => item.id === id) ?? handHistory[0];
    setSelectedHandId(hand?.id ?? null);
    setReplayIndex(hand ? Math.max(0, hand.frames.length - 1) : 0);
    setReviewOpen(true);
  }

  function selectReviewHand(id: string) {
    const hand = handHistory.find(item => item.id === id);
    setSelectedHandId(id);
    setReplayIndex(hand ? Math.max(0, hand.frames.length - 1) : 0);
  }

  function toggleFavourite(id: string) {
    setHandHistory(previous => previous.map(hand => hand.id === id ? { ...hand, favourite: !hand.favourite } : hand));
  }

  function openLeakHand(id: string) {
    setLeakFinderOpen(false);
    openHandReview(id);
  }

  function openScenarioLab() {
    setPracticePlan(null);
    setScenarioOpen(true);
  }

  function startLeakPractice(plan: PracticePlan) {
    setPracticePlan(plan);
    setLeakFinderOpen(false);
    setScenarioOpen(true);
  }

  const session = sessions[0];
  const selectedStats = sessions[selectedSeat];
  const percent = (part: number, total = selectedStats.hands) => statPercent(part, total);
  const coachScore = session.decisions ? Math.round(session.coachPoints / session.decisions) : 0;
  const coachLetter = coachScore >= 90 ? "A" : coachScore >= 80 ? "B" : coachScore >= 68 ? "C" : coachScore >= 55 ? "D" : session.decisions ? "F" : "—";
  const latestReview = coachReviews[0];
  const visibleHint = hint && hint.handNo === game.handNo && hint.actionId === game.actionId && game.turn === 0 ? hint : null;
  const selectedVpip = statPercent(selectedStats.vpipHands, selectedStats.hands);
  const selectedPfr = statPercent(selectedStats.pfrHands, selectedStats.hands);
  const selectedProfile = selectedStats.hands < 5 ? "樣本累積中" : selectedVpip < 20 ? "緊手型" : selectedVpip > 38 ? "鬆手型" : selectedPfr >= selectedVpip * 0.72 ? "主動進取" : "跟注偏多";
  const revealedAi = game.finished ? game.players.filter((player, index) => index !== 0 && (studyMode || !player.folded)) : [];
  const latestProfit = profitHistory[profitHistory.length - 1];
  const pendingRebuys = !isTournament && game.finished ? game.players.map((player, index) => player.stack <= 0 && game.rebuysUsed[index] < MAX_REBUYS ? index : -1).filter(index => index >= 0) : [];
  const selectedRebuys = game.rebuysUsed[selectedSeat];
  const selectedRebuysLeft = MAX_REBUYS - selectedRebuys;
  const blindLevel = mtt ? mttLevel(mtt, tournamentSpeed, clockNow) + 1 : tournamentLevel(game.handNo, tournamentSpeed) + 1;
  const blindCountdown = handsUntilBlindUp(game.handNo, tournamentSpeed);
  const handsPerLevel = TOURNAMENT_SPEEDS[tournamentSpeed].handsPerLevel;
  const mttLevelRemaining = mtt ? Math.max(0, MTT_LEVEL_MS[tournamentSpeed] - mttElapsed(mtt, clockNow) % MTT_LEVEL_MS[tournamentSpeed]) : 0;
  const mttLevelProgress = mtt ? mttElapsed(mtt, clockNow) % MTT_LEVEL_MS[tournamentSpeed] / MTT_LEVEL_MS[tournamentSpeed] : 0;
  const averageStack = mtt ? mttAverage(mtt) : game.players.filter(player => player.stack > 0).reduce((sum, player) => sum + player.stack, 0) / Math.max(1, game.players.filter(player => player.stack > 0).length);
  const paidPlaces = mtt ? mttPayoutShares() : payoutShares(tableSize);
  const tournamentStatus = tournamentPhase(playersAbleToContinue, mtt ? MTT_ENTRIES : tableSize);
  const standings = isTournament ? tournamentStandings(game.players.map(player => player.stack), game.tournamentFinishes ?? []) : [];
  const heroPlace = mtt ? mtt.heroPlace ?? mttStandings(mtt).find(entry => entry.id === 0)?.place : standings.find(entry => entry.seat === 0)?.place;
  const cashStake = career.cash?.id === game.tableId ? career.cash.bb : -(career.transactions.find(tx => tx.id === `cash:${game.tableId}:buy-in`)?.amount ?? -100) / 100;
  const tournamentEntry = career.tournament?.id === game.tableId ? career.tournament.entry : -(career.transactions.find(tx => tx.id === `tournament:${game.tableId}:entry`)?.amount ?? 0);
  const tournamentPrizePool = tournamentEntry > 0 ? tournamentEntry * (mtt ? MTT_ENTRIES : tableSize) : 0;
  const cashOnTable = career.cash?.id === game.tableId ? Math.round(game.players[0].stack * career.cash.bb * 100) / 100 : 0;
  const aofOnTable = career.aof && aof && career.aof.id === `${aof.game.tableId}:${aof.runNo ?? 1}` ? Math.round(aof.game.players[0].stack * career.aof.bb * 100) / 100 : 0;
  const cashStartingBalance = career.balance + (career.cash?.id === game.tableId && game.finished ? cashOnTable : 0);
  const aofStartingBalance = career.balance + (career.aof && aof ? aofOnTable : 0);
  const standardRisk = careerStakeRisk(lobbyGameMode, cashStartingBalance, lobbyGameMode === "cash" ? lobbyCashBb : lobbyTournamentEntry);
  const aofRisk = careerStakeRisk("aof", aofStartingBalance, lobbyAofBb);
  const riskDescription = (risk: CareerStakeRisk, mode: "cash" | "tournament" | "aof") => {
    if (risk.level === "unaffordable") return "目前餘額不足支付首次買入；請揀較低級別。";
    if (mode === "aof") return risk.level === "caution" ? "可以開始，但目前未夠支付完整三命；爆倉時可能無法補命。" : "額外兩條命只喺爆倉並選擇繼續時先會扣款。";
    return risk.level === "caution" ? `低於建議儲備 ${risk.recommendedEntries} 次買入；仍可自行選擇呢個級別。` : `達到建議儲備 ${risk.recommendedEntries} 次買入。`;
  };
  const saveStatusLabel = saveStatus === "loading" ? "恢復中" : saveStatus === "saving" ? "儲存中" : saveStatus === "saved" ? "已儲存" : "同步失敗";
  const toggleAutoResume = () => { const next = !autoResume; setAutoResume(next); window.localStorage.setItem("poker-auto-resume", next ? "yes" : "no"); };
  const visibleMotion = tableMotion?.tableId === game.tableId && tableMotion.handNo === game.handNo && motionMode !== "off" ? tableMotion : null;
  const reviewModal = reviewOpen ? <HandReviewModal history={handHistory} selectedId={selectedHandId} replayIndex={replayIndex} studyMode={studyMode} onStudyMode={() => setStudyMode(value => !value)} onSelect={selectReviewHand} onReplay={setReplayIndex} onToggleFavourite={toggleFavourite} onClose={() => setReviewOpen(false)} /> : null;
  const leakModal = leakFinderOpen ? <LeakFinderModal history={handHistory} onOpenHand={openLeakHand} onStartPractice={startLeakPractice} onClose={() => setLeakFinderOpen(false)} /> : null;
  const scenarioModal = scenarioOpen ? <ScenarioTrainer plan={practicePlan} onClose={() => setScenarioOpen(false)} /> : null;
  const highlightedHand = mtt?.highlights?.find(item => item.id === selectedMttHighlight) ?? mtt?.highlights?.[0];
  const mttHighlightsModal = mttHighlightsOpen && mtt ? <div className="review-overlay" role="dialog" aria-modal="true" aria-label="多桌賽精華牌局"><div className="review-modal mtt-review"><div className="review-header"><div><span>200-PLAYER TOURNAMENT</span><h2>全場關鍵牌局 · 最近 {mtt.highlights?.length ?? 0} 手</h2></div><button aria-label="關閉精華" onClick={() => setMttHighlightsOpen(false)}>×</button></div><div className="review-layout"><div className="review-list">{(mtt.highlights ?? []).map(item => <button key={item.id} className={`mtt-highlight-select ${highlightedHand?.id === item.id ? "selected" : ""}`} onClick={() => setSelectedMttHighlight(item.id)}><b>{item.label} · 第 {item.table} 桌</b><small>背景第 {item.handNo} 手 · {new Date(item.at).toLocaleTimeString("zh-HK", { hour: "2-digit", minute: "2-digit" })}</small></button>)}</div><div className="replayer mtt-highlight-detail">{highlightedHand ? <><h3>{highlightedHand.label} · 第 {highlightedHand.table} 桌</h3><p>{highlightedHand.busts.length ? `${highlightedHand.busts.map(id => `AI ${id}`).join("、")} 出局` : "大底池／決賽桌牌局"} · {highlightedHand.winners.map(id => `AI ${id}`).join("、")} 收池</p><div className="mtt-highlight-board">{highlightedHand.board.map((card, index) => <CardView key={index} card={card} mini />)}</div><div className="mtt-highlight-seats">{highlightedHand.ids.map((id, index) => <div key={id}><b>AI {id} · {fmt(highlightedHand.starting[index])} → {fmt(highlightedHand.ending[index])}</b><span>{highlightedHand.holes[index]?.map((card, slot) => <CardView key={slot} card={card} mini />)}</span></div>)}</div><div className="mtt-highlight-actions"><h4>行動紀錄</h4>{highlightedHand.actions.map((line, index) => <p key={index}>{line}</p>)}{highlightedHand.potSummary.map((line, index) => <strong key={index}>{line}</strong>)}</div></> : <p>打出背景桌關鍵牌局後，可以喺度翻查底牌、行動同收池。</p>}</div></div></div></div> : null;
  const fieldStandings = mtt ? mttStandings(mtt) : standings.map(entry => ({ id: entry.seat, place: entry.place, stack: entry.stack }));
  const tournamentInfoModal = tournamentInfoOpen && (gameMode === "tournament" || lobbyGameMode === "tournament") ? <div className="review-overlay" role="dialog" aria-modal="true" aria-label="錦標賽資訊頁"><div className="review-modal tournament-info-modal"><div className="review-header"><div><span>TOURNAMENT LOBBY</span><h2>{mtt ? "200 人多桌賽" : `${tableSize} 人單桌賽`} · 賽事資訊</h2></div><button aria-label="關閉錦標賽資訊" onClick={() => setTournamentInfoOpen(false)}>×</button></div><div className="tournament-info-content">
    <div className="tournament-info-summary"><div><span>全場剩餘</span><strong>{playersAbleToContinue} 人</strong></div><div><span>目前名次</span><strong>第 {heroPlace ?? "—"} 名</strong></div><div><span>獎勵圈</span><strong>前 {mtt ? MTT_PAID : paidPlaces.length} 名</strong></div><div><span>獎池</span><strong>{fmt(tournamentPrizePool)} C</strong></div></div>
    <section><h3>盲注結構 · {TOURNAMENT_SPEEDS[tournamentSpeed].label}</h3><p>{mtt ? `每 ${Math.round(MTT_LEVEL_MS[tournamentSpeed] / 60000)} 分鐘升盲；關頁或離開牌桌暫停` : `每 ${TOURNAMENT_SPEEDS[tournamentSpeed].handsPerLevel} 手升盲`} · 第 3 級起 BB Ante</p><div className="tournament-info-list">{TOURNAMENT_BLINDS.slice(Math.max(0, blindLevel - 2), Math.min(TOURNAMENT_BLINDS.length, blindLevel + 6)).map((blind, index) => { const level = Math.max(0, blindLevel - 2) + index + 1; return <div className={level === blindLevel ? "current" : ""} key={level}><span>Level {level}</span><b>{fmt(blind.small)} / {fmt(blind.big)}</b><small>Ante {level >= 3 ? fmt(blind.big) : "—"}</small></div>; })}</div></section>
    <section><h3>排名 · 前 12 名</h3><div className="tournament-info-list">{fieldStandings.slice(0, 12).map(entry => <div className={entry.id === 0 ? "current" : ""} key={entry.id}><span>#{entry.place} {entry.id === 0 ? "你" : `AI ${entry.id}`}</span><b>{fmt(entry.stack)} 籌碼</b><small>{entry.stack > 0 ? `${fmt(entry.stack / (game.bigBlind ?? 1))} BB` : "OUT"}</small></div>)}{!fieldStandings.slice(0, 12).some(entry => entry.id === 0) && <div className="current"><span>#{heroPlace ?? "—"} 你</span><b>{fmt(hero.stack)} 籌碼</b></div>}</div></section>
    <section><h3>獎勵結構</h3><div className="tournament-info-list">{paidPlaces.map((share, index) => <div key={index}><span>第 {index + 1} 名</span><b>{fmt(tournamentPrizePool * share / 100)} C</b><small>{fmt(share)}%</small></div>)}</div></section>
    <section><h3>{mtt ? "進行中牌桌" : "目前牌桌"}</h3><div className="tournament-info-tables">{mtt ? mtt.tables.map((table, index) => table.length ? <div key={index}><b>第 {index + 1} 桌 {table.includes(0) ? "· 你所在" : ""}</b><span>{table.length} 人 · 平均 {fmt(table.reduce((total, id) => total + mtt.stacks[id], 0) / table.length)} 籌碼</span></div> : null) : <div><b>本桌</b><span>{game.players.filter(player => player.stack > 0).length} 人 · 平均 {fmt(averageStack)} 籌碼</span></div>}</div></section>
  </div></div></div> : null;

  const downloadRawSave = () => {
    try {
      const backup = readSaveBackup();
      const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), ...backup }, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a"); link.href = url; link.download = `poker-save-backup-${Date.now()}.json`; link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch { setSaveFailure("瀏覽器暫時不允許讀取存檔，無法下載備份。請勿清除網站資料。"); }
  };

  if (!restoreReady) return <main className="restore-shell"><div className="restore-card"><span>♠</span><b>正在恢復牌局</b><small>載入籌碼、Session統計及最近手牌…</small></div></main>;
  if (!persistenceReady || saveConflict) return <main className="restore-shell"><div className="restore-card"><span>♠</span><b>{localRecovery ? cloudRecovery ? "本機備份比本機存檔新" : "找到呢部裝置嘅本機備份" : saveConflict ? "存檔無法同步或已由另一分頁更新" : "暫時無法恢復存檔"}</b><small>{localRecovery ? `本機備份：${new Date(localRecovery.savedAt).toLocaleString("zh-HK")}。${cloudRecovery ? "請揀本機進度或較舊嘅本機進度；唔會自動覆蓋。" : "本機暫時冇可讀牌局，請選擇是否恢復。"}` : saveFailure || "為免資金帳本錯亂，請重新載入最新牌局。"}</small>{localRecovery && <><button className="resume-table" onClick={() => { hydrateSaved(localRecovery); setLocalRecovery(null); setCloudRecovery(null); setPersistenceReady(true); setSaveStatus("saving"); }}>恢復較新本機備份</button>{cloudRecovery ? <button className="resume-table" onClick={() => { hydrateSaved(cloudRecovery); setLocalRecovery(null); setCloudRecovery(null); setPersistenceReady(true); setSaveStatus("saving"); }}>使用本機存檔</button> : <button className="resume-table" onClick={() => { if (cacheOwner.current) window.localStorage.removeItem(`poker-local-save:${cacheOwner.current}`); setLocalRecovery(null); setPersistenceReady(true); setSaveStatus("saving"); }}>放棄備份，開始新職涯</button>}</>}<p>請勿清除網站資料；可以先下載現有存檔作備份。</p><button className="resume-table" onClick={downloadRawSave}>下載存檔備份</button><button className="resume-table" onClick={() => window.location.reload()}>重新載入</button></div></main>;

  const enterAof = () => {
    if (!aof) {
      const next = newAof();
      const opened = openAof(careerRef.current, `${next.game.tableId}:1`, lobbyAofBb);
      if (!opened) { setBankrollMessage(`AOF 第一條命需要 ${lobbyAofBb * 8} C；請揀較低級別。`); return; }
      commitCareer(opened); aofRef.current = next; setAof(next);
    }
    setBankrollMessage(""); setEntryView("table"); setAofOpen(true);
  };
  const startNewAof = () => {
    if (!aof) { enterAof(); return; }
    const previous = aof;
    const next = aofRestartRun(previous);
    applyAofState(next);
    if (aofRef.current === next) { setEntryView("table"); setAofOpen(true); }
  };
  const chooseMode = (mode: "cash" | "tournament" | "aof") => { setSetupMode(mode); if (mode !== "aof") setLobbyGameMode(mode); setEntryView("setup"); setStarted(false); setHint(null); setBankrollMessage(""); };
  const openModeLobby = (mode: GameMode) => { setLobbyGameMode(mode); setLobbySize(tableSize); setSetupMode(mode); setEntryView("setup"); setStarted(false); setHint(null); };
  if (aofOpen && aof) {
    const runId = `${aof.game.tableId}:${aof.runNo ?? 1}`;
    const firstLife = career.transactions.find(tx => tx.id === `aof:${runId}:life:1`);
    return <AofTable state={aof} onChange={applyAofState} onExit={() => { setAofOpen(false); setEntryView("home"); }} saveStatus={saveStatusLabel} careerBalance={career.balance} careerStake={firstLife ? -firstLife.amount / 8 : lobbyAofBb} bankrollMessage={bankrollMessage} legacy={!firstLife} />;
  }

  if (entryView === "home") return <><main className="mode-home-shell"><section className="mode-home" aria-labelledby="mode-home-title">
    <header className="mode-home-head"><span className="mode-home-kicker">POKER CAREER · 100BB</span><h1 id="mode-home-title">今晚打邊場？</h1><p>揀賽制，再設定人數、級別同難度。你嘅資金同牌局會自動保存。</p></header>
    <div className="mode-home-wallet"><div><span>可用 Bankroll</span><strong>{fmt(career.balance)} <small>C</small></strong></div><span className={`save-indicator ${saveStatus}`}>● {saveStatusLabel}</span></div>
    {saveStatus === "error" && <p className="bankroll-message" role="alert">{saveFailure || "本機同步失敗，請檢查網絡。"}</p>}
    {(activeStandardTable || aof) && <section className="mode-home-continue" aria-label="繼續牌局"><h2>繼續上次牌局</h2><div>{activeStandardTable && <button onClick={() => { setEntryView("table"); setStarted(true); }}><span>{gameMode === "tournament" ? `錦標賽 · ${mtt ? "200 人" : `${tableSize} 人`}` : `Cash Game · ${tableSize} 人`}<small>第 {game.handNo} 手 · {fmt(hero.stack)}{gameMode === "tournament" ? " 籌碼" : " BB"}</small></span><span>繼續 →</span></button>}{aof && <button onClick={enterAof}>AOF · {aof.runFinished ? "查看結果" : "目前 Run"}<span>繼續 →</span></button>}</div></section>}
    <section className="career-milestones" aria-label="職涯挑戰"><h2>職涯挑戰與里程碑</h2><p>以本機職涯交易記錄計算；完成後保留成就。</p>{[
      { title: "踏上牌桌", value: career.transactions.filter(tx => tx.kind === "buy-in").length, goal: 1, unit: "次 Cash 買入" },
      { title: "賽場常客", value: career.transactions.filter(tx => tx.kind === "entry").length, goal: 3, unit: "場錦標賽" },
      { title: "首次獲獎", value: career.transactions.filter(tx => tx.kind === "prize" && tx.amount > 0).length, goal: 1, unit: "次錦標賽獎金" },
      { title: "AOF 挑戰者", value: career.transactions.filter(tx => tx.mode === "aof" && tx.kind === "life" && tx.id.endsWith(":life:1")).length, goal: 5, unit: "次 AOF Run" },
    ].map(item => <div className="career-milestone" key={item.title}><b>{item.value >= item.goal ? "✓ " : "◇ "}{item.title}</b><span>{Math.min(item.value, item.goal)} / {item.goal} · {item.unit}</span></div>)}</section>
    <div className="mode-home-restore"><span>{lastSavedAt ? `上次本機儲存：${new Date(lastSavedAt).toLocaleString("zh-HK", { dateStyle: "short", timeStyle: "short" })}` : "尚未有已完成嘅牌局存檔"}</span><label><input type="checkbox" checked={autoResume} onChange={toggleAutoResume} /> 下次自動返回牌桌</label></div>
    <section className="mode-home-choices" aria-label="選擇遊戲模式"><h2>開新場</h2><div className="mode-home-grid">
      <button className="mode-home-choice" onClick={() => chooseMode("cash")}><span className="mode-icon">♠</span><span className="mode-copy"><small>01 · 現金桌</small><strong>Cash Game</strong><em>2–8 人 · 100BB · 最多補碼兩次</em></span><span className="mode-arrow">→</span></button>
      <button className="mode-home-choice" onClick={() => chooseMode("tournament")}><span className="mode-icon">♛</span><span className="mode-copy"><small>02 · 賽事</small><strong>錦標賽</strong><em>單桌或 200 人 · 升盲 · 獎勵圈</em></span><span className="mode-arrow">→</span></button>
      <button className="mode-home-choice" onClick={() => chooseMode("aof")}><span className="mode-icon">♦</span><span className="mode-copy"><small>03 · 快速娛樂</small><strong>AOF Run</strong><em>4 人 · 8BB · 三條命同 Boss Run</em></span><span className="mode-arrow">→</span></button>
    </div></section>
    <div className="mode-home-footer"><button onClick={() => openHandReview()}>最近牌局 · {handHistory.length}/100</button>{gameMode === "tournament" && (hasActiveTable || mtt) && <button onClick={() => setTournamentInfoOpen(true)}>錦標賽資訊</button>}<button onClick={() => setLeakFinderOpen(true)}>Leak Finder</button><button onClick={openScenarioLab}>情境訓練</button></div>
  </section></main>{reviewModal}{leakModal}{scenarioModal}{mttHighlightsModal}{tournamentInfoModal}</>;

  if (!started) return <><main className="lobby-shell">
    <section className="lobby-card" aria-labelledby="lobby-title">
      <div className="mode-setup-nav"><button onClick={() => setEntryView("home")}>← 返回首頁</button><span>{setupMode === "aof" ? "AOF" : setupMode === "tournament" ? "錦標賽" : "Cash Game"} · 開局設定</span></div>
      <section className="career-home" aria-label="職涯首頁">
        <div className="career-home-head"><span>POKER CAREER</span><h1 id="lobby-title">職涯首頁</h1><p>揀級別之前，先睇清楚可以動用嘅虛擬資金。</p></div>
        <div className="career-home-balance"><span>可用資金</span><strong>{fmt(career.balance)} <small>C</small></strong><em>由 3,000 C 起步 · 買入及獎金逐筆記錄</em></div>
        <div className="career-home-holdings">
          <div><span>Cash 桌上籌碼</span><b>{fmt(cashOnTable)} C</b></div>
          <div><span>AOF 桌上籌碼</span><b>{fmt(aofOnTable)} C</b></div>
          <div><span>錦標賽已付報名費</span><b>{career.tournament ? `${fmt(career.tournament.entry)} C` : "—"}</b></div>
        </div>
        {(activeStandardTable || aof) && <div className="career-home-resume">
          {activeStandardTable && <button onClick={() => setStarted(true)}>{gameMode === "tournament" && hero.stack <= 0 ? "觀看進行中錦標賽" : `返回目前${gameMode === "tournament" ? "錦標賽" : " Cash Game"}`}</button>}
          {aof && <button onClick={enterAof}>{aof.runFinished ? "查看 AOF Run" : "繼續 AOF Run"}</button>}
        </div>}
        {game.finished && matchOver && handHistory.length > 0 && <p className="career-home-finished">上一張{gameMode === "tournament" ? "錦標賽" : " Cash Game"}已結束並結算。<button onClick={() => openHandReview()}>查看最近一手</button></p>}
        <details className="career-home-ledger"><summary>最近資金記錄 <span>{career.transactions.length} 筆</span></summary><div className="career-ledger">{career.transactions.slice(-4).reverse().map(tx => <span key={tx.id}>{tx.mode.toUpperCase()} · {({ "buy-in": "買入", rebuy: "補碼", "cash-out": "兌回", entry: "報名", prize: "獎金", life: "補命" } as Record<typeof tx.kind, string>)[tx.kind]} <strong>{tx.amount >= 0 ? "+" : ""}{fmt(tx.amount)} C</strong></span>)}{career.transactions.length === 0 && <small>尚未有交易；舊版對局不追溯入帳。</small>}</div></details>
      </section>
      {setupMode !== "aof" && <>
      <div className="lobby-brand"><div className="brand-mark">♠</div><div><span>100BB TRAINING TABLE</span><h2>開一張新牌桌</h2><p>揀總玩家人數及 AI 難度，再開始第一手。</p></div></div>
      {lobbyGameMode === "tournament" && <div className="lobby-section mtt-selection"><div className="lobby-label"><span>賽制</span><div><b>選擇錦標賽規模</b><small>多桌賽每張桌最多八人，破桌只喺兩手之間進行</small></div></div><div className="mtt-choice" role="group" aria-label="錦標賽規模"><button className={!lobbyMtt ? "selected" : ""} aria-pressed={!lobbyMtt} onClick={() => setLobbyMtt(false)}><b>單桌</b><small>2–8 人 · 快速決勝</small></button><button className={lobbyMtt ? "selected" : ""} aria-pressed={lobbyMtt} onClick={() => setLobbyMtt(true)}><b>200 人多桌賽</b><small>25 桌 · 前 30 名有獎</small></button></div></div>}
      <div className="lobby-section">
        <div className="lobby-label"><span>01</span><div><b>{lobbyGameMode === "tournament" && lobbyMtt ? "你的牌桌" : "總玩家人數"}</b><small>{lobbyGameMode === "tournament" && lobbyMtt ? "200 人賽固定八人桌" : "包括你在內"}</small></div><strong>{lobbyGameMode === "tournament" && lobbyMtt ? "8-MAX" : `${lobbySize}-MAX`}</strong></div>
        <div className="lobby-player-grid" role="group" aria-label="選擇總玩家人數">
          {lobbyGameMode === "tournament" && lobbyMtt ? <span className="mtt-fixed-seat">25 張八人桌 · 對手會隨破桌而改變</span> : TABLE_SIZES.map(size => <button key={size} className={lobbySize === size ? "selected" : ""} aria-pressed={lobbySize === size} onClick={() => setLobbySize(size)}><b>{size}</b><span>{size === 2 ? "HU" : `${size} 人`}</span></button>)}
        </div>
      </div>
      <div className="lobby-section">
        <div className="lobby-label"><span>02</span><div><b>AI 難度</b><small>開局後仍可切換</small></div></div>
        <div className="lobby-difficulty-grid" role="group" aria-label="選擇 AI 難度">
          {(Object.keys(DIFFICULTY_INFO) as Difficulty[]).map(mode => <button key={mode} className={difficulty === mode ? "selected" : ""} aria-pressed={difficulty === mode} onClick={() => setDifficulty(mode)}><span>{DIFFICULTY_INFO[mode].short}</span><b>{DIFFICULTY_INFO[mode].label}</b><small>{DIFFICULTY_INFO[mode].detail}</small></button>)}
        </div>
      </div>
      {lobbyGameMode === "tournament" && <div className="lobby-section tournament-speed-section"><div className="lobby-label"><span>03</span><div><b>錦標賽速度</b><small>只有開新賽事先會套用</small></div></div><div className="tournament-speed-grid" role="group" aria-label="錦標賽升盲速度">
        {(Object.keys(TOURNAMENT_SPEEDS) as TournamentSpeed[]).map(speed => <button type="button" key={speed} className={lobbyTournamentSpeed === speed ? "selected" : ""} aria-pressed={lobbyTournamentSpeed === speed} onClick={() => setLobbyTournamentSpeed(speed)}><b>{TOURNAMENT_SPEEDS[speed].label}</b><span>{TOURNAMENT_SPEEDS[speed].startingStack} 籌碼</span><small>{lobbyMtt ? `${Math.round(MTT_LEVEL_MS[speed] / 60000)} 分鐘升盲` : `每 ${TOURNAMENT_SPEEDS[speed].handsPerLevel} 手升盲`}</small></button>)}
      </div></div>}
      <div className="lobby-section career-stakes"><div className="lobby-label"><span>{lobbyGameMode === "tournament" ? "04" : "03"}</span><div><b>{lobbyGameMode === "tournament" ? "報名費" : "Cash 盲注級別"}</b><small>{lobbyGameMode === "tournament" ? `入場扣款；獎池由${lobbyMtt ? "全場 200 人" : "全桌"}報名費組成` : "每次買入固定 100BB；補碼另扣款"}</small></div></div><div className="career-stake-grid" role="group" aria-label="選擇級別">{lobbyGameMode === "tournament" ? TOURNAMENT_ENTRIES.map(entry => <button key={entry} className={lobbyTournamentEntry === entry ? "selected" : ""} aria-pressed={lobbyTournamentEntry === entry} onClick={() => setLobbyTournamentEntry(entry)}>{entry} C<small>獎池 {entry * (lobbyMtt ? MTT_ENTRIES : lobbySize)} C</small></button>) : CASH_BIG_BLINDS.map(bb => <button key={bb} className={lobbyCashBb === bb ? "selected" : ""} aria-pressed={lobbyCashBb === bb} onClick={() => setLobbyCashBb(bb)}>{fmt(bb / 2)} / {bb}<small>買入 {bb * 100} C</small></button>)}</div><div className={`career-risk ${standardRisk.level}`} role="status" aria-live="polite"><div><b>{standardRisk.level === "comfortable" ? "資金充足" : standardRisk.level === "caution" ? "資金風險較高" : "資金不足"}</b><span>目前可支付 {standardRisk.affordableEntries} 次{lobbyGameMode === "cash" ? " 100BB 買入" : "報名"}</span></div><p>今次先扣 <strong>{fmt(standardRisk.initialCost)} C</strong>{lobbyGameMode === "cash" && <> · 連兩次 Re-buy 最多 <strong>{fmt(standardRisk.maximumCost)} C</strong></>}</p><small>{riskDescription(standardRisk, lobbyGameMode)}{cashStartingBalance !== career.balance && " 已計入完手後可兌回嘅 Cash 桌上籌碼。"}</small></div></div>
      </>}
      {setupMode === "aof" && <div className="lobby-brand"><div className="brand-mark">♦</div><div><span>ALL-IN OR FOLD</span><h2>AOF Run 設定</h2><p>揀盲注級別，然後開始新 Run 或繼續目前進度。</p></div></div>}
      {setupMode === "aof" && <>
      <div className="lobby-section career-stakes" id="aof-stakes"><div className="lobby-label"><span>AOF</span><div><b>AOF 盲注級別</b><small>8BB 一條命；只喺爆倉補命時再扣款</small></div></div><div className="career-stake-grid" role="group" aria-label="AOF 級別">{AOF_BIG_BLINDS.map(bb => <button key={bb} className={lobbyAofBb === bb ? "selected" : ""} aria-pressed={lobbyAofBb === bb} onClick={() => setLobbyAofBb(bb)}>{fmt(bb / 2)} / {bb}<small>每條命 {bb * 8} C</small></button>)}</div><div className={`career-risk ${aofRisk.level}`} role="status" aria-live="polite"><div><b>{aofRisk.level === "comfortable" ? "資金充足" : aofRisk.level === "caution" ? "資金風險較高" : "資金不足"}</b><span>可支付 {aofRisk.affordableEntries} 條命 · 完整三命 {Math.floor(aofStartingBalance / aofRisk.maximumCost)} 次</span></div><p>開局先扣 <strong>{fmt(aofRisk.initialCost)} C</strong> · 三命最多 <strong>{fmt(aofRisk.maximumCost)} C</strong></p><small>{riskDescription(aofRisk, "aof")}{aofStartingBalance !== career.balance && " 開新 Run 時先兌回目前桌上籌碼。"}</small></div><button className="career-aof-launch" onClick={startNewAof}>{aof ? "以所選級別開始新 AOF Run" : "開始 AOF Run"}</button>{aof && <button className="resume-table" onClick={enterAof}>繼續目前 AOF Run{career.aof ? ` · BB ${career.aof.bb} C` : ""}</button>}</div>
      </>}
      {setupMode !== "aof" && <>
      <HandFilterPanel filter={handFilter} onChange={setHandFilter} tableSize={lobbySize} />
      {lobbyGameMode === "tournament" && <div className="tournament-lobby-note"><b>{lobbyMtt ? "200 人多桌賽" : "單桌錦標賽"}</b><span>第 3 級起 BB Ante · 不設 Re-buy · 前 {lobbyMtt ? MTT_PAID : payoutShares(lobbySize).length} 名獲獎勵 · {lobbyMtt ? "背景桌獨立進行，錢圈前逐手同步；網頁關閉或轉到背景時會暫停賽事時鐘" : "每桌一手同步結算"}</span></div>}
      <div className="lobby-summary"><span>{lobbyGameMode === "tournament" && lobbyMtt ? "200 人 · 25 桌" : `${lobbySize} 人桌`}</span><span>{lobbyGameMode === "tournament" ? "0.5 / 1 籌碼起步" : `${fmt(lobbyCashBb / 2)} / ${lobbyCashBb} C`}</span><span>每位 {lobbyGameMode === "tournament" ? TOURNAMENT_SPEEDS[lobbyTournamentSpeed].startingStack : 100}</span><span>{lobbyGameMode === "tournament" ? `報名 ${lobbyTournamentEntry} C` : `買入 ${lobbyCashBb * 100} C · 補碼 ×2`}</span></div>
      <button className="start-table" onClick={startTable}>開始{lobbyGameMode === "tournament" ? "錦標賽" : " Cash Game"} <span>→</span></button>
      </>}
      {bankrollMessage && <p className="bankroll-message" role="alert">{bankrollMessage}</p>}
      {career.cash?.id === game.tableId && game.finished && <button className="resume-table" onClick={() => { const paid = closeCash(careerRef.current, game.tableId, game.players[0].stack); if (paid) { commitCareer(paid); setHasActiveTable(false); setBankrollMessage("已將桌上籌碼兌回 Bankroll。"); } }}>離開 Cash 桌 · 兌回 {fmt(game.players[0].stack * career.cash.bb)} C</button>}
      {handHistory.length > 0 && <button className="resume-table history-entry" onClick={() => openHandReview()}>牌局紀錄 · {handHistory.length}/100 手</button>}
      {mtt && (mtt.highlights?.length ?? 0) > 0 && <button className="resume-table history-entry" onClick={() => setMttHighlightsOpen(true)}>多桌賽關鍵牌局 · {mtt.highlights?.length} 手</button>}
      <div className="lobby-training-tools"><button onClick={() => setLeakFinderOpen(true)}>⌁ Leak Finder</button><button onClick={openScenarioLab}>◎ 情境訓練</button><button className={studyMode ? "active" : ""} onClick={() => setStudyMode(value => !value)}>◉ Study {studyMode ? "ON" : "OFF"}</button></div>
      <p className="lobby-note"><span className={`save-indicator ${saveStatus}`}>● {saveStatusLabel}</span> · AI 只會讀取自己底牌及公開資訊</p>
    </section>
  </main>{reviewModal}{leakModal}{scenarioModal}{mttHighlightsModal}{tournamentInfoModal}</>;

  return <>{game.runoutPending && <AllInChoice game={game} onChoose={requested => setGame(previous => {
    if (!previous.runoutPending) return previous;
    const choices = previous.players.map((player, index) => index && !player.folded ? { index, count: 1 + ((index + previous.handNo - 1) % 3) } : null).filter((choice): choice is { index: number; count: number } => choice !== null);
    const runs = Math.min(requested, ...choices.map(choice => choice.count));
    const result = showdown(previous, runs);
    const logged = addLog(result, `你提議 ${requested} 次；${choices.map(choice => `${previous.players[choice.index].name} 接受最多 ${choice.count} 次`).join("、")}；最終派 ${runs} 次`);
    return { ...logged, message: result.message };
  })} />}<main className={`app-shell standard-motion-${motionMode}`}>
    <div className="three-mode-picker table-mode-picker" role="group" aria-label="切換遊戲模式">
      <button className={gameMode === "cash" ? "selected" : ""} onClick={() => openModeLobby("cash")}><b>Cash</b><small>100BB</small></button>
      <button className={gameMode === "tournament" ? "selected" : ""} onClick={() => openModeLobby("tournament")}><b>錦標賽</b><small>升盲</small></button>
      <button onClick={enterAof}><b>AOF</b><small>娛樂模式</small></button>
    </div>
    <div className="career-strip"><b>Bankroll {fmt(career.balance)} C</b><span>{isTournament ? tournamentEntry ? `報名 ${tournamentEntry} C · 獎池 ${tournamentPrizePool} C` : "舊版練習賽事" : career.transactions.some(tx => tx.id === `cash:${game.tableId}:buy-in`) ? `Cash BB ${cashStake} C · 100BB 買入 ${cashStake * 100} C` : "舊版練習桌"}</span></div>{bankrollMessage && <p className="bankroll-message" role="alert">{bankrollMessage}</p>}{saveStatus === "error" && <p className="bankroll-message" role="alert">{saveFailure || "本機同步失敗，請檢查網絡。"}</p>}
    <header className="topbar">
      <div><div className="brand-mark">{tableSize}</div><div><h1>{tableSize}-MAX</h1><p>{isTournament ? `TOURNAMENT · LEVEL ${blindLevel}` : "CASH GAME · 100BB"}</p></div></div>
      <div className="table-options">
        <div className="difficulty-switch" role="group" aria-label="AI 難度">
          {(Object.keys(DIFFICULTY_INFO) as Difficulty[]).map(mode => <button key={mode} className={difficulty === mode ? "selected" : ""} aria-pressed={difficulty === mode} onClick={() => setDifficulty(mode)}><span>{DIFFICULTY_INFO[mode].label}</span><small>{DIFFICULTY_INFO[mode].short}</small></button>)}
        </div>
        <div className="training-switch"><button onClick={() => setLeakFinderOpen(true)}>Leak Finder</button><button onClick={openScenarioLab}>情境訓練</button><button className={studyMode ? "active" : ""} onClick={() => setStudyMode(value => !value)}>Study {studyMode ? "ON" : "OFF"}</button></div>
      </div>
      <div className="hand-meta"><span>第 {game.handNo} 手</span><span>{STREET_LABEL[game.street]}</span><span className={`save-status ${saveStatus}`}>● {saveStatusLabel}</span><label className="standard-motion-control">動畫 <select aria-label="標準牌桌動畫速度" value={motionMode} onChange={event => changeMotionMode(event.target.value as "normal" | "fast" | "off")}><option value="normal">正常</option><option value="fast">快速</option><option value="off">關閉</option></select></label><button onClick={openLobby}>新牌桌</button></div>
    </header>
    {isTournament && <><section className="tournament-hud" aria-label="錦標賽狀態">
      <div><span>LEVEL · {TOURNAMENT_SPEEDS[tournamentSpeed].label}</span><b>{blindLevel}</b></div><div><span>{mtt ? "此手盲注" : "盲注"}</span><b>{fmt(game.smallBlind ?? 0.5)} / {fmt(game.bigBlind ?? 1)}</b></div><div><span>BB ANTE</span><b>{game.bigBlindAnte ? fmt(game.bigBlindAnte) : "第3級起"}</b></div><div><span>下次升盲</span><b>{mtt ? blindLevel >= TOURNAMENT_BLINDS.length ? "最高級" : `${Math.floor(mttLevelRemaining / 60000)}:${String(Math.floor(mttLevelRemaining / 1000) % 60).padStart(2, "0")}` : `${blindCountdown} 手後`}</b></div><div><span>剩餘人數</span><b>{playersAbleToContinue} 人</b></div><div><span>你嘅籌碼</span><b>{fmt(hero.stack / (game.bigBlind ?? 1))} BB</b></div>
      <i><span style={{ width: `${(mtt ? mttLevelProgress : (handsPerLevel - blindCountdown + 1) / handsPerLevel) * 100}%` }} /></i>
    </section>{mtt && <section className="mtt-hud" aria-label="多桌賽全場進度"><strong>200 人多桌賽 · {mtt.tables.filter(table => table.length).length} 桌進行中</strong><span>你暫列第 {heroPlace ?? "—"} 名 · 前 {MTT_PAID} 名有獎</span><span>{mtt.handNo <= game.handNo && game.finished ? "其他桌結算中…" : mtt.tables.filter(table => table.length).length === 1 ? "FINAL TABLE" : mttHandForHand(mtt) ? "HAND FOR HAND · 錢圈／決賽桌前逐手同步" : "背景桌獨立進行 · 轉桌只喺完手後"}</span><button type="button" onClick={() => setMttHighlightsOpen(true)}>全場精華 · {mtt.highlights?.length ?? 0}</button></section>}<section className={`tournament-prizes phase-${tournamentStatus}`} aria-label="錦標賽獎勵結構"><strong>{tournamentStatus === "complete" ? "錦標賽結束" : tournamentStatus === "bubble" ? "BUBBLE · 再淘汰 1 人入獎勵圈" : tournamentStatus === "in-the-money" ? "IN THE MONEY · 已入獎勵圈" : `獎勵圈 · 前 ${paidPlaces.length} 名`}</strong><span className="prize-detail">{(mtt ? paidPlaces.slice(0, 3) : paidPlaces).map((share, index) => `第${index + 1}名 ${tournamentPrizePool ? `${fmt(share * tournamentPrizePool / 100)} C` : `${share}點`}`).join(" · ")}{mtt ? ` · 第4–${MTT_PAID}名亦有獎` : ""}{tournamentPrizePool ? ` · 獎池 ${tournamentPrizePool} C` : " · 舊版虛擬獎勵"}</span><button type="button" onClick={() => setTournamentInfoOpen(true)}>完整賽事資訊 →</button></section></>}
    <HandFilterPanel filter={handFilter} onChange={setHandFilter} currentPosition={heroPosition} tableSize={tableSize} />

    <section className="game-grid">
      <div className="table-wrap">
        <div className={`felt table-${tableSize}-max`}>
          <div className="rail-label">{isTournament ? `錦標賽 L${blindLevel} · ${fmt(game.smallBlind ?? 0.5)} / ${fmt(game.bigBlind ?? 1)}${game.bigBlindAnte ? ` · BB Ante ${fmt(game.bigBlindAnte)}` : ""} · OUT 即淘汰` : `${tableSize}-MAX · 0.5 / 1 BB · 每位 100BB 起始 · RE-BUY ×2`}</div>
          {game.players.map((player, index) => {
            const slot = SEAT_SLOTS[tableSize][index];
            return <div key={player.id} className={`table-seat seat-pos-${slot} ${player.folded ? "folded" : ""} ${player.allIn ? "all-in" : ""} ${game.turn === index ? "acting" : ""} ${visibleMotion?.foldedSeat === index ? "standard-seat-fold" : ""} ${visibleMotion?.winners.includes(index) ? "standard-seat-win" : ""}`}>
            {index !== 0 && <div className={`mini-hole ${game.finished && (studyMode || !player.folded) ? "revealed" : ""} ${visibleMotion?.deal ? "standard-dealing" : ""}`}>{player.hole.map((card, cardIndex) => <CardView key={cardIndex} card={card} mini hidden={!game.finished || player.folded && !studyMode} />)}</div>}
            <div className={`avatar ${index === 0 ? "hero-avatar" : ""}`}>{index === 0 ? "你" : index}</div>
            <div className="seat-copy"><span>{index === 0 || isTournament && mtt ? player.name : <>{player.name} · {personality(index).name}<em className="seat-personality"> · {personality(index).style}</em></>}{(player.stack > 0 || !isTournament && game.rebuysUsed[index] < MAX_REBUYS) && <em className="position-tag">{displayPosition(game, index)}</em>}{!isTournament && <em aria-label={`剩餘 ${MAX_REBUYS - game.rebuysUsed[index]} 次 Re-buy`} className={`rebuy-tag ${game.rebuysUsed[index] >= MAX_REBUYS ? "depleted" : ""}`}>R{MAX_REBUYS - game.rebuysUsed[index]}</em>}</span><b>{player.stack > 0 ? `${fmt(player.stack)}${isTournament ? " 籌碼" : " BB"}` : !game.finished && player.allIn ? "ALL-IN" : !isTournament && game.rebuysUsed[index] < MAX_REBUYS ? "待補 100BB" : "OUT"}</b>{isTournament && player.stack > 0 && <em className={`tournament-depth ${player.stack / (game.bigBlind ?? 1) < 10 ? "short" : ""}`}>{fmt(player.stack / (game.bigBlind ?? 1))} BB</em>}<small>{player.lastAction}</small></div>
            {game.button === index && <span className="dealer">D</span>}
            {player.streetBet > 0 && <span className="seat-bet">{fmt(player.streetBet)}</span>}
          </div>})}
          <div className="pot-chip"><span>底池</span><b>{fmt(pot)}{isTournament ? "" : " BB"}</b></div>
          {visibleMotion?.chipSeat !== null && visibleMotion?.chipSeat !== undefined && <div key={`chip-${visibleMotion.id}`} className={`standard-chip-flight slot-${SEAT_SLOTS[tableSize][visibleMotion.chipSeat]}`} aria-hidden="true"><i /><i /><i /></div>}
          {visibleMotion?.winners.map(index => <div key={`award-${visibleMotion.id}-${index}`} className={`standard-pot-award slot-${SEAT_SLOTS[tableSize][index]}`} aria-hidden="true"><i /><i /><i /></div>)}
          <div className="board">{[0,1,2,3,4].map(index => <div key={index} className={visibleMotion?.boardFrom !== null && visibleMotion?.boardFrom !== undefined && index >= visibleMotion.boardFrom && !!game.board[index] ? "standard-board-reveal" : ""} style={{ "--card-delay": `${Math.max(0, index - (visibleMotion?.boardFrom ?? 0)) * 70}ms` } as React.CSSProperties}><CardView card={game.board[index]} /></div>)}</div>
          <div className={`hero-hole ${hero.folded ? "standard-hole-folded" : ""} ${visibleMotion?.deal ? "standard-dealing" : ""} ${visibleMotion?.foldedSeat === 0 ? "standard-fold-action" : ""}`}>{hero.hole.map((card, index) => <CardView key={index} card={card} />)}</div>
        </div>

        <div className="status-line"><div><span className={game.turn === 0 ? "turn-dot active" : "turn-dot"} />{thinking ? `${thinking} 正在思考…` : game.message}</div>{heroHand && !game.finished && <span className="hand-strength">目前：{heroHand}</span>}</div>
        {!game.finished ? <><div className={`controls ${game.turn !== 0 ? "disabled" : ""}`}>{isTournament && <div className={`tournament-decision-clock ${timedTurnActive && tournamentClock?.remainingMs !== undefined && tournamentClock.remainingMs <= 5000 ? "urgent" : ""}`} role="timer" aria-label="行動倒數"><div><b>{timedTurnActive && tournamentClock?.turnKey === tournamentTurnKey ? Math.ceil(tournamentClock.remainingMs / 1000) : "—"} 秒</b><span>Time-bank 餘額 {Math.ceil((tournamentClock?.bankMs ?? 90_000) / 1000)} 秒</span></div><button disabled={!timedTurnActive || tournamentClock?.turnKey !== tournamentTurnKey || !!tournamentClock.extended || !tournamentClock.bankMs || !tournamentClock.remainingMs} onClick={() => setTournamentClock(previous => previous?.turnKey === tournamentTurnKey ? extendDecisionClock(previous) : previous)}>＋ 15 秒 Time-bank</button></div>}
          <button className="action secondary danger" disabled={game.turn !== 0} onClick={() => heroAction("fold")}>棄牌</button>
          <button className="action secondary call-action" disabled={game.turn !== 0} onClick={() => { if (toCall >= hero.stack && toCall > 0 && !window.confirm(`確認 All-in 跟注？今次投入 ${fmt(hero.stack)} ${isTournament ? "籌碼" : "BB"}。`)) return; heroAction("checkcall"); }}>{toCall > 0 ? `跟注 ${fmt(Math.min(toCall, hero.stack))}` : "過牌"}</button>
          <button className={`action hint-action ${visibleHint ? "hint-open" : ""}`} disabled={game.turn !== 0} onClick={() => setHint(visibleHint ? null : buildGtoHint(game))}>✦ AI 提示</button>
          <div className="raise-control"><div className="raise-presets" aria-label="快捷下注尺度">
            {!facingRaise && game.street === "preflop" ? <><button disabled={!canRaise || game.turn !== 0} onClick={() => preset("open2")}>2BB</button><button disabled={!canRaise || game.turn !== 0} onClick={() => preset("open25")}>2.5BB</button><button disabled={!canRaise || game.turn !== 0} onClick={() => preset("open3")}>3BB</button></> : !facingRaise ? <><button disabled={!canRaise || game.turn !== 0} onClick={() => preset("half")}>½ 池</button><button disabled={!canRaise || game.turn !== 0} onClick={() => preset("pot")}>全池</button></> : <><button disabled={!canRaise || game.turn !== 0} onClick={() => preset("x2")}>×2</button><button disabled={!canRaise || game.turn !== 0} onClick={() => preset("x3")}>×3</button></>}
            <button className="preset-allin" disabled={!canRaise || game.turn !== 0} onClick={() => preset("allin")}>All-in</button>
          </div><div className="raise-input-row"><input aria-label="加注額滑桿" type="range" min={minTo} max={Math.max(minTo, maxTo)} step="0.5" value={effectiveRaiseTo} disabled={!canRaise || game.turn !== 0} onChange={event => setRaiseTo(Number(event.target.value))} /><label>至 <input aria-label="輸入下注總額" type="number" inputMode="decimal" min={minTo} max={maxTo} step="0.5" value={raiseDraft ?? String(chip(effectiveRaiseTo))} disabled={!canRaise || game.turn !== 0} onFocus={() => setRaiseDraft(String(chip(effectiveRaiseTo)))} onChange={event => setRaiseDraft(event.target.value)} onBlur={() => { const value = Number(raiseDraft); if (raiseDraft?.trim() && Number.isFinite(value)) setRaiseTo(Math.max(minTo, Math.min(maxTo, chip(value)))); setRaiseDraft(null); }} onKeyDown={event => { if (event.key === "Enter") event.currentTarget.blur(); }} /></label></div><small className="raise-cost">今次投入 {fmt(Math.max(0, chip(effectiveRaiseTo) - hero.streetBet))} {isTournament ? "籌碼" : "BB"} · 合法範圍 {fmt(minTo)}–{fmt(maxTo)}</small></div>
          <button className="action primary" disabled={!canRaise || game.turn !== 0} onClick={() => { const target = Math.max(minTo, Math.min(maxTo, chip(effectiveRaiseTo))); if (target >= maxTo && !window.confirm(`確認 All-in？今次投入 ${fmt(hero.stack)} ${isTournament ? "籌碼" : "BB"}。`)) return; heroAction("raise", target); }}>{game.currentBet === 0 ? "下注" : "加注至"} {fmt(chip(effectiveRaiseTo))}</button>
        </div>{visibleHint && <div className="gto-hint" aria-live="polite"><div className="hint-icon">✦</div><div className="hint-copy"><span>GTO COPILOT · 只用公開資訊</span><h3>{visibleHint.title}</h3><div className="hint-action-line"><strong>{visibleHint.action}</strong>{visibleHint.size && <b>{visibleHint.size}</b>}</div><p>{visibleHint.detail}</p><div className="hint-metrics">{visibleHint.metrics.map(metric => <i key={metric}>{metric}</i>)}</div></div><button className="hint-close" aria-label="關閉提示" onClick={() => setHint(null)}>×</button></div>}</> : <><div className="result-panel"><div className="result-copy"><span>{matchOver ? isTournament ? mtt && mttRemaining(mtt) > 1 ? "你已出局" : "錦標賽結束" : "牌桌結束" : "本手結束"}</span><strong>{game.message}</strong>{game.potSummary.map(line => <small key={line}>{line}</small>)}{autoNextHand && <small className="rebuy-notice">↻ 範圍自動棄牌 · 約 2 秒後開下一手</small>}{autoSpectate && <small className="rebuy-notice">你已出局 · 正在完成其餘名次</small>}{studyMode && <small className="study-result-note">◉ Study Mode：已揭示包括muck牌在內嘅AI底牌</small>}{pendingRebuys.length > 0 && !matchOver && <small className="rebuy-notice">↻ {pendingRebuys.map(index => PLAYER_NAMES[index]).join("、")} 下一手自動 Re-buy 100BB</small>}{heroOut && <small className="rebuy-notice out-notice">{isTournament ? `你以第 ${heroPlace ?? "—"} 名出局${matchOver ? "" : "；AI將繼續決出冠軍"}` : career.cash?.id === game.tableId && career.balance < 100 * career.cash.bb ? "Bankroll 不足補碼；本桌已結算" : "你已用盡兩次 Re-buy，籌碼清零後正式 OUT"}</small>}{revealedAi.length > 0 && <div className="result-hands" aria-label="AI 翻開的底牌">{revealedAi.map(player => <div className={`result-hand ${player.folded ? "study-mucked" : ""}`} key={player.id}><b>{player.name}{player.folded ? " · Fold" : ""}</b><div>{player.hole.map((card, index) => <CardView key={index} card={card} mini />)}</div></div>)}</div>}{game.runoutBoards && game.runoutBoards.length > 1 && <div className="runout-boards">{game.runoutBoards.map((board, index) => <div key={index}><b>第 {index + 1} 次</b><span>{board.map(card => <CardView key={cardKey(card)} card={card} mini />)}</span></div>)}</div>}{game.street === "showdown" && game.board.length === 5 && (game.runoutBoards?.length ?? 1) === 1 && <div className={`standard-winning-five ${visibleMotion?.winners.length ? "animate" : ""}`} aria-label="勝出玩家最佳五張牌">{game.winners.map(index => <div key={index}><b>{game.players[index].name} · {HAND_LABEL[bestScore([...game.players[index].hole, ...game.board])[0]]}</b><span>{aofBestFive([...game.players[index].hole, ...game.board]).map(card => <CardView key={cardKey(card)} card={card} mini />)}</span></div>)}</div>}</div><button onClick={nextHand} disabled={!!mtt && mtt.handNo <= game.handNo}>{mtt && mtt.handNo <= game.handNo ? "全場結算中…" : matchOver ? "返回選桌" : pendingRebuys.includes(0) ? "Re-buy 100BB →" : "下一手 →"}</button></div>{isTournament && matchOver && <section className="tournament-final" aria-label="錦標賽最終排名"><h2>{mtt && mttRemaining(mtt) > 1 ? "目前名次 · 全場仍在進行" : "最終排名"}</h2><p>{tournamentPrizePool ? `獎池 ${tournamentPrizePool} C` : "虛擬獎勵總額 100 點"} · {TOURNAMENT_SPEEDS[tournamentSpeed].label}</p><ol>{(mtt ? mttStandings(mtt).map(entry => ({ seat: entry.id, place: entry.place })) : standings).filter(entry => !mtt || entry.place <= 30 || entry.seat === 0).map(entry => <li key={entry.seat} className={entry.seat === 0 ? "hero" : ""}><b>第 {entry.place} 名</b><span>{entry.seat === 0 ? "你" : mtt ? `AI ${entry.seat}` : PLAYER_NAMES[entry.seat]}</span><strong>{tournamentPrizePool ? `${fmt(mtt ? mttPrize(tournamentEntry, entry.place, mttStandings(mtt).map(item => item.place)) : prizeForPlace(entry.place, tableSize, standings) * tournamentPrizePool / 100)} C` : `${prizeForPlace(entry.place, tableSize, standings)} 點`}</strong></li>)}</ol></section>}</>}
      </div>

      <aside className="side-panel">
        <section className={`roster roster-${tableSize}`}><div className="panel-title"><h2>全桌數據</h2><span>點選玩家查看</span></div>{game.players.map((player, index) => {
          const stats = sessions[index];
          return <button className={`roster-row ${game.turn === index ? "current" : ""} ${selectedSeat === index ? "selected-stat" : ""}`} key={player.id} onClick={() => setSelectedSeat(index)}><span><i>{index === 0 ? "你" : index}</i>{player.name}</span><span className="row-stats"><small>V {statPercent(stats.vpipHands, stats.hands)}% · P {statPercent(stats.pfrHands, stats.hands)}% · 3B {statPercent(stats.threeBetHands, stats.threeBetOpportunities)}%</small><b>{fmt(isTournament ? player.stack : player.stack + player.streetBet)}{isTournament ? ` 籌碼 · ${fmt(player.stack / (game.bigBlind ?? 1))}BB` : ` BB · R${MAX_REBUYS - game.rebuysUsed[index]}`}</b></span></button>;
        })}</section>
        <section className="session-panel">
          <div className="panel-title"><h2>SESSION · {PLAYER_NAMES[selectedSeat]}</h2><button onClick={() => { setSessions(PLAYER_NAMES.slice(0, tableSize).map(() => emptySessionStats())); setCoachReviews([]); setProfitHistory([]); }}>全部重設</button></div>
          {selectedSeat !== 0 && <div className="ai-profile"><div className="ai-profile-mark">{selectedSeat}</div><div><small>對手傾向</small><b>{selectedProfile}</b><span>{selectedStats.hands} 手樣本 · 建議至少 20 手</span></div></div>}
          <div className="stats-grid">
            <div><span>手數</span><b>{selectedStats.hands}</b></div><div><span>盈虧</span><b className={selectedStats.profit >= 0 ? "positive" : "negative"}>{selectedStats.profit >= 0 ? "+" : ""}{fmt(selectedStats.profit)} {isTournament ? "籌碼" : "BB"}</b></div>
            <div><span>VPIP</span><b>{percent(selectedStats.vpipHands)}%</b></div><div><span>PFR</span><b>{percent(selectedStats.pfrHands)}%</b></div>
            <div><span>3-BET</span><b>{percent(selectedStats.threeBetHands, selectedStats.threeBetOpportunities)}%</b></div><div><span>WTSD</span><b>{percent(selectedStats.showdownHands, selectedStats.sawFlopHands)}%</b></div>
          </div>
          {!isTournament && <div className={`rebuy-status ${selectedRebuysLeft === 0 ? "depleted" : ""}`}><span>RE-BUY</span><b>{selectedRebuys} / {MAX_REBUYS} 已用</b><small>{selectedRebuysLeft > 0 ? `尚餘 ${selectedRebuysLeft} 次 · 每次固定補回 100BB` : game.players[selectedSeat].stack > 0 ? "已用盡；下次籌碼清零即 OUT" : "已用盡並正式 OUT"}</small></div>}
          {selectedSeat === 0 ? <div className="coach-card"><span>行動紀錄</span><p>{latestReview ? `最新行動：${decisionActionLabel(latestReview)}` : "完成行動後會記錄牌局。"} 自動評分及 EV loss 暫停使用。</p></div> : <div className="coach-card opponent-card"><span>統計說明</span><p>VPIP 係自願入池率；PFR 係翻牌前加注率；3-bet 只以實際面對 open 嘅機會作分母；WTSD 以見過 flop 嘅手數計算。</p></div>}
        </section>
        <section className="profit-panel">
          <div className="panel-title"><h2>SESSION CURVE</h2><span>{profitHistory.length} 手</span></div>
          <div className="profit-legend">
            <div><i className="legend-actual" /><span>實際盈虧</span><b className={(latestProfit?.actual ?? 0) >= 0 ? "positive" : "negative"}>{(latestProfit?.actual ?? 0) >= 0 ? "+" : ""}{fmt(latestProfit?.actual ?? 0)} {isTournament ? "籌碼" : "BB"}</b></div>
            <div><i className="legend-ev" /><span>All-in EV</span><b className={(latestProfit?.allInEv ?? 0) >= 0 ? "positive" : "negative"}>{(latestProfit?.allInEv ?? 0) >= 0 ? "+" : ""}{fmt(latestProfit?.allInEv ?? 0)} {isTournament ? "籌碼" : "BB"}</b></div>
          </div>
          <ProfitChart points={profitHistory} />
          <p className="profit-note">All-in EV 只喺全押仍有對手爭池時，按全押一刻嘅勝率調整。</p>
        </section>
        <section className="hand-library-panel">
          <div className="panel-title"><h2>HAND HISTORY</h2><span>{handHistory.length}/100</span></div>
          {handHistory.length ? <><div className="recent-hands">{handHistory.slice(0, 3).map(hand => <button key={hand.id} onClick={() => openHandReview(hand.id)}><span>#{hand.handNo} · {hand.heroHole.map(card => `${RANK_LABEL[card.rank] ?? card.rank}${SUIT_GLYPH[card.suit]}`).join(" ")}</span><b className={hand.actualProfit >= 0 ? "positive" : "negative"}>{hand.actualProfit >= 0 ? "+" : ""}{fmt(hand.actualProfit)}{isTournament ? "籌碼" : "BB"}</b>{hand.favourite && <i>★</i>}</button>)}</div><button className="open-history" onClick={() => openHandReview()}>重播及檢討全部手牌 →</button></> : <p className="history-empty">完成一手後，呢度會保存完整行動。</p>}
        </section>
        {game.finished && studyMode && <section className="study-panel"><div className="panel-title"><h2>STUDY MODE</h2><span>AI決策解釋</span></div>{game.aiDecisions?.length ? game.aiDecisions.slice(-10).reverse().map(decision => <div className="study-mini" key={decision.id}><span>{STREET_LABEL[decision.street]} · {PLAYER_NAMES[decision.actor]}</span><b>{decision.title}</b><p>{decision.detail}</p><small>{decision.range}</small></div>) : <p className="history-empty">呢手未有AI主動決策。</p>}<button className="open-history" onClick={() => openHandReview(`${game.tableId}-${game.handNo}`)}>完整檢討及全部metrics →</button></section>}
        <section className="history"><div className="panel-title"><h2>行動紀錄</h2><span>最近 18 項</span></div><ol>{game.log.map((line, index) => <li key={`${line}-${index}`}><span>{index === 0 ? "現在" : index}</span><p>{line}</p></li>)}</ol></section>
        <section className="rules-note mode-note"><h3>{tableSize} 人桌 · {isTournament ? `錦標賽 Level ${blindLevel}` : `AI 難度：${DIFFICULTY_INFO[difficulty].label}`}</h3><p>{DIFFICULTY_INFO[difficulty].detail}。{isTournament ? `不設 Re-buy，每 ${handsPerLevel} 手升盲；第 3 級起由大盲支付 BB Ante，籌碼清零即淘汰。` : "每位玩家最多兩次 100BB Re-buy，用盡後再次清零先 OUT。"}{displayPosition(game, 0)} 參考 open range約 {positionOpenPercent(heroPosition, activeTableSize(game))}%。</p></section>
      </aside>
    </section>
  </main>{reviewModal}{leakModal}{scenarioModal}{mttHighlightsModal}{tournamentInfoModal}</>;
}
