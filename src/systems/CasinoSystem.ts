import type { Lord } from '../game/types';

/** 地圖正中、不與道路相連，經由傳送陣或指定傳送抵達的賭場 */
export const CASINO_NAME = '乾坤骰閣';

/** 最低賭注：1 中品 */
export const CASINO_MIN_BET = 100;

export type Dice = [number, number, number];
export type CasinoOutcome = 'win' | 'triple' | 'lose' | 'push';

export interface CasinoResult {
  bet: number;
  player: Dice;
  dealer: Dice;
  outcome: CasinoOutcome;
  /** 結算後淨得失（輸為負數） */
  net: number;
}

export const rollDice = (rand = Math.random): Dice => [1, 2, 3].map(() => 1 + Math.floor(rand() * 6)) as Dice;
export const diceTotal = (d: Dice) => d[0] + d[1] + d[2];
export const isTriple = (d: Dice) => d[0] === d[1] && d[1] === d[2];

/**
 * 比大小：豹子（三顆相同）勝過任何非豹子，豹子對豹子比點數；其餘比總點數。
 * 贏 1 賠 1；以豹子獲勝 1 賠 3；點數相同為和局，退還賭注。
 */
export function judge(player: Dice, dealer: Dice): CasinoOutcome {
  const pt = isTriple(player), dt = isTriple(dealer);
  if (pt !== dt) return pt ? 'triple' : 'lose';
  const diff = diceTotal(player) - diceTotal(dealer);
  if (diff === 0) return 'push';
  return diff > 0 ? (pt ? 'triple' : 'win') : 'lose';
}

export const PAYOUT: Record<CasinoOutcome, number> = { win: 1, triple: 3, push: 0, lose: -1 };

/** 可下注的上限：全部身家（以 1 中品為單位） */
export const maxBet = (lord: Lord) => Math.floor(lord.stones / CASINO_MIN_BET) * CASINO_MIN_BET;

/** 擲骰並結算；賭注會先扣除再依結果發還。 */
export function playCasino(lord: Lord, bet: number, rand = Math.random): CasinoResult {
  bet = Math.floor(bet / CASINO_MIN_BET) * CASINO_MIN_BET;
  if (bet < CASINO_MIN_BET || bet > lord.stones) throw new Error('賭注不正確');
  const player = rollDice(rand), dealer = rollDice(rand);
  const outcome = judge(player, dealer);
  const net = bet * PAYOUT[outcome];
  lord.stones += net;
  return { bet, player, dealer, outcome, net };
}

/** 電腦主公：手頭寬裕時半數機會小賭一把（身家 5%–15%）。 */
export function aiCasinoBet(lord: Lord, rand = Math.random): number {
  if (lord.stones < 20000 || rand() >= 0.5) return 0;
  const bet = Math.floor((lord.stones * (0.05 + rand() * 0.1)) / CASINO_MIN_BET) * CASINO_MIN_BET;
  return Math.max(CASINO_MIN_BET, bet);
}
