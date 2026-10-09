import './style.css';
import { Game } from './game/Game';
import { LORD_IDS } from './faction/Faction';
import type { LordId } from './game/types';

// 圖片一律不可拖曳、不可右鍵（含之後動態加入的圖片）
for (const type of ['contextmenu', 'dragstart'] as const)
  document.addEventListener(type, (e) => {
    if (e.target instanceof HTMLImageElement) e.preventDefault();
  });

const game = new Game(document.getElementById('app')!, document.getElementById('ui')!);

// ?lord=liu 可跳過選擇畫面直接開始
const quick = new URLSearchParams(location.search).get('lord') as LordId | null;
const roundsParam = new URLSearchParams(location.search).get('rounds');
const rounds = roundsParam === 'endless' ? null : roundsParam ? Number(roundsParam) : undefined;
if (quick && LORD_IDS.includes(quick)) game.start(quick, rounds);
else game.showStart();

// 開發模式下方便除錯
if (import.meta.env.DEV) (window as unknown as { game: Game }).game = game;
