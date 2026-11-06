import type { CareerWallet } from "./career-bankroll";

export function careerProgress(wallet: CareerWallet) {
  const tx = wallet.transactions;
  const count = (kind: string) => tx.filter(item => item.kind === kind).length;
  const cash = count("buy-in");
  const tournaments = count("entry");
  const prizes = tx.filter(item => item.kind === "prize" && item.amount > 0).length;
  const aof = tx.filter(item => item.mode === "aof" && item.kind === "life" && item.id.endsWith(":life:1")).length;
  const tier = Math.min(4, 1 + Number(cash + tournaments + aof >= 3) + Number(cash + tournaments + aof >= 10) + Number(cash + tournaments + aof >= 25));
  const previouslyPlayed = (mode: "cash" | "aof" | "tournament", stake: number) => tx.some(item =>
    item.mode === mode && (mode === "cash" ? item.kind === "buy-in" && -item.amount === stake * 100 : mode === "aof" ? item.kind === "life" && -item.amount === stake * 8 : item.kind === "entry" && -item.amount === stake));
  const stakes = (mode: "cash" | "aof" | "tournament", options: readonly number[]) =>
    options.map((stake, index) => index < tier || previouslyPlayed(mode, stake));
  const bounty = prizes > 0 || tx.some(item => item.kind === "entry" && item.bounty);
  const achievements = [
    { title: "踏上牌桌", value: cash, goal: 1, unit: "次 Cash 買入" },
    { title: "現金桌常客", value: cash, goal: 10, unit: "次 Cash 買入" },
    { title: "初登賽場", value: tournaments, goal: 1, unit: "場錦標賽" },
    { title: "賽場常客", value: tournaments, goal: 3, unit: "場錦標賽" },
    { title: "首次獲獎", value: prizes, goal: 1, unit: "次錦標賽獎金" },
    { title: "獎金獵人", value: prizes, goal: 5, unit: "次錦標賽獎金" },
    { title: "AOF 挑戰者", value: aof, goal: 5, unit: "次 AOF Run" },
    { title: "賞金到手", value: count("bounty"), goal: 1, unit: "次賞金" },
    { title: "逆境驚喜", value: count("bad-beat"), goal: 1, unit: "次壞運大獎" },
  ];
  return { tier, total: cash + tournaments + aof, cash, tournaments, prizes, aof, bounty, achievements, stakes };
}
