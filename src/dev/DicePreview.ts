import { DiceRoller } from '../ui/DiceRoller';

document.body.style.cssText = 'margin:0;background:#18232d;color:#eee7d8;font-family:system-ui;overflow:hidden';
const root = document.querySelector<HTMLDivElement>('#preview')!;
root.innerHTML = `<style>
  main{position:relative;z-index:1300;padding:30px;pointer-events:none} h1{font-size:24px;margin:0 0 7px}
  p{color:#a8b4bd;font-size:14px;margin:0 0 20px} .tools{display:flex;gap:8px;flex-wrap:wrap;max-width:700px;pointer-events:auto}
  button,select{font:inherit;color:#f5dfac;background:#243541;border:1px solid #5b6a70;border-radius:8px;padding:9px 14px;cursor:pointer}
  .scrub{position:fixed;bottom:25px;left:30px;right:30px;z-index:1300;display:flex;align-items:center;gap:15px;flex-wrap:wrap}
  input{width:min(50vw,400px)} label{color:#c0cbd0;font-size:14px} output{color:#f5dfac;min-width:40px}
  a{color:#a9becb} .dice-roll-stage{background:radial-gradient(ellipse at 50% 55%,#59677055,transparent 65%)}
  @media(max-width:600px){main{padding:18px} h1{font-size:20px}.scrub{left:18px;bottom:12px}}
  </style><main><h1>玉白立體骰子 · 物理版</h1><p>Rapier 剛體引擎 · 重力／摩擦／反彈／雙骰碰撞 · 480 Hz 固定物理步進</p>
  <div class="tools"><button id="single">擲一顆</button><button id="double">擲兩顆</button><button id="bonus">雙骰＋步數加成</button>
  <button id="waiting">多人等待後擲骰</button><button id="cancel">取消／還原</button>
  <select id="speed" aria-label="動畫速度"><option value="1">正常速度</option><option value="2">2倍速度</option><option value="4">4倍速度</option></select></div>
  </main><div class="scrub"><label for="face">檢視頂面</label><select id="face" aria-label="檢視頂面">${[1,2,3,4,5,6].map(v=>`<option value="${v}">${v} 點</option>`).join('')}</select>
  <label for="phase">動作分解</label><input id="phase" type="range" min="0" max="100" value="100" step="1" aria-label="動作進度"><output id="progress">100%</output>
  <a href="./?lord=liu">返回遊戲</a></div>`;
const roller = new DiceRoller(root,{centerFinal:true});
const q = <T extends HTMLElement>(selector: string) => root.querySelector<T>(selector)!;
const face = q<HTMLSelectElement>('#face'), phase = q<HTMLInputElement>('#phase');
const speed = () => +q<HTMLSelectElement>('#speed').value;
const randomFace = () => 1 + crypto.getRandomValues(new Uint32Array(1))[0] % 6;
let pending = 0;
function cancel() { clearTimeout(pending); roller.cancel(); }
const pose = () => { clearTimeout(pending); q('#progress').textContent = `${phase.value}%`; void roller.previewPose(+face.value, +phase.value / 100).catch(() => { q('#progress').textContent = '載入失敗，請重新整理'; }); };
q('#single').onclick = () => { cancel(); void roller.roll([randomFace()], 0, 1, speed(), true); };
q('#double').onclick = () => { cancel(); void roller.roll([randomFace(), randomFace()], 0, 1, speed(), true); };
q('#bonus').onclick = () => { cancel(); void roller.roll([2, 5], 2, 2, speed(), true); };
q('#waiting').onclick = () => { cancel(); roller.startWaiting(); pending = window.setTimeout(() => { void roller.roll([4], 0, 1, speed(), true); }, 1200); };
q('#cancel').onclick = cancel; face.onchange = pose; phase.oninput = pose;
pose();
