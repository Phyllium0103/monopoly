/** Only explicitly marked roster artwork opens the viewer; action portraits stay clickable. */
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
      if (!(img instanceof HTMLImageElement)) return;
      // Party and item-target portraits belong to their action buttons, including extra rows.
      if (img.closest('.pd-gen, .item-dock')) return;
      const fullUrl = img.dataset.fullArt;
      if (!fullUrl) return;
      e.stopPropagation();
      e.preventDefault();
      overlay = document.createElement('div');
      overlay.className = 'art-viewer';
      const full = document.createElement('img');
      full.src = fullUrl;
      full.alt = img.alt;
      overlay.appendChild(full);
      (document.getElementById('ui')??document.body).appendChild(overlay);
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
