import type { EventInstance } from '../game/EventManager';

/** 事件彈窗：顯示事件、讓玩家選擇，再顯示結果 */
export class EventModal {
  private el: HTMLDivElement;

  constructor(root: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'modal-backdrop hidden';
    root.appendChild(this.el);
  }

  show(ev: EventInstance): Promise<string> {
    return new Promise((resolve) => {
      this.render(ev.icon, ev.title, ev.text, ev.choices.map((c) => c.label), (i) => {
        const result = ev.choices[i].resolve();
        if (!result) {
          this.hide();
          resolve('');
          return;
        }
        this.render(ev.icon, ev.title, result, ['確定'], () => {
          this.hide();
          resolve(result);
        });
      });
    });
  }

  /** 簡單訊息 */
  message(icon: string, title: string, text: string, button = '確定'): Promise<void> {
    return new Promise((resolve) => {
      this.render(icon, title, text, [button], () => {
        this.hide();
        resolve();
      });
    });
  }

  private render(icon: string, title: string, text: string, buttons: string[], onPick: (i: number) => void) {
    this.el.classList.remove('hidden');
    this.el.innerHTML = '';
    const card = document.createElement('div');
    card.className = 'modal scroll-card';
    card.innerHTML = `<div class="modal-icon">${icon}</div><h2>${title}</h2><p>${text.replace(/\n/g, '<br>')}</p>`;
    const row = document.createElement('div');
    row.className = 'modal-buttons';
    buttons.forEach((label, i) => {
      const b = document.createElement('button');
      b.className = i === 0 ? 'btn primary' : 'btn';
      b.textContent = label;
      b.onclick = () => onPick(i);
      row.appendChild(b);
    });
    card.appendChild(row);
    this.el.appendChild(card);
  }

  hide() {
    this.el.classList.add('hidden');
  }
}
