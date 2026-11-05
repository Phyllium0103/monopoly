import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { MAP_MODELS } from '../data/mapModels';
import { ROOF_STUDIES, type RoofStudy, type RoofPalette } from './RoofColorSchemes';
import './roof-color-preview.css';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const root = $('roof-review');
const letters = ['A', 'B', 'C'];
const storageKey = 'xiantu-roof-review-v1';
let choices: Record<string, number> = {};
try { choices = JSON.parse(localStorage.getItem(storageKey) ?? '{}'); } catch { /* Optional local picks. */ }
const paletteColors = (p:RoofPalette,s:RoofStudy) => (['main','light','dark'] as const).filter(role=>Object.values(s.materials).includes(role)).map(role=>p[role]);
const swatches = (p: RoofPalette,s:RoofStudy) => `<span class="swatches" aria-label="${paletteColors(p,s).join('、')}">${paletteColors(p,s).map(c=>`<i style="background:${c}" title="${c}"></i>`).join('')}</span>`;

root.innerHTML = `
  <header class="review-header"><div><p class="eyebrow">仙途三國 / ARCHITECTURE COLOR STUDIES</p><h1>屋頂，換一種性格。</h1><p class="intro">15 種設施・14 種屋頂與上蓋・42 組配色。以用途定色，保留每棟建築原有的細節。</p></div>
  <div class="header-actions"><button id="show-overview">查看全設施對照</button><button id="export-picks">匯出我的選色</button><a href="./">返回遊戲 ↗</a></div></header>
  <div class="review-workspace">
    <nav class="facility-nav" aria-label="選擇設施"><div class="nav-heading">十五設施 <span>SELECT A BUILDING</span></div>${ROOF_STUDIES.map((s,i)=>`
      <button class="facility-item" data-index="${i}" aria-pressed="false"><span class="facility-number">${String(i+1).padStart(2,'0')}</span><span><strong>${s.name}</strong><small>${s.purpose}</small></span><span class="saved-mark" aria-label="已記錄選色">${choices[s.key]===undefined?'':'●'}</span></button>`).join('')}</nav>
    <main class="stage-column"><div class="stage-title"><div><p class="eyebrow" id="study-number"></p><h2 id="building-name"></h2></div><span id="purpose" class="purpose"></span></div>
      <div id="viewport" aria-label="可旋轉縮放的設施 3D 預覽"><div class="canvas-caption"><span id="current-name">原有配色</span><span>拖曳旋轉 / 滾輪縮放</span></div><div id="loading" role="status" aria-live="polite">準備模型…</div></div>
      <div class="view-tools"><button id="reset-view">↗ 遊戲角度</button><button id="back-view">↙ 背面</button><button id="top-view">↓ 俯視</button><button id="auto-rotate" aria-pressed="false">慢速旋轉</button><button id="mask" aria-pressed="false">檢查換色範圍</button></div>
      <p class="stage-note" id="scope"></p>
    </main>
    <aside class="palette-panel" aria-label="配色方案"><p class="eyebrow">ROOF PALETTES</p><h3>同一棟，三種表情</h3><p class="panel-intro">切換配色時保留鏡頭角度，方便比較輪廓與色彩。</p><div id="palette-options"></div><button id="save-pick" class="primary" disabled>選擇方案後記錄</button><p id="saved-status" class="saved-status" aria-live="polite"></p><div class="review-boundary"><strong>保留參考，隨時比較。</strong><p>已依你匯出的選色更新遊戲。此頁保留所有候選方案；再次記錄只會儲存偏好，不會即時更改遊戲。</p></div></aside>
  </div>
  <section class="comparison-section"><div class="section-heading"><div><p class="eyebrow">SAME ANGLE / SAME LIGHT</p><h2>同角度，放在一起看。</h2></div><button id="refresh-comparison">以目前角度更新對照</button></div><div id="comparison" class="comparison-grid"></div></section>
  <section id="overview" class="overview-section" hidden><div class="section-heading"><div><p class="eyebrow">THE WHOLE NEIGHBORHOOD</p><h2>十五種設施，放在同一套光線下。</h2><p id="overview-progress">按下生成，一次比較所有配色。</p></div><div class="header-actions"><button id="overview-mask" aria-pressed="false">換色範圍總覽</button><button id="export-overview" disabled>匯出對照圖</button><button id="generate-overview" class="primary">生成全設施對照</button></div></div><div id="overview-list"></div></section>
  <footer>屋頂與上蓋配色研究 · 2026.11 · 原色隨時可還原 · 6 階城池不列入本次配色</footer>`;

const renderer = new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance',preserveDrawingBuffer:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
renderer.setClearColor('#e5e4dc');
$('viewport').prepend(renderer.domElement);
renderer.domElement.setAttribute('aria-label','建築三維模型');
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(32,1,.1,160);
const controls = new OrbitControls(camera,renderer.domElement);
controls.enableDamping = true; controls.dampingFactor = .1; controls.enablePan = true;
controls.minDistance = 8; controls.maxDistance = 42; controls.maxPolarAngle = Math.PI*.49;
controls.autoRotateSpeed = .45;
scene.add(new THREE.HemisphereLight('#fff9e9','#758d91',2.1));
const keyLight = new THREE.DirectionalLight('#fff4dd',3.0); keyLight.position.set(-6,12,8); scene.add(keyLight);
const fill = new THREE.DirectionalLight('#d9e8ee',1.25); fill.position.set(8,5,-4); scene.add(fill);
const floor = new THREE.Mesh(new THREE.CircleGeometry(8.4,96),new THREE.MeshStandardMaterial({color:'#d4d7ca',roughness:1}));
floor.rotation.x = -Math.PI/2; floor.position.y = -.05; scene.add(floor);
const modelRoot = new THREE.Group(); scene.add(modelRoot);
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
type Binding = {material: THREE.MeshStandardMaterial; role:'main'|'light'|'dark'; color: THREE.Color; enabled:{value:number}; target:{value:THREE.Color}; highlight:{value:number}};
let bindings: Binding[] = [];
let model: THREE.Group | null = null;
const initialBuilding=new URLSearchParams(location.search).get('building');
let study = ROOF_STUDIES.find(s=>s.key===initialBuilding)??ROOF_STUDIES[0];
let selected = -1;
let mask = false;
let loading = false;
let generating = false;
let loadVersion = 0;
let needsDraw = true;
let modelTargetY = 2;
const mapLuminance = new WeakMap<THREE.Texture, number>();

function averageLuminance(material: THREE.MeshStandardMaterial): number {
  const c = material.color;
  if(!material.map) return Math.max(.025,.2126*c.r+.7152*c.g+.0722*c.b);
  let value = mapLuminance.get(material.map);
  if(value===undefined){
    const cv = document.createElement('canvas'); cv.width=cv.height=24;
    const ctx = cv.getContext('2d',{willReadFrequently:true})!;
    ctx.drawImage(material.map.image as CanvasImageSource,0,0,24,24);
    const pixels = ctx.getImageData(0,0,24,24).data;
    const rgb = new THREE.Color(); let sum=0,weight=0;
    for(let i=0;i<pixels.length;i+=4){const a=pixels[i+3]/255;rgb.setRGB(pixels[i]/255,pixels[i+1]/255,pixels[i+2]/255,THREE.SRGBColorSpace);sum+=(.2126*rgb.r+.7152*rgb.g+.0722*rgb.b)*a;weight+=a;}
    value=weight?sum/weight:1; mapLuminance.set(material.map,value);
  }
  return Math.max(.025,value*(.2126*c.r+.7152*c.g+.0722*c.b));
}

function bindRoof(mesh: THREE.Mesh, original: THREE.MeshStandardMaterial, role:Binding['role'], bounds:THREE.Box3):THREE.MeshStandardMaterial {
  const mat = original.clone();
  const enabled={value:0},target={value:new THREE.Color()},highlight={value:0};
  const reference=averageLuminance(original);
  const geometry=mesh.geometry.clone(); mesh.geometry=geometry;
  const position=geometry.getAttribute('position'),weights=new Float32Array(position.count);
  const pt=new THREE.Vector3(),normalVector=new THREE.Vector3(),normalMatrix=new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld);
  const normal=geometry.getAttribute('normal');let selectedVertices=0;
  if(study.minUpNormal!==undefined&&!normal)throw new Error('屋頂範圍需要模型法線資料。');
  for(let i=0;i<position.count;i++){
    pt.fromBufferAttribute(position,i).applyMatrix4(mesh.matrixWorld);
    const height=(pt.y-bounds.min.y)/(bounds.max.y-bounds.min.y);
    const upward=study.minUpNormal===undefined||normalVector.fromBufferAttribute(normal,i).applyMatrix3(normalMatrix).normalize().y>=study.minUpNormal;
    const onRoof=(study.minHeight===undefined||height>=study.minHeight)&&(study.maxHeight===undefined||height<=study.maxHeight)&&upward;
    weights[i]=onRoof?1:0;if(onRoof)selectedVertices++;
  }
  geometry.setAttribute('roofWeight',new THREE.BufferAttribute(weights,1));
  mat.onBeforeCompile=shader=>{
    shader.uniforms.roofEnabled=enabled;shader.uniforms.roofColor=target;shader.uniforms.roofHighlight=highlight;shader.uniforms.roofReference={value:reference};
    shader.vertexShader='attribute float roofWeight; varying float vRoofWeight;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvRoofWeight = roofWeight;');
    shader.fragmentShader='uniform float roofEnabled; uniform vec3 roofColor; uniform float roofHighlight; uniform float roofReference; varying float vRoofWeight;\n'+shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
      float roofRelief = clamp(dot(diffuseColor.rgb, vec3(0.2126,0.7152,0.0722)) / roofReference, 0.18, 1.8);
      diffuseColor.rgb = mix(diffuseColor.rgb, roofColor * roofRelief, roofEnabled * vRoofWeight);
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.02,0.85,0.65), roofHighlight * vRoofWeight * 0.9);`);
  };
  mat.customProgramCacheKey=()=> 'roof-review-weighted-v1';
  mat.userData.roofReview=true;
  if(selectedVertices)bindings.push({material:mat,role,color:original.color.clone(),enabled,target,highlight});
  return mat;
}

function disposeModel(){
  if(!model)return;
  const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>(),textures=new Set<THREE.Texture>();
  model.traverse(o=>{if(o instanceof THREE.Mesh){geometries.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material]){materials.add(m);Object.values(m).forEach(v=>{if(v instanceof THREE.Texture)textures.add(v);});}}});
  model.removeFromParent();geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());model=null;bindings=[];
}

function applyPalette(index:number, highlight=mask){
  selected=index;
  const palette=study.palettes[index];
  for(const b of bindings){b.enabled.value=palette?1:0;if(palette)b.target.value.set(palette[b.role]);b.highlight.value=highlight?1:0;}
  $('current-name').textContent=highlight?'換色範圍（青綠色標示）':palette?`${letters[index]} · ${palette.name}`:'原有配色';
  $('mask').setAttribute('aria-pressed',String(highlight));
  document.querySelectorAll<HTMLElement>('.palette-option').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.palette)===index)));
  const save=$<HTMLButtonElement>('save-pick');save.disabled=loading||generating;save.textContent=palette?`記錄 ${letters[index]} · ${palette.name}`:'記錄原有配色';
  $('viewport').dataset.palette=String(index);
  $('viewport').dataset.roofBindings=String(bindings.length);
  needsDraw=true;
}

function resetView(kind='game'){
  controls.target.set(0,modelTargetY,0);
  camera.position.copy(controls.target).add(new THREE.Vector3(...(kind==='top'?[.01,26,.01]:kind==='back'?[16,13,-16]:[-16,13,16]) as [number,number,number]));
  controls.update();needsDraw=true;
}

function draw(){renderer.render(scene,camera);needsDraw=false;}
function snapshot(index:number,highlight=false):string {
  applyPalette(index,highlight);draw();
  const cv=document.createElement('canvas');cv.width=640;cv.height=480;
  const ctx=cv.getContext('2d')!;ctx.fillStyle='#e5e4dc';ctx.fillRect(0,0,640,480);
  const source=renderer.domElement,scale=Math.min(640/source.width,480/source.height),w=source.width*scale,h=source.height*scale;
  ctx.drawImage(source,(640-w)/2,(480-h)/2,w,h);return cv.toDataURL('image/jpeg',.87);
}
function comparisonImages():{index:number;name:string;url:string}[]{
  const old=selected,wasMask=mask;
  const shots=[{index:-1,name:'原有配色',url:snapshot(-1)},...study.palettes.map((p,i)=>({index:i,name:`${letters[i]} · ${p.name}`,url:snapshot(i)}))];
  applyPalette(old,wasMask);draw();return shots;
}
function updateComparison(){
  if(!model||loading)return;
  const shots=comparisonImages();
  $('comparison').innerHTML=shots.map(s=>`<button class="comparison-card" data-palette="${s.index}"><img src="${s.url}" alt="${study.name} ${s.name} 同角度對照"><span>${s.name}</span>${s.index<0?'<small>ORIGINAL</small>':swatches(study.palettes[s.index],study)}</button>`).join('');
  document.querySelectorAll<HTMLElement>('.comparison-card').forEach(b=>b.onclick=()=>{mask=false;applyPalette(Number(b.dataset.palette));});
}

function showStudyText(){
  const i=ROOF_STUDIES.indexOf(study);
  $('study-number').textContent=`STUDY ${String(i+1).padStart(2,'0')} / 15`;
  $('building-name').textContent=study.name;$('purpose').textContent=study.purpose;$('scope').textContent=study.noRoof??study.treatment;
  $('palette-options').innerHTML=`<button class="palette-option original-option" data-palette="-1" aria-pressed="true"><span class="palette-letter">原</span><span><strong>原有配色</strong><small>保留這次換色前的模型顏色</small></span></button>`+
    (study.noRoof?`<div class="no-roof"><strong>保留原貌</strong><p>${study.noRoof}</p></div>`:study.palettes.map((p,i)=>`<button class="palette-option" data-palette="${i}" aria-pressed="false"><span class="palette-letter">${letters[i]}</span><span><strong>${p.name}</strong>${swatches(p,study)}<small class="palette-hex">${paletteColors(p,study).join(' / ')}</small><span class="palette-reason">${p.reason}</span></span></button>`).join(''));
  document.querySelectorAll<HTMLElement>('.palette-option').forEach(b=>b.onclick=()=>{if(loading||generating)return;mask=false;applyPalette(Number(b.dataset.palette));});
  document.querySelectorAll<HTMLElement>('.facility-item').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.index)===i)));
  const pick=choices[study.key];$('saved-status').textContent=pick===undefined?'尚未記錄選色':pick===-1?'已記錄：原有配色':`已記錄：${letters[pick]} · ${study.palettes[pick]?.name??''}`;
  $<HTMLButtonElement>('mask').disabled=!!study.noRoof;
}

async function loadStudy(next:RoofStudy, comparison=true){
  const version=++loadVersion;loading=true;mask=false;study=next;selected=-1;showStudyText();
  $('loading').hidden=false;$('loading').textContent=`正在載入 ${study.name}…`;$('viewport').dataset.ready='false';
  try{
    const gltf=await loader.loadAsync(MAP_MODELS[next.key]);
    if(version!==loadVersion){gltf.scene.traverse(o=>{if(o instanceof THREE.Mesh)o.geometry.dispose();});return;}
    disposeModel();model=gltf.scene;model.updateMatrixWorld(true);
    const bounds=new THREE.Box3().setFromObject(model),size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
    model.traverse(o=>{if(!(o instanceof THREE.Mesh))return;const recolor=(m:THREE.Material)=>{const role=study.materials[m.name];return role&&m instanceof THREE.MeshStandardMaterial?bindRoof(o,m,role,bounds):m;};o.material=Array.isArray(o.material)?o.material.map(recolor):recolor(o.material);});
    const scale=10/Math.max(size.x,size.z);model.position.set(-center.x*scale,-bounds.min.y*scale,-center.z*scale);model.scale.setScalar(scale);modelRoot.add(model);
    modelTargetY=Math.min(4,size.y*scale*.38);resetView();loading=false;applyPalette(-1);draw();
    $('loading').hidden=true;$('viewport').dataset.ready='true';$('viewport').dataset.building=next.key;
    if(!next.noRoof&&!bindings.length)throw new Error('找不到預定換色部件，請檢查模型版本。');
    if(comparison)updateComparison();
  }catch(error){loading=false;$('loading').hidden=false;$('loading').textContent=`${next.name} 載入失敗：${error instanceof Error?error.message:String(error)}`;$('viewport').dataset.ready='error';console.error(error);}
}

const resize=()=>{const box=$('viewport').getBoundingClientRect();renderer.setSize(box.width,box.height);camera.aspect=box.width/box.height;camera.updateProjectionMatrix();needsDraw=true;};
new ResizeObserver(resize).observe($('viewport'));
controls.addEventListener('change',()=>{needsDraw=true;});
let raf=0;
function frame(){raf=requestAnimationFrame(frame);if(document.hidden)return;controls.update();if(needsDraw||controls.autoRotate)draw();}
frame();
window.addEventListener('pagehide',()=>{cancelAnimationFrame(raf);disposeModel();renderer.dispose();controls.dispose();});
document.querySelectorAll<HTMLElement>('.facility-item').forEach(b=>b.onclick=()=>{if(!loading&&!generating)void loadStudy(ROOF_STUDIES[Number(b.dataset.index)]);});
$('reset-view').onclick=()=>{resetView();updateComparison();};
$('back-view').onclick=()=>{resetView('back');updateComparison();};
$('top-view').onclick=()=>{resetView('top');updateComparison();};
$('mask').onclick=()=>{mask=!mask;applyPalette(selected);};
$('auto-rotate').onclick=()=>{controls.autoRotate=!controls.autoRotate;$('auto-rotate').setAttribute('aria-pressed',String(controls.autoRotate));};
$('refresh-comparison').onclick=updateComparison;
$('save-pick').onclick=()=>{
  if(loading||generating)return;
  choices[study.key]=selected;
  try{localStorage.setItem(storageKey,JSON.stringify(choices));$('saved-status').textContent=selected===-1?'已記錄：原有配色':`已記錄：${letters[selected]} · ${study.palettes[selected].name}`;}catch{$('saved-status').textContent='瀏覽器無法儲存，請使用「匯出我的選色」保存。';}
  document.querySelectorAll<HTMLElement>('.facility-item').forEach(b=>{b.querySelector('.saved-mark')!.textContent=choices[ROOF_STUDIES[Number(b.dataset.index)].key]===undefined?'':'●';});
};
$('export-picks').onclick=()=>{
  const picks=ROOF_STUDIES.filter(s=>choices[s.key]!==undefined).map(s=>({key:s.key,building:s.name,variant:choices[s.key]===-1?'original':letters[choices[s.key]],palette:choices[s.key]===-1?{name:'原有配色',preserveOriginal:true}:s.palettes[choices[s.key]]}));
  const url=URL.createObjectURL(new Blob([JSON.stringify({date:new Date().toISOString(),picks},null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='設施屋頂-我的選色.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
};
$('show-overview').onclick=()=>{$('overview').hidden=false;$('overview').scrollIntoView({behavior:'smooth',block:'start'});};
$('overview-mask').onclick=()=>{
  const enabled=$('overview-list').classList.toggle('mask-mode');$('overview-mask').setAttribute('aria-pressed',String(enabled));
};
$('export-overview').onclick=async()=>{
  const rows=[...document.querySelectorAll<HTMLElement>('.overview-row')],showMask=$('overview-list').classList.contains('mask-mode');
  if(rows.length!==ROOF_STUDIES.length)return;
  const cv=document.createElement('canvas');cv.width=1600;cv.height=140+rows.length*370;const ctx=cv.getContext('2d')!;
  ctx.fillStyle='#f0eee6';ctx.fillRect(0,0,cv.width,cv.height);ctx.fillStyle='#233b39';ctx.font='bold 38px "Microsoft JhengHei",sans-serif';ctx.fillText(showMask?'十五設施・換色範圍':'十五設施・屋頂三方案配色',32,60);
  ctx.font='20px "Microsoft JhengHei",sans-serif';ctx.fillStyle='#65746c';ctx.fillText('原有模型・同角度同光線・2026.11・參考方案尚未套用正式遊戲',32,102);
  for(const [i,row]of rows.entries()){
    const y=140+i*370;ctx.fillStyle='#233b39';ctx.font='bold 24px "Microsoft JhengHei",sans-serif';ctx.fillText(`${String(i+1).padStart(2,'0')}  ${row.querySelector('h3')!.textContent}`,32,y+25);
    const images=[...row.querySelectorAll<HTMLImageElement>(showMask?'.mask-grid img':'.palette-grid img')];
    for(const [col,im]of images.entries()){
      await im.decode();const x=32+col*390;ctx.drawImage(im,x,y+42,375,281);ctx.fillStyle='#233b39';ctx.font='18px "Microsoft JhengHei",sans-serif';ctx.fillText(im.alt,x,y+350,375);
    }
  }
  cv.toBlob(blob=>{if(!blob)return;const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=showMask?'十五設施-屋頂換色範圍.png':'十五設施-屋頂配色對照.png';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);},'image/png');
};
$('generate-overview').onclick=async()=>{
  if(loading||generating)return;
  generating=true;const previous=study,previousPalette=selected;const oldRotate=controls.autoRotate;controls.autoRotate=false;
  $<HTMLButtonElement>('generate-overview').disabled=true;$<HTMLButtonElement>('export-overview').disabled=true;$('overview-list').innerHTML='';
  const failed:string[]=[];
  for(const [i,s]of ROOF_STUDIES.entries()){
    $('overview-progress').textContent=`正在準備 ${i+1} / 15：${s.name}`;await loadStudy(s,false);
    if($('viewport').dataset.ready!=='true'){failed.push(s.name);continue;}
    const shots=comparisonImages(),maskShot=s.noRoof?null:snapshot(-1,true);applyPalette(-1,false);
    const row=document.createElement('article');row.className='overview-row';row.id=`overview-${s.key}`;
    row.innerHTML=`<div class="overview-heading"><span class="facility-number">${String(i+1).padStart(2,'0')}</span><h3>${s.name}</h3><span>${s.purpose}</span></div>${s.noRoof?`<p class="overview-note">${s.noRoof}</p>`:''}<div class="comparison-grid palette-grid">${shots.map(shot=>`<button class="comparison-card" data-palette="${shot.index}"><img src="${shot.url}" alt="${shot.name}"><span>${shot.name}</span>${shot.index<0?'<small>ORIGINAL</small>':swatches(s.palettes[shot.index],s)}</button>`).join('')}</div><div class="mask-grid"><div class="comparison-card"><img src="${shots[0].url}" alt="原有配色"><span>原有配色</span></div>${maskShot?`<div class="comparison-card"><img src="${maskShot}" alt="青綠色為換色範圍"><span>青綠色為換色範圍</span></div>`:'<p class="overview-note">無獨立屋頂，保留原貌。</p>'}</div>`;
    row.querySelectorAll<HTMLElement>('button').forEach(b=>b.onclick=async()=>{if(loading||generating)return;await loadStudy(s);applyPalette(Number(b.dataset.palette));$('building-name').scrollIntoView({behavior:'smooth'});});
    $('overview-list').append(row);await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));
  }
  await loadStudy(previous);generating=false;controls.autoRotate=oldRotate;applyPalette(previousPalette);
  $<HTMLButtonElement>('generate-overview').disabled=false;$<HTMLButtonElement>('export-overview').disabled=failed.length>0;
  $('overview-progress').textContent=failed.length?`未完成：${failed.join('、')}。可重新生成。`:'15 種設施已完成對照；14 種可改色，共 42 組方案。點擊任一圖片可回到可旋轉的 3D 預覽。';
};
void loadStudy(study);
