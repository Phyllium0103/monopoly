const DEFAULT_VOLUME = 0;
/** 原始音量太大，實際播放時先乘 50%，滑桿的 100% 就是原始音量的一半 */
const BASE_GAIN = 0.5;

/** 背景音樂：每次進入預設靜音，玩家可在本次遊戲中調整音量。 */
const audio = new Audio(`${import.meta.env.BASE_URL}audio/bgm.mp3`);
audio.loop = true;
audio.preload = 'none';

let level = DEFAULT_VOLUME;
audio.volume = level * BASE_GAIN;

export const music = {
  get volume() {
    return level;
  },
  setVolume(v: number) {
    level = Math.max(0, Math.min(1, v));
    audio.volume = level * BASE_GAIN;
  },
};

const unlock = () => {
  void audio.play().catch(() => {});
  window.removeEventListener('pointerdown', unlock);
  window.removeEventListener('keydown', unlock);
};
window.addEventListener('pointerdown', unlock);
window.addEventListener('keydown', unlock);
