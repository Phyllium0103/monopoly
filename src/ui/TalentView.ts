import type { GameState, Lord } from '../game/types';
import { REALMS } from '../data/generals';
import {
  ROW_POINTS, ROW_REALM, TALENTS, TALENT_BY_ID, TALENT_REFUND_ITEM, TALENT_RESET_ITEM, TALENT_TREES,
  canLearnTalent, canRefundTalent, canResetTalents, talentBlockers, talentRank, talentSpent, teamRealm, type TalentNode, type TalentTree,
} from '../data/talents';
import './talent-view.css';

export type TalentRequest = { op: 'learn' | 'refund' | 'reset'; node?: string };

const ROWS = 6;
const COLS = 5;

/** 格子上的字：取名字中同一棵樹還沒用過的第一個字（頂層取兩字） */
const GLYPH: Record<string, string> = {};
for (const t of TALENT_TREES) {
  const used = new Set<string>();
  for (const n of TALENTS.filter((x) => x.tree === t.id)) {
    if (n.row === ROWS) { GLYPH[n.id] = n.name.slice(0, 2); continue; }
    const ch = [...n.name].find((c) => !used.has(c)) ?? n.name[0];
    used.add(ch);
    GLYPH[n.id] = ch;
  }
}

/** 天賦樹面板：只負責顯示與送出操作，實際配點由引擎驗證。面板只建一次，之後只更新有變的部分 */
export class TalentView {
  private el: HTMLDivElement;
  private card: HTMLDivElement;
  private tree: TalentTree = 'govern';
  /** 目前格子屬於哪棵樹；換頁籤才重建格子 */
  private builtTree: TalentTree | null = null;
  private selected: string | null = null;
  private state: GameState | null = null;
  private lord: Lord | null = null;
  private editable = false;
  private frame = 0;
  onRequest: ((r: TalentRequest) => void) | null = null;

  constructor(root: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'help-backdrop talent-backdrop hidden';
    this.el.innerHTML = `
      <div class="talent-card">
        <div class="tl-head">
          <h2>天賦</h2>
          <div class="tl-points"></div>
          <button class="tl-close" aria-label="關閉">✕</button>
        </div>
        <nav class="tl-tabs">${TALENT_TREES.map((t) => `<button class="tl-tab tree-${t.id}" data-t="${t.id}">${t.icon} ${t.name}<small></small></button>`).join('')}</nav>
        <div class="tl-board">
          <div class="tl-rows"></div>
          <div class="tl-grid"></div>
        </div>
        <div class="tl-detail"></div>
        <div class="tl-foot">
          <span class="tl-refund-count"></span>
          <span class="tl-reset-count"></span>
          <button class="btn tl-reset">全部重置</button>
        </div>
        <p class="tl-note">只能在自己回合擲骰前配點</p>
      </div>`;
    root.appendChild(this.el);
    this.card = this.el.querySelector('.talent-card')!;
    this.el.addEventListener('click', (e) => this.onClick(e));
    this.el.addEventListener('contextmenu', (e) => {
      const node = (e.target as HTMLElement).closest<HTMLElement>('.tl-node');
      if (!node) return;
      e.preventDefault();
      const id = node.dataset.id!;
      this.select(id);
      if (this.editable && canRefundTalent(this.lord!, id).ok) this.onRequest?.({ op: 'refund', node: id });
    });
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && this.isOpen) this.close(); });
  }

  get isOpen() {
    return !this.el.classList.contains('hidden');
  }

  open(state: GameState, lord: Lord, editable: boolean) {
    this.el.classList.remove('hidden');
    this.state = state;
    this.lord = lord;
    this.editable = editable;
    this.patch();
  }

  /** 狀態變動後更新；同一幀內的多次更新合併成一次，避免引擎處理中途閃成唯讀 */
  update(state: GameState, lord: Lord, editable: boolean) {
    this.state = state;
    this.lord = lord;
    this.editable = editable;
    if (!this.isOpen || this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      if (this.isOpen) this.patch();
    });
  }

  close() {
    this.el.classList.add('hidden');
  }

  private onClick(e: MouseEvent) {
    const t = e.target as HTMLElement;
    if (t === this.el || t.closest('.tl-close')) return this.close();
    const tab = t.closest<HTMLElement>('.tl-tab');
    if (tab) {
      this.tree = tab.dataset.t as TalentTree;
      return this.patch();
    }
    const node = t.closest<HTMLElement>('.tl-node');
    if (node) {
      // 點一下就學：可學時直接送出，不能學時只顯示原因
      const id = node.dataset.id!;
      this.select(id);
      if (this.editable && canLearnTalent(this.state!, this.lord!, id).ok) this.onRequest?.({ op: 'learn', node: id });
      return;
    }
    if (t.closest('.tl-learn') && this.selected) return this.onRequest?.({ op: 'learn', node: this.selected });
    if (t.closest('.tl-refund') && this.selected) return this.onRequest?.({ op: 'refund', node: this.selected });
    if (t.closest('.tl-reset')) return this.onRequest?.({ op: 'reset' });
  }

  private select(id: string) {
    this.selected = id;
    this.patch();
  }

  private nodeState(n: TalentNode): 'maxed' | 'learned' | 'open' | 'locked' {
    const rank = talentRank(this.lord!, n.id);
    if (rank >= n.max) return 'maxed';
    if (canLearnTalent(this.state!, this.lord!, n.id).ok) return 'open';
    return rank > 0 ? 'learned' : 'locked';
  }

  /** 換樹時重建格子與連線 */
  private buildTree() {
    const nodes = TALENTS.filter((n) => n.tree === this.tree);
    const center = (n: TalentNode) => [((n.col + 0.5) / COLS) * 100, ((ROWS - n.row + 0.5) / ROWS) * 100];
    const lines = nodes.flatMap((n) => n.requires.map((id) => {
      const [x1, y1] = center(TALENT_BY_ID[id]), [x2, y2] = center(n);
      return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" data-a="${id}" data-b="${n.id}"/>`;
    })).join('');
    this.card.querySelector('.tl-grid')!.innerHTML = `<svg class="tl-lines" viewBox="0 0 100 100" preserveAspectRatio="none">${lines}</svg>` +
      nodes.map((n) => `<button class="tl-node ${n.row === ROWS ? 'cap' : ''} tree-${n.tree}" data-id="${n.id}" style="grid-row:${ROWS - n.row + 1};grid-column:${n.col + 1}" title="${n.name}：${n.text}">
        <span class="tl-glyph">${GLYPH[n.id]}</span><span class="tl-rank"></span></button>`).join('');
    this.card.querySelector('.tl-rows')!.innerHTML = Array.from({ length: ROWS }, (_, i) => {
      const row = ROWS - i;
      const need = [ROW_POINTS[row] ? `${ROW_POINTS[row]}點` : '', ROW_REALM[row] ? REALMS[ROW_REALM[row]] : ''].filter(Boolean).map((t) => `<small>${t}</small>`).join('');
      return `<div class="tl-rowmark" data-row="${row}" style="grid-row:${i + 1}">${row === ROWS ? '頂' : row}${need}</div>`;
    }).join('');
    this.builtTree = this.tree;
  }

  private patch() {
    const state = this.state!, lord = this.lord!;
    if (this.selected && TALENT_BY_ID[this.selected]?.tree !== this.tree) this.selected = null;
    if (this.builtTree !== this.tree) this.buildTree();
    const realm = teamRealm(state, lord);
    const pills = (id: string) => lord.items.filter((i) => i.defId === id).length;
    const q = <T extends Element>(sel: string) => this.card.querySelector<T>(sel)!;

    q('.tl-points').innerHTML = `天賦點數：<b>${lord.talentPoints ?? 0}</b><small>隊伍境界 ${REALMS[realm]}</small>`;
    this.card.querySelectorAll<HTMLElement>('.tl-tab').forEach((b) => {
      b.classList.toggle('on', b.dataset.t === this.tree);
      b.querySelector('small')!.textContent = `${talentSpent(lord, b.dataset.t as TalentTree)}`;
    });
    this.card.querySelectorAll<HTMLElement>('.tl-rowmark').forEach((m) => m.classList.toggle('off', realm < ROW_REALM[Number(m.dataset.row)]));
    this.card.querySelectorAll<HTMLElement>('.tl-node').forEach((b) => {
      const n = TALENT_BY_ID[b.dataset.id!];
      const st = this.nodeState(n);
      for (const c of ['maxed', 'learned', 'open', 'locked']) b.classList.toggle(c, c === st);
      b.classList.toggle('sel', this.selected === n.id);
      b.querySelector('.tl-rank')!.textContent = `${talentRank(lord, n.id)}/${n.max}`;
    });
    this.card.querySelectorAll<SVGLineElement>('.tl-lines line').forEach((l) =>
      l.classList.toggle('lit', talentRank(lord, l.dataset.a!) > 0 && talentRank(lord, l.dataset.b!) > 0));
    q('.tl-detail').innerHTML = this.detail();
    q('.tl-refund-count').textContent = `🍵 忘塵丹 ×${pills(TALENT_REFUND_ITEM)}`;
    q('.tl-reset-count').textContent = `🌀 輪迴丹 ×${pills(TALENT_RESET_ITEM)}`;
    const reset = canResetTalents(lord), resetBtn = q<HTMLButtonElement>('.tl-reset');
    resetBtn.disabled = !(this.editable && reset.ok);
    resetBtn.title = reset.reason;
    q<HTMLElement>('.tl-note').style.visibility = this.editable ? 'hidden' : 'visible';
  }

  private detail(): string {
    const n = this.selected ? TALENT_BY_ID[this.selected] : null;
    if (!n) return '<p class="tl-hint">點一下天賦就能學習<br>右鍵可用忘塵丹退一級<br>由下往上點，越高層效果越強<br>頂層兩個天賦只能選一個</p>';
    const lord = this.lord!, rank = talentRank(lord, n.id);
    const blockers = rank >= n.max ? [] : talentBlockers(this.state!, lord, n.id), refund = canRefundTalent(lord, n.id);
    const why = blockers.map((t) => `<p class="tl-why">${t}</p>`).join('');
    return `<div class="tl-detail-text"><div class="tl-detail-head"><b>${n.name}</b><span>${rank}/${n.max} 級</span></div>
      <p class="tl-label">每級效果</p>
      <ul class="tl-effects">${n.text.split('・').map((t) => `<li>${t}</li>`).join('')}</ul>${why}</div>
      <div class="tl-actions">
        <button class="btn tl-learn" ${this.editable && rank < n.max && !blockers.length ? '' : 'disabled'}>學習 ＋1</button>
        <button class="btn tl-refund" ${this.editable && refund.ok ? '' : 'disabled'} title="${refund.reason}">退一級（忘塵丹）</button>
      </div>`;
  }
}
