const KEY = 'bgm-volume';
const DEFAULT_VOLUME = 0.3;

/** 背景音樂：循環播放，音量存在瀏覽器；瀏覽器要求先有操作才能出聲，所以第一次點擊或按鍵時才開始 */
const audio = new Audio(`${import.meta.env.BASE_URL}audio/bgm.mp3`);
audio.loop = true;

function load(): number {
  try {
    const v = parseFloat(localStorage.getItem(KEY) ?? '');
    if (v >= 0 && v <= 1) return v;
  } catch {
    /* 無法讀取就用預設 */
  }
  return DEFAULT_VOLUME;
}

audio.volume = load();

export const music = {
  get volume() {
    return audio.volume;
  },
  setVolume(v: number) {
    audio.volume = Math.max(0, Math.min(1, v));
    try {
      localStorage.setItem(KEY, String(audio.volume));
    } catch {
      /* 忽略 */
    }
  },
};

const unlock = () => {
  void audio.play().catch(() => {});
  window.removeEventListener('pointerdown', unlock);
  window.removeEventListener('keydown', unlock);
};
window.addEventListener('pointerdown', unlock);
window.addEventListener('keydown', unlock);
