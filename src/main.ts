import './style.css';
import { Game } from './game/Game';
import { LORD_IDS } from './faction/Faction';
import type { LordId } from './game/types';

const game = new Game(document.getElementById('app')!, document.getElementById('ui')!);

// ?lord=liu 可跳過選擇畫面直接開始
const quick = new URLSearchParams(location.search).get('lord') as LordId | null;
if (quick && LORD_IDS.includes(quick)) game.start(quick);
else game.showStart();

// 開發模式下方便除錯
if (import.meta.env.DEV) (window as unknown as { game: Game }).game = game;
