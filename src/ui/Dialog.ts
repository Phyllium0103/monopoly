import { BreakthroughFlight, isBreakthroughFailure, isBreakthroughSuccessTitle } from './BreakthroughFlight';
import type { WeaponUpgradeNotice } from '../engine/prompts';
import { WeaponForge } from './WeaponForge';

export interface Choice<T> {
  label: string;
  sub?: string;
  value: T;
  disabled?: boolean;
  /** 無法選擇的原因 */
  reason?: string;
  color?: string;
  /** 圖片網址（物品、裝備、靈獸圖示或武將頭像） */
  icon?: string;
}

export interface SliderOptions {
  min: number;
  max: number;
  step?: number;
  initial?: number;
  unit?: string;
  confirm?: string;
  buttonsOnly?: boolean;
  /** 依目前數值顯示的說明（可含 HTML） */
  preview?: (value: number) => string;
}

/** 條列資料：一行一項，左邊項目名、右邊內容（可含 HTML，須無換行）；warn 的列以紅字強調 */
export function facts(rows: ([string, string] | [string, string, 'warn'])[]): string {
  return `<div class="facts">${rows.map(([k, v, w]) => `<div class="fact${w ? ' warn' : ''}"><span class="fk">${k}</span><span class="fv">${v}</span></div>`).join('')}</div>`;
}

/** 通用彈窗：所有需要玩家決定的流程都透過這裡 */
export class Dialog {
  private el: HTMLDivElement;
  private personTip: HTMLDivElement;
  private personTipSource: Element | null = null;
  private personTipTimeout = 0;
  private flight: BreakthroughFlight | null = null;
  private forge: WeaponForge | null = null;
  /** 按 Esc 時的動作；必須做出選擇的視窗為 null */
  private onEsc: (() => void) | null = null;
  /** 點擊視窗外的空白處：可以略過的視窗才會關閉（戰鬥、購買等不會） */
  private onOutside: (() => void) | null = null;
  /** 按 Enter 確認 */
  private onEnter: (() => void) | null = null;

  constructor(root: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'dialog-backdrop hidden';
    root.appendChild(this.el);
    this.personTip = document.createElement('div');
    this.personTip.className = 'tooltip dialog-person-tooltip hidden';
    document.body.appendChild(this.personTip);
    this.el.addEventListener('mousemove', e => {
      const person = (e.target as Element).closest('.core-person');
      if (person) this.showPersonTip(person, e.clientX, e.clientY);
      else this.deferPersonTip();
    });
    this.el.addEventListener('mouseleave', () => this.deferPersonTip());
    this.personTip.addEventListener('mouseenter', () => this.cancelPersonTipDelay());
    this.personTip.addEventListener('mouseleave', () => this.deferPersonTip());
    this.el.addEventListener('focusin', e => {
      const person = (e.target as Element).closest('.cultivation-person');
      if (person) this.showPersonTipFromElement(person);
    });
    this.el.addEventListener('focusout', e => {
      if ((e.target as Element).closest('.cultivation-person')) this.deferPersonTip();
    });
    this.el.addEventListener('click', e => {
      if (this.flight?.skip() || this.forge?.skip()) { e.preventDefault(); e.stopImmediatePropagation(); }
    }, true);
    this.el.addEventListener('click', (e) => {
      const person = (e.target as Element).closest('.cultivation-person');
      if (person) this.showPersonTipFromElement(person);
      if (e.target === this.el) this.onOutside?.();
    });
    window.addEventListener('keydown', (e) => {
      if (!this.isOpen) return;
      if (e.key === 'Enter' && (e.target as Element | null)?.closest?.('.cultivation-name')) return;
      if (e.key === 'Escape' && this.onEsc) {
        e.preventDefault();
        if (this.personTipSource?.classList.contains('cultivation-person')) this.hidePersonTip();
        else this.onEsc();
      } else if (e.key === 'Enter' && this.onEnter) {
        e.preventDefault();
        this.onEnter();
      }
    });
  }

  private showPersonTipFromElement(person: Element) {
    const rect = person.getBoundingClientRect();
    this.showPersonTip(person, rect.right, rect.top);
  }

  private showPersonTip(person: Element, x: number, y: number) {
    const content = person.querySelector('.core-person-tip');
    if (!content) return;
    this.cancelPersonTipDelay();
    const inspectable = person.classList.contains('cultivation-person');
    if (this.personTipSource !== person) {
      this.personTipSource = person;
      this.personTip.innerHTML = content.innerHTML;
      this.personTip.classList.toggle('breakthrough-person-tip', inspectable);
      if (inspectable) {
        const close = document.createElement('button');
        close.type = 'button';
        close.className = 'breakthrough-tip-close';
        close.textContent = '關閉';
        close.onclick = () => this.hidePersonTip();
        this.personTip.prepend(close);
      }
      this.personTip.classList.remove('hidden');
      this.personTip.scrollTop = 0;
    } else if (inspectable) return;
    const box = this.personTip.getBoundingClientRect();
    const left = x + 14 + box.width < innerWidth - 8 ? x + 14 : x - box.width - 10;
    this.personTip.style.left = `${Math.max(8, Math.min(left, innerWidth - box.width - 8))}px`;
    this.personTip.style.top = `${Math.max(8, Math.min(y + (inspectable ? 0 : 14), innerHeight - box.height - 8))}px`;
  }

  private hidePersonTip() {
    this.cancelPersonTipDelay();
    this.personTipSource = null;
    this.personTip.classList.add('hidden');
  }

  private cancelPersonTipDelay() {
    clearTimeout(this.personTipTimeout);
    this.personTipTimeout = 0;
  }

  private deferPersonTip() {
    if (!this.personTipSource || this.personTipTimeout) return;
    if (this.personTipSource.classList.contains('cultivation-person')) {
      this.personTipTimeout = window.setTimeout(() => this.hidePersonTip(), 220);
    } else this.hidePersonTip();
  }

  get isOpen() {
    return !this.el.classList.contains('hidden');
  }

  private open(title: string, text: string, icon = ''): HTMLDivElement {
    this.flight?.dispose(); this.flight = null;
    this.forge?.dispose(); this.forge = null;
    this.hidePersonTip();
    this.el.classList.remove('hidden');
    this.el.innerHTML = '';
    const card = document.createElement('div');
    card.className = 'dialog scroll-card';
    if(title==='修為圓滿') card.classList.add('breakthrough-ready-dialog');
    if (['吐納天地', '氣聚成液', '真元極縮', '破而後立', '歷練紅塵', '五行圓滿', '煉化神物', '逆天而行', '九州歸心', '破界飛升'].some(t => title.startsWith(t)) || /仙凡有別|百川匯海|大道初成|破繭成蝶|大象無形|五行歸一|神物為樞|極道承壓|四海歸心|叩問閶闔/.test(title)) {
      card.style.setProperty('--breakthrough', '1');
      card.classList.add('breakthrough-dialog');
    }
    if (/自廢修為|本命武器突破|本命武器升階|行囊已滿/.test(title)) {
      card.classList.add('breakthrough-dialog', 'equipment-decision-dialog');
      icon = '';
      if (title === '自廢修為') card.classList.add('abolish-dialog');
      else if (title === '行囊已滿') card.classList.add('capacity-dialog');
      else card.classList.add('weapon-dialog');
      if (title === '本命武器升階成功') card.classList.add('weapon-success-dialog');
    }
    if ((card.classList.contains('breakthrough-dialog') && !card.classList.contains('abolish-dialog') && !card.classList.contains('capacity-dialog')) || title === '突破失敗' || title === '修為圓滿') {
      card.classList.add('jade-dialog');
      if (title === '突破失敗') card.classList.add('jade-failure');
      icon = '';
    }
    if (card.classList.contains('abolish-dialog') || card.classList.contains('capacity-dialog')) card.classList.add('folio-note-dialog');
    const scroll = '<div class="jade-surface" aria-hidden="true"><i class="jade-scroll-paper"></i><i class="jade-scroll-left"></i><i class="jade-scroll-right"></i></div>';
    card.innerHTML = `${card.classList.contains('jade-dialog') ? scroll : ''}${icon ? `<div class="dialog-icon">${icon}</div>` : ''}<h2>${title}</h2>${text ? `<div class="dialog-text">${text.replace(/\n/g, '<br>')}</div>` : ''}`;
    this.el.appendChild(card);
    return card;
  }

  private prepareJadeDecision(card: HTMLDivElement) {
    if (!card.classList.contains('jade-dialog')) return;
    card.classList.add('jade-decision');
    const heading = card.querySelector('h2')!;
    const body = card.querySelector('.dialog-text') ?? document.createElement('div');
    body.className = 'dialog-text';
    if (!body.parentNode) card.appendChild(body);
    heading.id = 'jade-decision-title';
    heading.className = 'jade-inscription';
    const focus = body.querySelector('.jade-weapon-names, .jade-destination, .jade-core-heading, .jade-ready-names');
    const content = document.createElement('div');
    const hero = document.createElement('div');
    const detail = document.createElement('div');
    content.className = 'jade-content';
    hero.className = 'jade-hero';
    detail.className = 'jade-detail';
    hero.append(heading);
    if (focus) hero.append(focus);
    detail.append(...body.childNodes);
    content.append(hero);
    if (detail.children.length || detail.textContent?.trim()) content.append(detail);
    body.append(content);
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'true');
    card.setAttribute('aria-labelledby', heading.id);
  }

  close() {
    this.flight?.dispose(); this.flight = null;
    this.forge?.dispose(); this.forge = null;
    this.hidePersonTip();
    this.onEsc = null;
    this.onOutside = null;
    this.onEnter = null;
    this.el.classList.add('hidden');
    this.el.innerHTML = '';
  }

  private choiceButton<T>(c: Choice<T>, onClick: () => void): HTMLButtonElement {
    const b = document.createElement('button');
    b.className = 'choice';
    b.disabled = !!c.disabled;
    if (c.reason) b.title = c.reason;
    if (c.color) b.style.borderLeftColor = c.color;
    const text = `<b>${c.label}</b>${c.sub ? `<small>${c.sub}</small>` : ''}${c.disabled && c.reason ? `<small class="reason">${c.reason}</small>` : ''}`;
    if (c.icon) {
      b.classList.add('has-icon');
      b.innerHTML = `<img class="choice-icon${c.icon.includes('/generals/head/') ? ' general-portrait' : ''}" src="${c.icon}" alt="" onerror="this.style.visibility='hidden'"><span class="choice-text">${text}</span>`;
    } else b.innerHTML = text;
    b.onclick = onClick;
    return b;
  }

  /** 單選；按取消回傳 null */
  choose<T>(title: string, text: string, choices: Choice<T>[], cancel: string | null = '取消', icon = ''): Promise<T | null> {
    return new Promise((resolve) => {
      const card = this.open(title, text, icon);
      this.prepareJadeDecision(card);
      const list = document.createElement('div');
      list.className = 'choice-list';
      for (const c of choices)
        list.appendChild(
          this.choiceButton(c, () => {
            this.close();
            resolve(c.value);
          }),
        );
      card.appendChild(list);
      if (cancel) {
        this.onEsc = () => {
          this.close();
          resolve(null);
        };
        this.onOutside = this.onEsc;
        const row = document.createElement('div');
        row.className = 'dialog-buttons';
        const b = document.createElement('button');
        b.className = 'btn';
        b.textContent = cancel;
        b.onclick = () => {
          this.close();
          resolve(null);
        };
        row.appendChild(b);
        card.appendChild(row);
      }
    });
  }

  /** 多選（例如派遣三名武將） */
  pickMany<T>(title: string, text: string, choices: Choice<T>[], min: number, max: number, confirm = '確定', buttonsOnly = false): Promise<T[] | null> {
    return new Promise((resolve) => {
      const card = this.open(title, text);
      const picked = new Set<number>();
      const list = document.createElement('div');
      list.className = 'choice-list';
      const ok = document.createElement('button');
      ok.className = 'btn primary';
      const refresh = () => {
        ok.disabled = picked.size < min || picked.size > max;
        ok.textContent = `${confirm}（${picked.size}/${max}）`;
      };
      choices.forEach((c, i) => {
        const b = this.choiceButton(c, () => {
          if (picked.has(i)) picked.delete(i);
          else if (picked.size < max) picked.add(i);
          b.classList.toggle('picked', picked.has(i));
          refresh();
        });
        list.appendChild(b);
      });
      card.appendChild(list);
      const row = document.createElement('div');
      row.className = 'dialog-buttons';
      const cancel = document.createElement('button');
      cancel.className = 'btn';
      cancel.textContent = '取消';
      cancel.onclick = () => {
        this.close();
        resolve(null);
      };
      this.setDecisionShortcuts(buttonsOnly, () => cancel.click());
      ok.onclick = () => {
        this.close();
        resolve([...picked].map((i) => choices[i].value));
      };
      row.append(ok, cancel);
      card.appendChild(row);
      refresh();
    });
  }

  /** 拉條：自己決定數量（例如派遣多少士兵）；取消回傳 null */
  slider(title: string, text: string, opts: SliderOptions, icon = ''): Promise<number | null> {
    return new Promise((resolve) => {
      const { min, max, step = 100, unit = '', confirm = '確定', preview } = opts;
      const card = this.open(title, text, icon);
      const snap = (v: number) => Math.max(min, Math.min(max, v >= max ? max : Math.round(v / step) * step || min));
      let value = snap(opts.initial ?? max);
      const box = document.createElement('div');
      box.className = 'slider-box';
      box.innerHTML = `
        <div class="slider-value"></div>
        <input type="range" min="${min}" max="${max}" step="1">
        <div class="slider-range"><span>${min}${unit}</span><span>${max}${unit}</span></div>
        <div class="slider-quick"></div>
        <div class="slider-preview"></div>`;
      card.appendChild(box);
      const input = box.querySelector('input') as HTMLInputElement;
      const valueEl = box.querySelector('.slider-value') as HTMLElement;
      const previewEl = box.querySelector('.slider-preview') as HTMLElement;
      const ok = document.createElement('button');
      ok.className = 'btn primary';
      const render = () => {
        input.value = String(value);
        valueEl.innerHTML = `<b>${value}</b>${unit}`;
        previewEl.innerHTML = preview ? preview(value) : '';
        ok.textContent = `${confirm}（${value}${unit}）`;
        ok.disabled = value < min || value > max || max < min;
      };
      const set = (v: number) => {
        value = snap(v);
        render();
      };
      input.oninput = () => set(Number(input.value));
      const quick = box.querySelector('.slider-quick') as HTMLElement;
      for (const [label, ratio] of [['最少', 0], ['¼', 0.25], ['½', 0.5], ['¾', 0.75], ['全部', 1]] as const) {
        const b = document.createElement('button');
        b.className = 'btn mini';
        b.textContent = label;
        b.onclick = () => set(min + (max - min) * ratio);
        quick.appendChild(b);
      }
      for (const d of [-step, step]) {
        const b = document.createElement('button');
        b.className = 'btn mini';
        b.textContent = d > 0 ? `+${step}` : `−${step}`;
        b.onclick = () => set(value + d);
        quick.appendChild(b);
      }
      const row = document.createElement('div');
      row.className = 'dialog-buttons';
      const cancel = document.createElement('button');
      cancel.className = 'btn';
      cancel.textContent = '取消';
      cancel.onclick = () => {
        this.close();
        resolve(null);
      };
      this.setDecisionShortcuts(opts.buttonsOnly, () => cancel.click(), () => ok.click());
      ok.onclick = () => {
        this.close();
        resolve(value);
      };
      row.append(ok, cancel);
      card.appendChild(row);
      render();
    });
  }

  message(title: string, text: string, icon = '', button = '確定', weaponUpgrade?: WeaponUpgradeNotice): Promise<void> {
    return new Promise((resolve) => {
      const card = this.open(title, text, icon);
      const row = document.createElement('div');
      row.className = 'dialog-buttons';
      const b = document.createElement('button');
      b.className = 'btn primary';
      b.textContent = button;
      b.onclick = () => {
        this.close();
        resolve();
      };
      this.onEsc = () => b.click();
      this.onOutside = this.onEsc;
      this.onEnter = this.onEsc;
      row.appendChild(b);
      card.appendChild(row);
      const failed = isBreakthroughFailure(title, text);
      if (weaponUpgrade) {
        this.forge = new WeaponForge(card, b, weaponUpgrade);
        const confirmOrSkip = () => { if (!this.forge?.skip()) b.click(); };
        this.onEsc = confirmOrSkip;
        this.onEnter = confirmOrSkip;
      } else if (failed || isBreakthroughSuccessTitle(title)) {
        this.flight = new BreakthroughFlight(card, b, failed);
        const confirmOrSkip = () => { if (!this.flight?.skip()) b.click(); };
        this.onEsc = confirmOrSkip;
        this.onEnter = confirmOrSkip;
      } else if (text.includes('class="jade-hint"')) {
        this.prepareJadeDecision(card);
      }
    });
  }

  private setDecisionShortcuts(buttonsOnly: boolean | undefined, cancel: () => void, confirm: (() => void) | null = null) {
    this.onEsc = buttonsOnly ? () => {} : cancel;
    this.onOutside = buttonsOnly ? null : cancel;
    this.onEnter = buttonsOnly ? null : confirm;
  }

  confirm(title: string, text: string, yes = '確定', no = '取消', icon = '', buttonsOnly = false): Promise<boolean> {
    return new Promise((resolve) => {
      const card = this.open(title, text, icon);
      this.prepareJadeDecision(card);
      const row = document.createElement('div');
      row.className = 'dialog-buttons';
      const y = document.createElement('button');
      y.className = 'btn primary';
      y.textContent = yes;
      y.onclick = () => {
        this.close();
        resolve(true);
      };
      const n = document.createElement('button');
      n.className = 'btn';
      n.textContent = no;
      n.onclick = () => {
        this.close();
        resolve(false);
      };
      this.setDecisionShortcuts(buttonsOnly, () => n.click(), () => y.click());
      if (title === '行囊已滿') { this.onEsc = null; this.onOutside = null; }
      row.append(y, n);
      card.appendChild(row);
    });
  }

  /** 自訂內容；呼叫 done 關閉 */
  custom<T>(title: string, build: (body: HTMLDivElement, done: (v: T) => void) => void, wide = false, onEscape?: () => T): Promise<T> {
    return new Promise((resolve) => {
      const card = this.open(title, '');
      card.classList.toggle('wide', wide);
      const body = document.createElement('div');
      body.className = 'dialog-body';
      card.appendChild(body);
      build(body, (v) => {
        this.close();
        resolve(v);
      });
      if (onEscape) {
        this.onEsc = () => {
          this.close();
          resolve(onEscape());
        };
      }
    });
  }
}
