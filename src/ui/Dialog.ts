export interface Choice<T> {
  label: string;
  sub?: string;
  value: T;
  disabled?: boolean;
  /** 無法選擇的原因 */
  reason?: string;
  color?: string;
}

export interface SliderOptions {
  min: number;
  max: number;
  step?: number;
  initial?: number;
  unit?: string;
  confirm?: string;
  /** 依目前數值顯示的說明（可含 HTML） */
  preview?: (value: number) => string;
}

/** 通用彈窗：所有需要玩家決定的流程都透過這裡 */
export class Dialog {
  private el: HTMLDivElement;

  constructor(root: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'dialog-backdrop hidden';
    root.appendChild(this.el);
  }

  get isOpen() {
    return !this.el.classList.contains('hidden');
  }

  private open(title: string, text: string, icon = ''): HTMLDivElement {
    this.el.classList.remove('hidden');
    this.el.innerHTML = '';
    const card = document.createElement('div');
    card.className = 'dialog scroll-card';
    card.innerHTML = `${icon ? `<div class="dialog-icon">${icon}</div>` : ''}<h2>${title}</h2>${text ? `<p class="dialog-text">${text.replace(/\n/g, '<br>')}</p>` : ''}`;
    this.el.appendChild(card);
    return card;
  }

  close() {
    this.el.classList.add('hidden');
    this.el.innerHTML = '';
  }

  private choiceButton<T>(c: Choice<T>, onClick: () => void): HTMLButtonElement {
    const b = document.createElement('button');
    b.className = 'choice';
    b.disabled = !!c.disabled;
    if (c.color) b.style.borderLeftColor = c.color;
    b.innerHTML = `<b>${c.label}</b>${c.sub ? `<small>${c.sub}</small>` : ''}${c.disabled && c.reason ? `<small class="reason">${c.reason}</small>` : ''}`;
    b.onclick = onClick;
    return b;
  }

  /** 單選；按取消回傳 null */
  choose<T>(title: string, text: string, choices: Choice<T>[], cancel: string | null = '取消', icon = ''): Promise<T | null> {
    return new Promise((resolve) => {
      const card = this.open(title, text, icon);
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
  pickMany<T>(title: string, text: string, choices: Choice<T>[], min: number, max: number, confirm = '確定'): Promise<T[] | null> {
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
      ok.onclick = () => {
        this.close();
        resolve(value);
      };
      row.append(ok, cancel);
      card.appendChild(row);
      render();
    });
  }

  message(title: string, text: string, icon = '', button = '確定'): Promise<void> {
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
      row.appendChild(b);
      card.appendChild(row);
    });
  }

  confirm(title: string, text: string, yes = '確定', no = '取消', icon = ''): Promise<boolean> {
    return new Promise((resolve) => {
      const card = this.open(title, text, icon);
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
      row.append(y, n);
      card.appendChild(row);
    });
  }

  /** 自訂內容；呼叫 done 關閉 */
  custom<T>(title: string, build: (body: HTMLDivElement, done: (v: T) => void) => void, wide = false): Promise<T> {
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
    });
  }
}
