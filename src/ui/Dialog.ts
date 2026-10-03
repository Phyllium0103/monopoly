export interface Choice<T> {
  label: string;
  sub?: string;
  value: T;
  disabled?: boolean;
  /** 無法選擇的原因 */
  reason?: string;
  color?: string;
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
