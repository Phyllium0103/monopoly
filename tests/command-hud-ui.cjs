const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 try{
  const page=await browser.newPage({viewport:{width:1600,height:900}});
  await page.goto(process.env.GAME_URL||'http://127.0.0.1:5175/');
  await page.getByRole('button',{name:/單人遊戲/}).click({timeout:60000});
  await page.locator('.fc-sect').getByText('劉備',{exact:true}).click();
  await page.locator('.party-shell:not(.hidden)').waitFor({timeout:60000});
  for(let i=0;i<5;i++){const choice=page.locator('.dialog:not(.hidden) .choice').first();if(await choice.isVisible()){await choice.click();await page.waitForTimeout(200);}else break;}
  await page.locator('.lord-command-name img').first().evaluate(img=>img.complete?null:new Promise(resolve=>{img.onload=resolve;img.onerror=resolve;}));
  await page.waitForFunction(()=>document.querySelector('.command-surface')?.dataset.ready==='true');
  const sameHeight=[];
  for(const size of [{width:1600,height:900},{width:1920,height:900},{width:1280,height:900},{width:1280,height:720},{width:1920,height:1080}]){
   await page.setViewportSize(size);await page.waitForTimeout(400);
   const m=await page.evaluate(()=>{
    const hud=document.querySelector('.command-hud'),roll=hud.querySelector('.roll-btn'),rect=roll.getBoundingClientRect(),surface=hud.querySelector('.command-surface'),s=surface.getBoundingClientRect();
    const names=[...hud.querySelectorAll('.lord-command-name')];
    const centered=names.every(name=>{const n=name.getBoundingClientRect(),c=name.closest('.lord-actor').getBoundingClientRect();return Math.abs(n.x+n.width/2-c.x-c.width/2)<1&&name.querySelector('img').naturalWidth>0;});
    const rollLabel=hud.querySelector('.roll-title'),labelRect=rollLabel.getBoundingClientRect();
    if(surface.tagName!=='CANVAS'||surface.dataset.renderMode!=='single-texture'||surface.dataset.ready!=='true'||hud.querySelectorAll('.command-surface').length!==1)throw Error('Desk must render one complete texture, not separate image parts');
    const style=getComputedStyle(hud),factor=s.width/parseFloat(style.getPropertyValue('--command-width'));
    return {height:s.height,width:s.width,x:s.x,bottom:innerHeight-s.bottom,left:parseFloat(style.getPropertyValue('--command-left-width'))*factor,right:parseFloat(style.getPropertyValue('--command-right-width'))*factor,middle:parseFloat(style.getPropertyValue('--command-middle-width'))*factor,square:Math.abs(rect.width-rect.height),diceWidth:rect.width,centered,labels:names.length,titleCentered:Math.abs(labelRect.x+labelRect.width/2-rect.x-rect.width/2)<1&&rollLabel.querySelector('img').naturalWidth>0,trayLabels:[getComputedStyle(hud.querySelector('.party-shell'),'::before').content,getComputedStyle(hud.querySelector('.item-dock-toolbar'),'::before').content]};
   });
   assert.ok(Math.abs(m.height-size.height*.3)<1,'desk stays at 30% of the viewport height');
   assert.ok(Math.abs(m.width-size.width)<1&&Math.abs(m.x)<1&&Math.abs(m.bottom)<1,'1920 reference and narrower desks reach both screen edges');
   assert.ok(m.square<1&&m.centered&&m.titleCentered,'dice and ruler nameplates align and load their artwork');
   assert.equal(m.labels,4);assert.ok(m.trayLabels.every(value=>['none','normal','""'].includes(value)));
   if(size.height===900)sameHeight.push(m);
  }
  for(const m of sameHeight){assert.ok(Math.abs(m.right-sameHeight[0].right)<1&&Math.abs(m.diceWidth-sameHeight[0].diceWidth)<1,'dice section does not change with horizontal resizing');assert.ok(Math.abs((m.left-sameHeight[0].left)-(m.middle-sameHeight[0].middle))<1,'ruler and tray sections share horizontal changes equally');}
  await page.setViewportSize({width:1600,height:900});await page.mouse.move(800,70);await page.waitForTimeout(600);
  const content=await page.evaluate(async()=>{
   const roll=document.querySelector('.roll-btn');
   const art=roll.querySelector('.roll-dice img'),proof=await (await fetch('/docs/command-dice-preview.json')).json();
   return {rows:[...document.querySelectorAll('.lord-island-value')].every(row=>row.children.length===2&&row.firstElementChild.tagName==='IMG'),progress:document.querySelectorAll('.lord-cultivation').length,faces:proof.visibleFaces,loaded:art.complete&&art.naturalWidth===512,calligraphy:[...document.querySelectorAll('.lord-command-name>span,.roll-title>span')].every(el=>getComputedStyle(el).fontFamily.includes('Folio Title')),circles:[...document.querySelectorAll('.pd-gen img')].every(el=>getComputedStyle(el).borderRadius==='50%'),shadow:getComputedStyle(roll).boxShadow,animation:getComputedStyle(roll).animationName};
  });
  assert.ok(content.rows);assert.equal(content.progress,0);assert.deepEqual(content.faces,[[1,3,5],[2,4,6]]);assert.ok(content.loaded&&content.calligraphy&&content.circles);assert.equal(content.shadow,'none');assert.equal(content.animation,'none');
  await page.waitForFunction(()=>document.querySelector('.roll-btn')?.dataset.diceReady==='true');
  await page.locator('.roll-btn').hover();
  await page.waitForTimeout(650);
  assert.equal(await page.locator('.roll-btn').getAttribute('data-dice-motion'),'playing');
  assert.ok(Number(await page.locator('.roll-btn').getAttribute('data-dice-frame'))>10,'hover animates the two painted dice independently');
  assert.equal(await page.locator('.roll-btn').getAttribute('data-dice-renderer'),'painted-hover-rotation');
  await page.waitForTimeout(1000);
  assert.equal(await page.locator('.roll-btn').getAttribute('data-dice-motion'),'playing');
  await page.mouse.move(800,70);
  await page.waitForTimeout(50);
  assert.equal(await page.locator('.roll-btn').getAttribute('data-dice-motion'),'settled');
  assert.equal(await page.locator('.roll-btn').getAttribute('data-dice-frame'),'0','pointer leave restores the exact idle pose immediately');
  await page.locator('.roll-btn').focus();await page.waitForTimeout(100);
  assert.equal(await page.locator('.roll-btn').getAttribute('data-dice-motion'),'settled','keyboard focus alone does not play the animation');
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.locator('.roll-btn').hover();await page.waitForTimeout(100);
  assert.equal(await page.locator('.roll-btn').getAttribute('data-dice-motion'),'settled');
  await page.emulateMedia({reducedMotion:'no-preference'});
  const cdp=await page.context().newCDPSession(page);
  await cdp.send('Emulation.setPageScaleFactor',{pageScaleFactor:1.5});await page.waitForTimeout(600);
  const zoom=await page.evaluate(()=>{const vv=visualViewport,r=document.querySelector('.command-surface').getBoundingClientRect();return {height:r.height*vv.scale,width:r.width*vv.scale,bottom:(vv.offsetTop+vv.height-r.bottom)*vv.scale};});
  assert.ok(Math.abs(zoom.height-270)<1&&Math.abs(zoom.width-1600)<1&&Math.abs(zoom.bottom)<1,'pinch zoom preserves full-width footprint and bottom anchor');
  await cdp.send('Emulation.setPageScaleFactor',{pageScaleFactor:1});await page.mouse.move(1100,450);await page.waitForTimeout(600);
  await page.setViewportSize({width:1920,height:1080});await page.mouse.move(1200,500);await page.waitForTimeout(600);
  const resolution=await page.locator('.command-surface').evaluate(canvas=>Number(canvas.dataset.nativeWidth)>=1800&&Number(canvas.dataset.nativeHeight)>=300&&canvas.width>=1900);
  assert.ok(resolution,'one complete lossless artwork renders at the reference display resolution');
  const labels=await page.evaluate(()=>[...document.querySelectorAll('.pd-gen')].every(b=>{
    const name=b.querySelector('.pd-name'),tracks=[...b.querySelectorAll('.pd-track')],n=name.getBoundingClientRect(),r=b.getBoundingClientRect();
    const image=b.querySelector('img').getBoundingClientRect();
    return tracks.length===3&&name.nextElementSibling.tagName==='IMG'&&n.bottom<=image.top+1&&Math.abs(image.x+image.width/2-r.x-r.width/2)<1&&n.width<=r.width+1&&tracks.at(-1).getBoundingClientRect().bottom<=r.bottom+1&&tracks.every(t=>t.getBoundingClientRect().height>=3)&&getComputedStyle(b.querySelector('img')).boxShadow==='rgba(0, 0, 0, 0.6) 0px 2px 8px 0px';
  }));
  assert.ok(labels,'original portrait outline, centered name and three full-width status tracks fit inside the shallow tray');
  const behavior=await page.evaluate(async()=>{
   const {GameUI}=await import('/src/ui/GameUI.ts'),{ItemDock}=await import('/src/ui/ItemDock.ts'),{ITEM_DEFS}=await import('/src/data/items.ts');
   const ui=Object.create(GameUI.prototype);ui.party=document.querySelector('.party-dock');ui.partyShell=document.querySelector('.party-shell');ui.partyPrev=document.querySelector('.party-prev');ui.partyNext=document.querySelector('.party-next');ui.flames={sync(){}};
   const originalNodes=[...ui.party.childNodes],originalKey=ui.party.dataset.key,original=originalNodes.map((b,i)=>({id:'original-'+i,name:b.getAttribute('aria-label'),img:b.querySelector('img').src,color:'#fff',hpPct:100,staPct:100,expPct:0,tip:'',ready:false,hasSkill:false,flame:0,onClick(){}}));
   const dock=Object.create(ItemDock.prototype);dock.el=document.querySelector('.item-dock');dock.hud=document.querySelector('.command-hud');dock.category='全部';dock.columns=10;dock.key='';dock.list=dock.el.querySelector('.item-dock-list');
   const originalItemNodes=[...dock.el.childNodes],originalItemStyle=dock.el.getAttribute('style');
   const itemState={items:[{uid:'hint-test',defId:Object.keys(ITEM_DEFS)[0],tier:0}],visible:true,battle:false,selected:null,hint:'選物品 → 選施放者 → 點目標；確認生效時才扣除體力',choices:[],disabled(){return '';},pick(){},choose(){},cancel(){}};
   const wait=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
   const repeated=n=>Array.from({length:n},(_,i)=>({...original[i%original.length],id:'layout-test-'+i,name:i===0?'夏侯元讓':original[i%original.length].name,flame:0,hasSkill:false,ready:false}));
   const width=ui.partyShell.clientWidth,styles=getComputedStyle(ui.party),gap=parseFloat(styles.columnGap)||0,padding=parseFloat(styles.paddingLeft)+parseFloat(styles.paddingRight),step=ui.partyIconStep(),fit=Math.max(1,Math.floor((width-padding+gap)/step));
   ui.renderParty(repeated(fit));await wait();
   ui.partyNext.click();
   const fits=!ui.partyShell.classList.contains('has-overflow')&&ui.partyPrev.disabled&&ui.partyNext.disabled&&ui.party.scrollLeft===0;
   ui.renderParty(repeated(fit+5));await wait();const start=ui.party.scrollLeft;
   ui.partyNext.click();await wait();const first=ui.party.scrollLeft;
   ui.partyNext.click();await wait();const second=ui.party.scrollLeft;
   const overflow=ui.partyShell.classList.contains('has-overflow')&&Math.abs(first-start-step)<1.5&&Math.abs(second-first-step)<1.5;
   ui.renderParty(repeated(2));await wait();const reset=ui.party.scrollLeft===0&&ui.partyNext.disabled;
   ui.party.replaceChildren(...originalNodes);ui.party.dataset.key=originalKey;ui.resizeParty();await wait();
   dock.render(itemState);await wait();
   const normalHint=dock.el.querySelector('.item-dock-hint').getBoundingClientRect().y;
   dock.render({...itemState,items:[],selected:null,choices:[]});await wait();
   const emptyHint=dock.el.querySelector('.item-dock-hint').getBoundingClientRect().y,empty=!dock.el.textContent.includes('沒有此類物品')&&dock.el.querySelectorAll('.item-slot').length===0;
   dock.el.replaceChildren(...originalItemNodes);if(originalItemStyle!==null)dock.el.setAttribute('style',originalItemStyle);await wait();
   return {fits,overflow,reset,empty,hintStable:Math.abs(normalHint-emptyHint)<1,first,second,step,fit};
  });
  assert.ok(behavior.fits&&behavior.overflow&&behavior.reset,JSON.stringify(behavior));
  assert.ok(behavior.empty&&behavior.hintStable,'empty categories keep a blank item row and a fixed operation hint');
  assert.equal(await page.locator('.command-dice-mat').isVisible(),true);
  assert.equal(await page.locator('.command-surface').getAttribute('data-edge-cleanup'),'contour-matte');
  if(process.env.HUD_SCREENSHOT)await page.screenshot({path:process.env.HUD_SCREENSHOT});
  await page.locator('.roll-btn').hover();await page.waitForTimeout(150);
  await page.locator('.roll-btn').click();await page.waitForTimeout(100);
  assert.equal(await page.locator('.roll-btn').isVisible(),false,'dice disappear immediately after rolling');
  assert.equal(await page.locator('.roll-title').isVisible(),true,'dice title plaque remains after rolling');
  assert.equal(await page.locator('.roll-btn').getAttribute('data-dice-frame'),'0','actual rolling cancels the hover sequence immediately');
  console.log('PASS responsive desk, centered portrait/name/status bars, exact navigation, fixed empty-item hint, painted floating 135/246 dice, hover-only playback, immediate pointer-leave reset and persistent mat/title');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
