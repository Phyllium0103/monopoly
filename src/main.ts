import './style.css';
import {loadingScreen} from './ui/LoadingScreen';
import type {LordId} from './game/types';
async function boot(){
 loadingScreen.show();
 try{
  const [{Game},{LORD_IDS},{installArtViewer}]=await Promise.all([import('./game/Game'),import('./faction/Faction'),import('./ui/ArtViewer')]);
  loadingScreen.set(5,'準備地圖資源');installArtViewer();
  for(const type of ['contextmenu','dragstart'] as const)document.addEventListener(type,e=>{if(e.target instanceof HTMLImageElement)e.preventDefault();});
  const uiRoot=document.getElementById('ui')!,game=new Game(document.getElementById('app')!,uiRoot);
  const network=Promise.all([import('./net/supabase'),import('./net/OnlineSession')]);
  await game.prepare((value,label)=>loadingScreen.set(value,label));
  const [{multiplayerAvailable},{OnlineSession}]=await network;
  let online:import('./net/OnlineSession').OnlineSession|null=null;
  if(multiplayerAvailable()){online=new OnlineSession(uiRoot,game,()=>game.showStart());game.onMultiplayer=()=>void online!.open();}
  if(import.meta.env.DEV)Object.assign(window,{game,online});
  loadingScreen.set(98,'完成遊戲準備');await loadingScreen.finish();
  const quick=new URLSearchParams(location.search).get('lord') as LordId|null;
  const roundsParam=new URLSearchParams(location.search).get('rounds');
  const rounds=roundsParam==='endless'?null:roundsParam?Number(roundsParam):undefined;
  if(quick&&LORD_IDS.includes(quick))game.start(quick,rounds);
  else if(online&&OnlineSession.hasSavedRoom())void online.open();
  else game.showStart();
 }catch(error){loadingScreen.fail(error,()=>location.reload());}
}
void boot();
