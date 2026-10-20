import { RELIC_CELLS, RELIC_EVENTS } from '../systems/RelicSystem';
import type { LordId } from '../game/types';
import { LORDS } from '../faction/Faction';

/** The actual inner board remains open while a journey spans several world turns. */
export class RelicMap {
  private panel=document.createElement('section');
  private title=document.createElement('h2');
  private progress=document.createElement('p');
  private result=document.createElement('p');
  private board=document.createElement('div');
  private roll=document.createElement('button');
  private tiles:HTMLDivElement[]=[];
  private lord:LordId|null=null;
  constructor(onRoll:()=>void){
    this.panel.className='relic-map';this.panel.hidden=true;this.panel.setAttribute('aria-label','山河社稷圖5×5試煉地圖');
    const close=document.createElement('button');close.textContent='收起地圖';close.onclick=()=>{this.panel.hidden=true;};close.className='relic-close';
    this.board.className='relic-board';this.board.setAttribute('role','grid');this.board.setAttribute('aria-label','5×5空心方形，外圈16格，中央3×3無道路');
    for(let i=0;i<16;i++){
      const tile=document.createElement('div');tile.className='relic-cell';tile.style.gridColumn=String(RELIC_CELLS[i][0]+1);tile.style.gridRow=String(RELIC_CELLS[i][1]+1);
      const e=RELIC_EVENTS[i];tile.textContent=`${e.icon}\n${e.name}`;tile.title=`吉：${e.good}；凶：${e.bad}；吉運 ${Math.round(e.chance*100)}%`;tile.setAttribute('role','gridcell');tile.setAttribute('aria-label',`${i+1} ${e.name}：${tile.title}`);
      this.tiles.push(tile);this.board.append(tile);
    }
    const center=document.createElement('div');center.className='relic-center';center.innerHTML='<b>山河社稷圖</b><span>順時針走滿一圈<br>每格必有吉凶<br>圖內禁止道具</span>';
    this.board.append(center);this.roll.textContent='擲骰前進';this.roll.onclick=onRoll;this.roll.className='relic-roll';
    this.result.className='relic-result';this.panel.append(close,this.title,this.progress,this.board,this.result,this.roll);(document.getElementById('ui')??document.body).append(this.panel);
  }
  show(lord:LordId,step:number,text:string){
    this.lord=lord;this.panel.hidden=false;this.title.textContent=`${LORDS[lord].name}・山河試煉`;
    this.progress.textContent=`已行 ${step} / 16 格 · 返回原入口需完成一圈`;
    this.result.textContent=text;this.tiles.forEach((tile,i)=>{tile.classList.toggle('occupied',i===step%16);tile.classList.toggle('visited',i>0&&i<=step);tile.style.setProperty('--lord-color',LORDS[lord].css);});
    this.panel.dataset.steps=String(step);this.panel.dataset.lord=lord;
  }
  hide(){this.panel.hidden=true;this.lord=null;}
  setReady(me:LordId,ready:boolean){this.roll.disabled=!ready||this.lord!==me;this.roll.textContent=this.roll.disabled?'等待此主公下回合':'擲骰前進';}
}
