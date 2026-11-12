import { ITEM_DEFS, PILL_GRADES } from '../data/items';
import { requirementText } from '../systems/ItemSystem';
import { itemIconUrl } from './Icons';
import './item-detail.css';

export const detailEscape = (s:string) => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
export function emphasizeTechnique(html:string):string {
  const lines=html.split(/<br\s*\/?>/i);
  if(lines.length>1)lines[1]=`<span class="equipment-main-bonus">${lines[1]}</span>`;
  return lines.join('<br>');
}
export function detailCard(name:string, category:string, icon:string, content:string, footer=''):string {
  return `<article class="item-detail-card"><header><img src="${detailEscape(icon)}" alt=""><div><small>${detailEscape(category)}</small><h3>${detailEscape(name)}</h3></div></header><section>${content}</section>${footer?`<footer>${detailEscape(footer)}</footer>`:''}</article>`;
}
export function itemDetail(defId:string,tier:number,footer='',count=1):string {
  const d=ITEM_DEFS[defId];
  const requirement=requirementText({defId,tier} as import('../game/types').Item);
  return detailCard(d.name+(count>1?' ×'+count:''),`${d.category}${d.price.length>1?' · '+PILL_GRADES[tier]:''}`,itemIconUrl(defId),`<p>${detailEscape(d.desc(tier))}</p><div class="item-detail-requirement">${detailEscape(requirement)}</div>`,footer);
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
