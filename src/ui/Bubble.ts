/** 提示泡泡：取代瀏覽器內建的 title 提示（出現太慢、字太小）。任何有 title 或 data-tip 的元素，滑過就立刻顯示 */
const bubble = document.createElement('div');
bubble.className = 'bubble hidden';
document.body.appendChild(bubble);

let current: HTMLElement | null = null;

const tipOf = (el: HTMLElement): string => {
  // 把 title 搬到 data-tip，避免瀏覽器同時跳出內建提示
  const title = el.getAttribute('title');
  if (title) {
    el.dataset.tip = title;
    el.removeAttribute('title');
  }
  return el.dataset.tip ?? '';
};

function place(x: number, y: number) {
  const pad = 14;
  const w = bubble.offsetWidth;
  const h = bubble.offsetHeight;
  let left = x + pad;
  let top = y + pad + 6;
  if (left + w > window.innerWidth - 8) left = Math.max(8, x - w - pad);
  if (top + h > window.innerHeight - 8) top = Math.max(8, y - h - pad);
  bubble.style.left = `${left}px`;
  bubble.style.top = `${top}px`;
}

function hide() {
  current = null;
  bubble.classList.add('hidden');
}

document.addEventListener('mouseover', (e) => {
  const el = (e.target as HTMLElement).closest?.<HTMLElement>('[title], [data-tip]');
  if (!el || el === current) return;
  const text = tipOf(el);
  if (!text) return hide();
  current = el;
  // 「｜」分隔的各項改成換行，一行一項
  bubble.textContent = text.replace(/\s*[｜|]\s*/g, '\n');
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
window.addEventListener('blur', hide);
window.addEventListener('wheel', hide, { passive: true });
