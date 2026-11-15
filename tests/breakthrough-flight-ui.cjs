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
    await page.evaluate(()=>{void window.game.dialog.message('突破失敗','損失25%修為與最大血量的25%。');});assert.equal(await page.locator('.dialog.jade-failure').count(),1);await page.keyboard.press('Enter');
    await page.emulateMedia({reducedMotion:'reduce'});await start();await page.waitForFunction(()=>document.querySelector('.breakthrough-flight')?.dataset.animation==='complete');await page.keyboard.press('Enter');
    await page.emulateMedia({reducedMotion:'no-preference'});await start();
    await page.waitForFunction(()=>document.querySelector('.breakthrough-flight')?.dataset.animation==='complete',{},{timeout:10000});
    await page.setViewportSize({width:1280,height:720});
    await page.waitForTimeout(200);
    assert.equal(await flight.getAttribute('data-animation'),'complete');
    const centered=await flight.locator('.flight-panel').evaluate(p=>{const r=p.getBoundingClientRect();return Math.abs(r.y+r.height/2-innerHeight/2)<1;});
    assert.ok(centered,'paper remains centered after resize');
    await page.keyboard.press('Enter');
    assert.deepEqual(errors,[]);
    console.log('PASS game success flight: original content, click/keyboard skip without confirmation, subsequent confirmation, all sampled realms fit, jade preflight/failure preserved, reduced motion, natural completion and resize');
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
