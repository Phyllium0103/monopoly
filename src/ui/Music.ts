const KEY = 'bgm-volume';
const DEFAULT_VOLUME = 0.3;
/** 原始音量太大，實際播放時先乘 50%，滑桿的 100% 就是原始音量的一半 */
const BASE_GAIN = 0.5;

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

let level = load();
audio.volume = level * BASE_GAIN;

export const music = {
  get volume() {
    return level;
  },
  setVolume(v: number) {
    level = Math.max(0, Math.min(1, v));
    audio.volume = level * BASE_GAIN;
    try {
      localStorage.setItem(KEY, String(level));
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
