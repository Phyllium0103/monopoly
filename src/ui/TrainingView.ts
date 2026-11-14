import type { General, Lord } from '../game/types';
import type { TrainingVisit, TrainingAssignment } from '../systems/TrainingSystem';
import { ACADEMY_NAMES, TRAINING_COURSES, TRAINING_STAT_NAMES } from '../systems/TrainingSystem';
import { fmtStones } from '../game/Currency';
import { generalHeadUrl, rosterArtUrl } from '../data/generalArt';
import { assetUrl } from '../data/assetUrl';
import type { Dialog } from './Dialog';
import './training.css';
import './shop-wallet.css';

type Action={type:'leave'}|{type:'train-batch';assignments:TrainingAssignment[]};
type Phase='assign'|'result';
const esc=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export class TrainingPanel {
 private session:{body:HTMLElement;done:()=>void;resolve:((a:Action)=>void)|null;lord:Lord;visit:TrainingVisit;generals:General[];phase:Phase}|null=null;
 private assignments=new Map<string,string>();
 private selectedCourse='';private timer=0;
 private sortKey='name';private sortReverse=false;
 constructor(private dialog:Dialog){window.addEventListener('keydown',e=>{if(e.key!=='Escape'||!this.session)return;e.preventDefault();e.stopImmediatePropagation();if(this.session.phase==='assign')this.act({type:'leave'});},true);}
 close(){window.clearTimeout(this.timer);const s=this.session;this.session=null;s?.done();}
 ask(lord:Lord,visit:TrainingVisit,generals:General[],phase:Phase):Promise<Action>{
  return new Promise(resolve=>{
   if(this.session&&this.session.visit.kind===visit.kind){Object.assign(this.session,{lord,visit,generals,phase,resolve});this.render();return;}
   this.close();this.assignments.clear();this.selectedCourse='';this.sortKey='name';this.sortReverse=false;
   void this.dialog.custom<void>(ACADEMY_NAMES[visit.kind],(body,done)=>{this.session={body,done,resolve,lord,visit,generals,phase};this.render();},true);
  });
 }
 private act(a:Action){const s=this.session;if(!s?.resolve)return;const resolve=s.resolve;s.resolve=null;if(a.type==='leave')this.close();resolve(a);}
 private render(){
  const s=this.session;if(!s)return;const{body,lord,visit,generals}=s;
  const card=body.closest<HTMLElement>('.dialog')!;card.classList.add('training-window');card.dataset.academy=visit.kind;card.style.setProperty('--academy-scene',`url("${assetUrl('art/shops/scenes/'+visit.kind+'.webp')}")`);
  if(s.phase==='result'){this.results();return;}
  const courses=TRAINING_COURSES[visit.kind];
  const total=[...this.assignments.keys()].reduce((n,id)=>n+courses.find(c=>c.id===id)!.price,0);
  const stats=visit.kind==='martial'?['force','defense','hp'] as const:['alchemy','forging','talisman','formation'] as const;
  const ordered=[...generals].sort((a,b)=>{
   const compare=this.sortKey==='name'?a.name.localeCompare(b.name,'zh-Hant-u-co-stroke'):this.sortKey==='course'?(courses.findIndex(c=>this.assignments.get(c.id)===a.id)+1||99)-(courses.findIndex(c=>this.assignments.get(c.id)===b.id)+1||99):b.base[this.sortKey as keyof General['base']]-a.base[this.sortKey as keyof General['base']];
   return (this.sortReverse?-1:1)*compare||generals.indexOf(a)-generals.indexOf(b);
  });
  body.innerHTML=`<header class="academy-intro shop-wallet"><span>持有靈石</span><b>${fmtStones(lord.stones)}</b></header><section class="academy-courses" aria-label="修練項目">${courses.map(c=>{const assigned=generals.find(g=>g.id===this.assignments.get(c.id));return`<button class="academy-course${c.id===this.selectedCourse?' selected':''}${assigned?' assigned':''}" data-course="${c.id}"><strong>${c.name}</strong><span>${c.gains.map(g=>TRAINING_STAT_NAMES[g.stat]+' ＋'+g.min+'～'+g.max).join('、')}</span><b>${fmtStones(c.price)}</b><small>${assigned?'授予 '+assigned.name:'尚未分配'}</small></button>`;}).join('')}</section><section class="academy-roster" aria-label="分配修練武將"><div class="academy-stat-head"><button data-sort="name">姓名</button>${stats.map(k=>'<button data-sort="'+k+'">'+TRAINING_STAT_NAMES[k]+'</button>').join('')}<button data-sort="course">修練</button></div><div class="academy-generals">${ordered.map(g=>{const entry=[...this.assignments].find(([,id])=>id===g.id),course=courses.find(c=>c.id===entry?.[0]);return`<button class="academy-general${course?' assigned':''}" data-general="${g.id}"><span><img src="${generalHeadUrl(g)}" alt=""><b>${g.name}</b></span>${stats.map(k=>'<span>'+g.base[k]+'</span>').join('')}<small>${course?.name??'—'}</small></button>`;}).join('')||'<p>目前無可修練武將</p>'}</div></section><footer class="academy-actions"><p>已分配 ${this.assignments.size}／5 項　合計 ${fmtStones(total)}${total>lord.stones?'・靈石不足':''}</p><button class="btn primary academy-train">一起修練並離開</button><button class="btn academy-leave">離開</button></footer>`;
  const columns=`minmax(76px,1.25fr) repeat(${stats.length},minmax(28px,.7fr)) minmax(61px,1fr)`;
  body.querySelector('.academy-wallet')?.remove();
  body.querySelector('.shop-wallet b')!.textContent=fmtStones(Math.max(0,lord.stones-total));
  body.querySelector('.academy-actions>p')?.remove();
  this.keeper(body,visit.kind);
  body.querySelector<HTMLElement>('.academy-stat-head')!.style.gridTemplateColumns=columns;
  body.querySelectorAll<HTMLElement>('.academy-general').forEach(el=>el.style.gridTemplateColumns=columns);
  body.querySelectorAll<HTMLButtonElement>('[data-sort]').forEach(el=>{el.setAttribute('aria-label',el.textContent+'排序');if(el.dataset.sort===this.sortKey){el.textContent+=' '+(this.sortReverse?'↑':'↓');el.setAttribute('aria-pressed','true');}el.onclick=()=>{if(this.sortKey===el.dataset.sort)this.sortReverse=!this.sortReverse;else {this.sortKey=el.dataset.sort!;this.sortReverse=false;}this.render();};});
  body.querySelectorAll<HTMLButtonElement>('[data-course]').forEach(el=>el.onclick=()=>{this.selectedCourse=el.dataset.course!;this.render();});
  body.querySelectorAll<HTMLButtonElement>('[data-general]').forEach(el=>el.onclick=()=>{
   if(!this.selectedCourse)return;const id=el.dataset.general!;const before=new Map(this.assignments);
   if(this.assignments.get(this.selectedCourse)===id)this.assignments.delete(this.selectedCourse);
   else {for(const[course,general]of this.assignments)if(general===id)this.assignments.delete(course);this.assignments.set(this.selectedCourse,id);}
   const reserved=[...this.assignments.keys()].reduce((n,k)=>n+courses.find(c=>c.id===k)!.price,0);
   if(reserved>lord.stones){this.assignments=before;const note=body.querySelector<HTMLElement>('.academy-keeper-speech')!;note.hidden=false;note.textContent='靈石不足，先取下一個項目，或選擇較低費用的修練。';return;}
   const scroll=body.querySelector('.academy-generals')!.scrollTop;this.render();body.querySelector('.academy-generals')!.scrollTop=scroll;
  });
  const train=body.querySelector<HTMLButtonElement>('.academy-train')!;train.disabled=!this.assignments.size||total>lord.stones||!s.resolve;
  train.textContent='修練';
  train.onclick=()=>{body.querySelectorAll<HTMLButtonElement>('button').forEach(b=>b.disabled=true);this.act({type:'train-batch',assignments:[...this.assignments].map(([courseId,generalId])=>({courseId,generalId}))});};
  body.querySelector<HTMLButtonElement>('.academy-leave')!.onclick=()=>this.act({type:'leave'});
 }
 private keeper(body:HTMLElement,kind:'martial'|'arts'){
  const name=kind==='martial'?'鐵骨教頭':'墨蘅仙子';
  const lines=kind==='martial'?['筋骨要穩，氣息要長。主公先替將士選好今日的修練。','一招一式，皆從根基練起。適合自己的，比貪多更好。','把項目交給武將，費用會先預留；取下或離開，靈石便會退回。']:['丹、器、符、陣，各有心法。先替有緣的將士定下修練。','四藝相通，貴在凝神；慢慢挑，莫急著下筆。','分配後的費用會先預留，尚未修練便離開，不收靈石。'];
  const keeper=document.createElement('aside');keeper.className='academy-keeper';keeper.innerHTML=`<button class="academy-keeper-talk" aria-label="與${name}交談"></button><h3>${name}</h3><p class="academy-keeper-speech" hidden></p>`;body.append(keeper);
  let i=0;keeper.querySelector('button')!.onclick=()=>{const speech=keeper.querySelector<HTMLElement>('p')!;speech.hidden=false;speech.textContent=lines[i++%lines.length];};
 }
 private results(){
  const s=this.session;if(!s)return;const courses=TRAINING_COURSES[s.visit.kind];
  s.body.innerHTML=`<div class="training-result"><section class="training-batch-paper"><header><small>${ACADEMY_NAMES[s.visit.kind]}</small><h3>凝神修練</h3></header><div class="training-batch-results" style="--trainees:${s.visit.results.length}">${s.visit.results.map(r=>{
   const g=s.generals.find(g=>g.id===r.generalId)!,course=courses.find(c=>c.name===r.course)!;
   return `<article class="training-result-person"><header class="training-person-title"><h4>${esc(g.name)}</h4><small>${esc(r.course)}</small></header><div class="training-figure"><img src="${rosterArtUrl(g)}" alt="${esc(g.name)}"></div><div class="training-reels" style="--gain-cols:${r.gains.length>2?2:1}">${r.gains.map((x,i)=>{
    const range=course.gains[i];return `<div><span>基礎${TRAINING_STAT_NAMES[x.stat]}</span><div class="training-reel"><div class="reel-track">${Array.from({length:22},(_,j)=>'<b>＋'+(j===21?x.value:range.min+(j*7+i*3)%(range.max-range.min+1))+'</b>').join('')}</div></div></div>`;
   }).join('')}</div></article>`;
  }).join('')}</div><button class="btn primary training-result-close" disabled>修練中</button></section></div>`;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  s.body.querySelectorAll<HTMLElement>('.reel-track').forEach((el,i)=>{const step=parseFloat(getComputedStyle(el.firstElementChild!).height);el.animate([{transform:'translateY(0)'},{transform:`translateY(${-21*step}px)`}],{duration:reduced?0:1600+(i%4)*120,easing:'cubic-bezier(.12,.62,.2,1)',fill:'forwards'});});
  this.timer=window.setTimeout(()=>{if(this.session!==s)return;s.body.querySelector('h3')!.textContent='修練有成';const close=s.body.querySelector<HTMLButtonElement>('.training-result-close')!;close.disabled=false;close.textContent='完成';close.onclick=()=>this.act({type:'leave'});},reduced?0:2100);
 }
}
