import type { Duel, Fighter, Side } from '../systems/BattleSystem';

/** 擂台戰的可序列化畫面資料：武將以 id 表示，畫面再從遊戲狀態取用 */
export type FighterSnapshot = Omit<Fighter, 'general'> & { generalId: string };

export interface DuelSnapshot {
  a: FighterSnapshot;
  b: FighterSnapshot;
  rounds: number;
  first: Side | null;
  over: boolean;
  draw: boolean;
  winner: Side | null;
  canSkill: Record<Side, boolean>;
}

const fighter = (f: Fighter): FighterSnapshot => {
  const { general, ...rest } = f;
  return JSON.parse(JSON.stringify({ ...rest, generalId: general.id })) as FighterSnapshot;
};

export function duelSnapshot(d: Duel): DuelSnapshot {
  return {
    a: fighter(d.a),
    b: fighter(d.b),
    rounds: d.rounds,
    first: d.first,
    over: d.over,
    draw: d.draw,
    winner: d.winner,
    canSkill: { a: d.canSkill('a'), b: d.canSkill('b') },
  };
}
