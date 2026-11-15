const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  try {
    const page=await browser.newPage({viewport:{width:1920,height:1080}}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto((process.env.GAME_URL||'http://127.0.0.1:5175/')+'?lord=liu');
    await page.waitForFunction(()=>window.game?.state?.generals,{},{timeout:120000});
    const start=(realm=2)=>page.evaluate(async realm=>{
      const rules=await import('/src/data/breakthroughRules.ts');
      window.game.dialog.close();
      document.body.dataset.result='pending';
      const g={realm,name:'劉備',goldenCore:'heavenly'};
      void window.game.dialog.message(rules.breakthroughSuccessTitle(g),rules.breakthroughSuccess(g)).then(()=>{document.body.dataset.result='confirmed';});
    },realm);
    const flight=page.locator('.dialog.breakthrough-flight');
    await start();
    await page.waitForFunction(()=>document.querySelector('.breakthrough-flight')?.dataset.animation==='playing');
    await page.evaluate(()=>document.querySelector('.flight-confirm').click());
    assert.equal(await flight.getAttribute('data-animation'),'complete','first click skips the flight');
    assert.equal(await flight.getAttribute('data-wing-layer'),'split');
    const depth=await page.evaluate(()=>{
      const f=window.game.dialog.flight,output=[];
      for(const time of [1.08,1.24,3.2]){
        f.paint(time);
        const card=document.querySelector('.breakthrough-flight'),back=card.querySelector('.flight-wings'),tips=card.querySelector('.flight-wing-front'),p=card.querySelector('.flight-panel');
        if(getComputedStyle(back).zIndex!=='0'||getComputedStyle(tips).zIndex!=='2')throw Error('rear shoulder or folded forewing layer has incorrect depth');
        const data=tips.getContext('2d').getImageData(0,0,tips.width,tips.height).data,b=back.getContext('2d').getImageData(0,0,back.width,back.height).data;
        let frontCount=0,backCount=0,crestPixels=0,overlap=0;
        const r=tips.width/card.clientWidth;
        const cr=card.getBoundingClientRect(),pr=p.getBoundingClientRect(),scale=card.clientWidth/cr.width;
        const left=(pr.left-cr.left)*scale,pt=(pr.top-cr.top)*scale,w=pr.width*scale,h=pr.height*scale;
        for(let y=0;y<tips.height;y++)for(let x=0;x<tips.width;x++){
          const a=data[(y*tips.width+x)*4+3];if(a>128){frontCount++;if(x/r>left&&x/r<left+w&&y/r>pt&&y/r<pt+h)overlap++;}
          if(b[(y*tips.width+x)*4+3]>128)backCount++;
          if(a&&Math.pow((x/r-card.clientWidth/2)/(w*.055),2)+Math.pow((y/r-pt-h*.113)/(h*.07),2)<1)crestPixels++;
        }
        output.push({frontCount,backCount,crestPixels,overlap});
      }
      return output;
    });
    for(const d of depth){assert(d.frontCount>(d.frontCount+d.backCount)*.3&&d.backCount>0,JSON.stringify(d));assert.equal(d.crestPixels,0);assert(d.overlap>0,'the full folded forewing overlaps the plaque');}
    assert.ok(await flight.locator('.flight-panel').evaluate(e=>Math.abs(e.clientWidth/e.clientHeight-4/3)<.01),'original paper ratio keeps medallion round');
    assert.equal(await flight.locator('.flight-body').evaluate(e=>getComputedStyle(e).textAlign),'center');
    assert.equal(await page.locator('body').getAttribute('data-result'),'pending','skip does not confirm');
    assert.equal(await flight.locator('.flight-heading').innerText(),'百川匯海，道基方成');
    assert.equal(await flight.locator('.flight-body').innerText(),'丹田內氤氳靈氣極盡壓縮，化作一滴精純真元。引此真元洗刷奇經八脈，伐毛洗髓，褪盡紅塵業障，為日後參悟天道鑄就萬世不拔之根基。');
    if(process.env.UI_SCREENSHOT) await page.screenshot({path:process.env.UI_SCREENSHOT});
    await flight.locator('.flight-confirm').click();
    assert.equal(await page.locator('body').getAttribute('data-result'),'confirmed');
    await start();await page.mouse.click(30,200);
    assert.equal(await flight.getAttribute('data-animation'),'complete','backdrop click skips only');
    assert.equal(await page.locator('body').getAttribute('data-result'),'pending');
    await page.keyboard.press('Enter');
    for(const realm of [3,5,10]) {
      await start(realm);await page.keyboard.press('Escape');
      assert.equal(await flight.getAttribute('data-animation'),'complete');
      assert.equal(await page.locator('body').getAttribute('data-result'),'pending');
      const bounds=await flight.evaluate(card=>{
        const p=card.querySelector('.flight-panel').getBoundingClientRect(),s=card.getBoundingClientRect(),body=card.querySelector('.flight-body').getBoundingClientRect(),button=card.querySelector('.flight-confirm'),b=button.getBoundingClientRect(),r=document.createRange();r.selectNodeContents(button);const t=r.getBoundingClientRect();
        return {paperInside:p.top>=s.top&&p.bottom<=s.bottom,centered:Math.abs(p.x+p.width/2-innerWidth/2)<1&&Math.abs(p.y+p.height/2-innerHeight/2)<1,textInside:body.bottom<b.top&&body.left>=p.left&&body.right<=p.right,buttonInside:t.left>=b.left&&t.right<=b.right&&t.top>=b.top-1&&t.bottom<=b.bottom+1};
      });
      assert.ok(bounds.paperInside&&bounds.centered&&bounds.textInside&&bounds.buttonInside,JSON.stringify({realm,...bounds}));
      await page.keyboard.press('Enter');
    }
    await page.evaluate(()=>{void window.game.dialog.confirm('氣聚成液，洗經伐髓','成功率 100%','突破','再等等');});assert.equal(await page.locator('.dialog.jade-dialog').count(),1);assert.equal(await flight.count(),0);await page.keyboard.press('Escape');
    const fail=(title='突破失敗',text='損失25%修為與最大血量的25%。')=>page.evaluate(({title,text})=>{
      document.body.dataset.result='pending';
      void window.game.dialog.message(title,text).then(()=>document.body.dataset.result='confirmed');
    },{title,text});
    await fail();
    assert.equal(await flight.locator('.failure-result').evaluate(e=>getComputedStyle(e).visibility),'hidden');
    assert.equal(await flight.locator('.fracture-copy .flight-heading').innerText(),'百川匯海，道基方成');
    assert.equal(await flight.locator('.fracture-copy').evaluate(e=>getComputedStyle(e).opacity),'0','no success inscription before impact');
    await page.waitForFunction(()=>document.querySelector('.flight-failure')?.dataset.phase==='fall');
    assert.equal(await flight.getAttribute('data-inscription-opacity'),null,'inscription waits until floor contact');
    if(process.env.UI_FAILURE_PREFIX) await page.screenshot({path:process.env.UI_FAILURE_PREFIX+'-fall.png'});
    await page.waitForFunction(()=>document.querySelector('.flight-failure')?.dataset.pieces==='2');
    assert.equal(await flight.getAttribute('data-pieces'),'2');
    assert.equal(await flight.getAttribute('data-fractured-text'),'success');
    await page.waitForFunction(()=>document.querySelector('.flight-failure')?.dataset.animation==='complete');
    assert.equal(await flight.getAttribute('data-phase'),'settled');
    assert.equal(await flight.getAttribute('data-inscription-opacity'),'1');
    assert.equal(await flight.locator('.failure-result .flight-body').innerText(),'損失25%修為與最大血量的25%。');
    const failureLayout=await flight.locator('.failure-result').evaluate(e=>{const r=e.getBoundingClientRect();return{center:Math.abs(r.y+r.height/2-innerHeight/2),color:getComputedStyle(e.querySelector('.flight-body')).color}});
    assert(failureLayout.center<1);assert.equal(failureLayout.color,'rgb(36, 27, 22)');
    assert.equal(await page.locator('body').getAttribute('data-result'),'pending');
    if(process.env.UI_FAILURE_PREFIX) await page.screenshot({path:process.env.UI_FAILURE_PREFIX+'-settled.png'});
    await page.keyboard.press('Enter');
    await fail();await page.mouse.click(30,200);
    assert.equal(await flight.getAttribute('data-animation'),'complete');assert.equal(await flight.getAttribute('data-pieces'),'2');
    assert.equal(await page.locator('body').getAttribute('data-result'),'pending','failure skip does not confirm');await page.keyboard.press('Enter');
    await fail('逆天而行，引動雷劫','血量歸零，身死道消。');await page.keyboard.press('Escape');
    assert.equal(await flight.locator('.failure-result .failure-status').innerText(),'突破失敗');assert.equal(await flight.locator('.failure-result .flight-heading').innerText(),'逆天而行，引動雷劫');await page.keyboard.press('Enter');
    await fail('真元極縮，凝液成丹','損失25%修為與最大血量的50%。');await page.keyboard.press('Escape');
    assert.equal(await flight.locator('.fracture-copy .flight-heading').innerText(),'金丹，大道初成');
    assert(!(await flight.locator('.fracture-copy .flight-body').innerText()).includes('xx'));
    assert.equal(await flight.locator('.failure-result .flight-body').innerText(),'損失25%修為與最大血量的50%。');await page.keyboard.press('Enter');
    await page.emulateMedia({reducedMotion:'reduce'});await start();await page.waitForFunction(()=>document.querySelector('.breakthrough-flight')?.dataset.animation==='complete');await page.keyboard.press('Enter');
    await fail();await page.waitForFunction(()=>document.querySelector('.flight-failure')?.dataset.animation==='complete');assert.equal(await flight.getAttribute('data-pieces'),'2');await page.keyboard.press('Enter');
    await page.emulateMedia({reducedMotion:'no-preference'});await start();
    await page.waitForFunction(()=>document.querySelector('.breakthrough-flight')?.dataset.animation==='complete',{},{timeout:10000});
    await page.setViewportSize({width:1280,height:720});
    await page.waitForTimeout(200);
    assert.equal(await flight.getAttribute('data-animation'),'complete');
    const centered=await flight.locator('.flight-panel').evaluate(p=>{const r=p.getBoundingClientRect();return Math.abs(r.y+r.height/2-innerHeight/2)<1;});
    assert.ok(centered,'paper remains centered after resize');
    await page.keyboard.press('Enter');
    assert.deepEqual(errors,[]);
    console.log('PASS realm outcomes: success content and centering; failure ascent/fall/impact, two settled pieces, preserved penalties and tribulation text; click/keyboard skip without confirmation, jade preflight, reduced motion, completion and resize');
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
