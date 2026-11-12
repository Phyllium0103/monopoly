import { ITEM_DEFS, PILL_GRADES, STAT_NAMES } from '../data/items';
import { itemIconUrl } from './Icons';
import './item-detail.css';

export const detailEscape = (s:string) => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
export function detailCard(name:string, category:string, icon:string, content:string, footer=''):string {
  return `<article class="item-detail-card"><header><img src="${detailEscape(icon)}" alt=""><div><small>${detailEscape(category)}</small><h3>${detailEscape(name)}</h3></div></header><section>${content}</section>${footer?`<footer>${detailEscape(footer)}</footer>`:''}</article>`;
}
export function itemDetail(defId:string,tier:number,footer=''):string {
  const d=ITEM_DEFS[defId],t=Math.min(tier,d.min.length-1);
  const timing={preroll:'擲骰前',battle:'戰鬥中',both:'平時與戰鬥',event:'事件觸發'};
  const effect=detailEscape(d.desc(tier)).replace(/(\d+(?:\.\d+)?%?)/g,'<b>$1</b>');
  return detailCard(d.name,`${d.category}${d.price.length>1?' · '+PILL_GRADES[tier]:''}`,itemIconUrl(defId),`<h4>道具效果</h4><p>${effect}</p><dl>${d.noUser?'<div><dt>使用方式</dt><dd>事件直接使用</dd></div>':`<div><dt>${STAT_NAMES[d.stat]}門檻</dt><dd>≥ ${d.min[t]}</dd></div><div><dt>消耗體力</dt><dd>${d.stamina[t]}</dd></div>`}<div><dt>使用時機</dt><dd>${timing[d.timing]}</dd></div></dl>`,footer);
}

let installed=false;
/** A body-level panel avoids clipping by shelves, scroll containers and scaled HUDs. */
export function enableItemDetails() {
  if(installed)return;installed=true;
  const panel=document.createElement('div');panel.className='item-detail-popover';panel.hidden=true;panel.setAttribute('role','tooltip');panel.id='item-detail-popover';document.body.append(panel);
  let target:HTMLElement|null=null;
  const hide=()=>{target?.removeAttribute('aria-describedby');target=null;panel.hidden=true;};
  const show=(element:HTMLElement)=>{
    target?.removeAttribute('aria-describedby');target=element;panel.innerHTML=element.dataset.itemDetail!;panel.hidden=false;element.setAttribute('aria-describedby',panel.id);
    const rect=element.getBoundingClientRect(),width=panel.offsetWidth,height=panel.offsetHeight;
    panel.style.left=Math.max(8,Math.min(rect.right+12,innerWidth-width-8))+'px';
    panel.style.top=Math.max(8,Math.min(rect.top-height-10,innerHeight-height-8))+'px';
  };
  for(const type of ['pointerover','focusin']) document.addEventListener(type,e=>{const el=(e.target as HTMLElement).closest<HTMLElement>('[data-item-detail]');if(el&&el!==target)show(el);});
  document.addEventListener('pointerout',e=>{if(target&&!target.contains(e.relatedTarget as Node))hide();});
  document.addEventListener('focusout',hide);
  document.addEventListener('scroll',hide,true);window.addEventListener('resize',hide);
  document.addEventListener('keydown',e=>{if(e.key==='Escape')hide();});
  document.addEventListener('click',e=>{if(!(e.target as HTMLElement).closest('[data-item-detail]'))hide();else if(target&&!target.isConnected)hide();});
  new MutationObserver(()=>{if(target&&!target.isConnected)hide();}).observe(document.body,{childList:true,subtree:true});
}
