import {uiViewportSize} from './UiViewport';
/** 提示泡泡：取代瀏覽器內建的 title 提示（出現太慢、字太小）。任何有 title 或 data-tip 的元素，滑過就立刻顯示 */
const bubble = document.createElement('div');
bubble.className = 'bubble hidden';
(document.getElementById('ui')??document.body).appendChild(bubble);

let current: HTMLElement | null = null;

const tipOf = (el: HTMLElement): string => {
  // 把 title 搬到 data-tip，避免瀏覽器同時跳出內建提示
  const title = el.getAttribute('title');
  if (title) {
    el.dataset.tip = title;
    el.removeAttribute('title');
  }
  return el.dataset.tip ?? el.dataset.tipHtml ?? '';
};

function place(x: number, y: number) {
  const {scale,width,height}=uiViewportSize();x/=scale;y/=scale;
  const pad = 14;
  const w = bubble.offsetWidth;
  const h = bubble.offsetHeight;
  let left = x + pad;
  let top = y + pad + 6;
  if (left + w > width - 8) left = Math.max(8, x - w - pad);
  if (top + h > height - 8) top = Math.max(8, y - h - pad);
  bubble.style.left = `${left}px`;
  bubble.style.top = `${top}px`;
}

function hide() {
  current = null;
  bubble.classList.add('hidden');
}

document.addEventListener('mouseover', (e) => {
  const el = (e.target as HTMLElement).closest?.<HTMLElement>('[title], [data-tip], [data-tip-html]');
  if (!el || el === current) return;
  const text = tipOf(el);
  if (!text) return hide();
  current = el;
  // 有表格版就用表格；否則「｜」分隔的各項改成換行，一行一項
  if (el.dataset.tipHtml) bubble.innerHTML = el.dataset.tipHtml;
  else bubble.textContent = text.replace(/\s*[｜|]\s*/g, '\n');
  bubble.classList.remove('hidden');
  place(e.clientX, e.clientY);
});

document.addEventListener('mousemove', (e) => {
  if (!current) return;
  // 元素已被重新整理掉，或滑鼠離開了
  if (!current.isConnected || !current.contains(e.target as Node)) return hide();
  place(e.clientX, e.clientY);
});

document.addEventListener('mouseleave', hide);
document.addEventListener('focusin', (e) => {
  const el = (e.target as HTMLElement).closest?.<HTMLElement>('.technique-picture[data-tip]');
  if (!el) return;
  current = el;
  const content = el.dataset.tipHtml || tipOf(el);
  if (!content.trim()) return hide();
  if (el.dataset.tipHtml) bubble.innerHTML = content; else bubble.textContent = content;
  bubble.classList.remove('hidden');
  const rect = el.getBoundingClientRect();
  place(rect.left, rect.bottom);
});
document.addEventListener('focusout', (e) => {
  if ((e.target as HTMLElement).matches?.('.technique-picture')) hide();
});
window.addEventListener('blur', hide);
window.addEventListener('wheel', hide, { passive: true });
