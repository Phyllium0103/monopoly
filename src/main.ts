import './style.css';
import { Game } from './game/Game';
import { LORD_IDS } from './faction/Faction';
import type { LordId } from './game/types';
import { installArtViewer } from './ui/ArtViewer';
import { multiplayerAvailable } from './net/supabase';
import { OnlineSession } from './net/OnlineSession';

// 圖片一律不可拖曳、不可右鍵（含之後動態加入的圖片）
for (const type of ['contextmenu', 'dragstart'] as const)
  document.addEventListener(type, (e) => {
    if (e.target instanceof HTMLImageElement) e.preventDefault();
  });

installArtViewer();

const uiRoot = document.getElementById('ui')!;
const game = new Game(document.getElementById('app')!, uiRoot);

// 多人模式：有設定 Supabase 才開啟
const online = multiplayerAvailable() ? new OnlineSession(uiRoot, game, () => game.showStart()) : null;
if (online) game.onMultiplayer = () => void online.open();

// ?lord=liu 可跳過選擇畫面直接開始
const quick = new URLSearchParams(location.search).get('lord') as LordId | null;
const roundsParam = new URLSearchParams(location.search).get('rounds');
const rounds = roundsParam === 'endless' ? null : roundsParam ? Number(roundsParam) : undefined;
if (quick && LORD_IDS.includes(quick)) game.start(quick, rounds);
// 重新整理前在多人房間裡：直接回到房間
else if (online && OnlineSession.hasSavedRoom()) void online.open();
else game.showStart();

// 開發模式下方便除錯
if (import.meta.env.DEV) Object.assign(window as unknown as Record<string, unknown>, { game, online });
