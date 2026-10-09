import type { LordId } from '../game/types';
import type { Choice, SliderOptions } from '../ui/Dialog';
import type { Offer, SaleOffer, ShopKind } from '../systems/ShopSystem';
import type { DuelSnapshot } from './snapshots';

/**
 * 遊戲引擎向玩家提出的抉擇。全部都是可序列化的純資料：
 * 單機時由本機畫面回答；多人時由伺服器送到該玩家的瀏覽器，回答再傳回伺服器。
 */
export interface ChoiceSpec {
  label: string;
  sub?: string;
  disabled?: boolean;
  reason?: string;
  color?: string;
  icon?: string;
}

export interface ShopPromptData {
  shopKind: ShopKind;
  offers: Offer[];
  /** 已買下的貨品（offers 的索引） */
  sold: number[];
  recruited: number;
  recruitLimit: number;
  revivedOther: boolean;
  refreshes: number;
  /** 出售頁的收購清單 */
  sellStock: SaleOffer[];
}

export type Prompt =
  | { kind: 'choose'; title: string; text: string; icon: string; cancel: string | null; choices: ChoiceSpec[] }
  | { kind: 'pickMany'; title: string; text: string; confirm: string; min: number; max: number; choices: ChoiceSpec[] }
  | {
      kind: 'slider'; title: string; text: string; icon: string; min: number; max: number; step: number;
      initial?: number; unit?: string; confirm?: string;
      /** 預先算好的說明文字：鍵為數值（依 previewStep 取樣） */
      previews?: Record<number, string>; previewStep?: number;
    }
  | { kind: 'confirm'; title: string; text: string; yes: string; no: string; icon: string }
  | { kind: 'message'; title: string; text: string; icon: string; button: string }
  /** 擲骰前整備：回答要做的動作，或擲骰 */
  | { kind: 'preroll' }
  | { kind: 'shop'; shop: ShopPromptData }
  | { kind: 'casino' }
  | { kind: 'bid'; lot: { label: string; sub: string; price: number } }
  | { kind: 'duel'; side: 'a' | 'b'; duel: DuelSnapshot }
  /** 在地圖上點一格；allowCasino 為 false 時不能選乾坤骰閣 */
  | { kind: 'tile'; allowCasino: boolean }
  /** 武將名冊（可整備） */
  | { kind: 'roster' };

export type PrerollAction =
  | { type: 'roll' }
  | { type: 'auto' }
  | { type: 'items' }
  | { type: 'abilities' }
  | { type: 'materials' }
  | { type: 'recruit' }
  | { type: 'garrison' }
  | { type: 'roster' }
  | { type: 'sect' };

export type ShopAction =
  | { type: 'leave' }
  | { type: 'buy'; index: number }
  | { type: 'sell'; index: number }
  | { type: 'refresh' }
  | { type: 'lock'; index: number };

export type RosterAction =
  | { type: 'close' }
  | { type: 'break' | 'seclude' | 'upgrade' | 'equip' | 'learn' | 'abolish'; generalId: string };

export type DuelAction = 'attack' | 'skill' | 'item';

/** 斷線或交由電腦代打時，各種抉擇的預設回答（保守、不花錢） */
export function defaultAnswer(p: Prompt): unknown {
  switch (p.kind) {
    case 'choose': {
      if (p.cancel !== null) return null;
      const i = p.choices.findIndex((c) => !c.disabled);
      return i >= 0 ? i : null;
    }
    case 'pickMany': {
      const idx = p.choices.map((c, i) => (c.disabled ? -1 : i)).filter((i) => i >= 0).slice(0, p.min);
      return idx.length >= p.min ? idx : null;
    }
    case 'slider': return p.initial ?? p.min;
    case 'confirm': return false;
    case 'message': return null;
    case 'preroll': return { type: 'roll' } satisfies PrerollAction;
    case 'shop': return { type: 'leave' } satisfies ShopAction;
    case 'casino': return null;
    case 'bid': return 0;
    case 'duel': return 'attack' satisfies DuelAction;
    case 'tile': return null;
    case 'roster': return { type: 'close' } satisfies RosterAction;
  }
}

const spec = <T>(c: Choice<T>): ChoiceSpec => ({ label: c.label, sub: c.sub, disabled: c.disabled, reason: c.reason, color: c.color, icon: c.icon });

/** 取樣上限：拉條說明最多預先算這麼多個數值 */
const MAX_PREVIEWS = 240;

export type Sender = (lord: LordId, prompt: Prompt) => Promise<unknown>;

/**
 * 與原本 Dialog 相同的呼叫方式，但綁定某位主公：
 * 選項的值留在引擎內，只送出文字；回答是索引，回來後再對應成原本的值，並檢查是否合法。
 */
export class Ask {
  constructor(private lord: LordId, private send: Sender) {}

  async choose<T>(title: string, text: string, choices: Choice<T>[], cancel: string | null = '取消', icon = ''): Promise<T | null> {
    const a = await this.send(this.lord, { kind: 'choose', title, text, icon, cancel, choices: choices.map(spec) });
    const c = typeof a === 'number' ? choices[a] : undefined;
    return c && !c.disabled ? c.value : null;
  }

  async pickMany<T>(title: string, text: string, choices: Choice<T>[], min: number, max: number, confirm = '確定'): Promise<T[] | null> {
    const a = await this.send(this.lord, { kind: 'pickMany', title, text, confirm, min, max, choices: choices.map(spec) });
    if (!Array.isArray(a)) return null;
    const idx = [...new Set(a)].filter((i): i is number => Number.isInteger(i) && !!choices[i] && !choices[i].disabled);
    if (idx.length !== a.length || idx.length < min || idx.length > max) return null;
    return idx.map((i) => choices[i].value);
  }

  async slider(title: string, text: string, opts: SliderOptions, icon = ''): Promise<number | null> {
    const { min, max, step = 100, initial, unit, confirm, preview } = opts;
    if (max < min) return null;
    let previews: Record<number, string> | undefined;
    let previewStep: number | undefined;
    if (preview) {
      previewStep = step * Math.max(1, Math.ceil((max - min) / step / MAX_PREVIEWS));
      previews = {};
      for (let v = min; v < max; v += previewStep) previews[v] = preview(v);
      previews[max] = preview(max);
    }
    const a = await this.send(this.lord, { kind: 'slider', title, text, icon, min, max, step, initial, unit, confirm, previews, previewStep });
    if (typeof a !== 'number' || !Number.isFinite(a)) return null;
    // 與拉條相同的對齊方式，避免送來任意數值
    return Math.max(min, Math.min(max, a >= max ? max : Math.round(a / step) * step || min));
  }

  async confirm(title: string, text: string, yes = '確定', no = '取消', icon = ''): Promise<boolean> {
    return (await this.send(this.lord, { kind: 'confirm', title, text, yes, no, icon })) === true;
  }

  async message(title: string, text: string, icon = '', button = '確定'): Promise<void> {
    await this.send(this.lord, { kind: 'message', title, text, icon, button });
  }
}

/** 拉條說明：取最接近（不超過）的預先算好數值 */
export function previewAt(p: Extract<Prompt, { kind: 'slider' }>, value: number): string {
  if (!p.previews || !p.previewStep) return '';
  if (value >= p.max) return p.previews[p.max] ?? '';
  const key = p.min + Math.floor((value - p.min) / p.previewStep) * p.previewStep;
  return p.previews[key] ?? '';
}
