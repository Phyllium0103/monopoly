/** 點武將頭像時放大顯示全身圖；點任意處或按 Esc 關閉。 */
export function installArtViewer() {
  let overlay: HTMLDivElement | null = null;
  const close = () => {
    overlay?.remove();
    overlay = null;
  };
  // 捕獲階段攔截，點頭像只看圖，不會同時觸發所在按鈕（選將、招募等）
  document.addEventListener(
    'click',
    (e) => {
      if (overlay) {
        e.stopPropagation();
        e.preventDefault();
        close();
        return;
      }
      const img = e.target;
      if (!(img instanceof HTMLImageElement) || !img.src.includes('/art/generals/head/')) return;
      e.stopPropagation();
      e.preventDefault();
      overlay = document.createElement('div');
      overlay.className = 'art-viewer';
      const full = document.createElement('img');
      full.src = img.src.replace('/generals/head/', '/generals/base/').replace(/\.webp$/, '.png');
      full.alt = img.alt;
      overlay.appendChild(full);
      document.body.appendChild(overlay);
    },
    true,
  );
  // 先於彈窗處理 Esc，只關閉看圖
  window.addEventListener(
    'keydown',
    (e) => {
      if (!overlay || e.key !== 'Escape') return;
      e.stopImmediatePropagation();
      e.preventDefault();
      close();
    },
    true,
  );
}
