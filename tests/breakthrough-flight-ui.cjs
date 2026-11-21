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
    assert.equal(await flight.locator('.flight-body').innerText(),'丹田內氤氳靈氣極盡壓縮，化作一滴精純真元。劉備引真元洗盡奇經八脈的紅塵業障，自此道基方成。');
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
    for (const viewport of [{width:1920,height:1080},{width:1280,height:720},{width:390,height:700},{width:720,height:390}]) {
      await page.setViewportSize(viewport);
      const layout = await page.evaluate(() => {
        const d = window.game.dialog;
        const buttonY = () => document.querySelector('.jade-decision .dialog-buttons .btn').getBoundingClientRect().top;
        void d.confirm('本命武器升階', '所需材料', '升階', '再等等');
        const weaponY = buttonY();
        void d.confirm('修為圓滿', '<strong class="jade-ready-names">劉備、關羽</strong>', '前往突破', '稍後再說');
        const readyY = buttonY();
        void d.confirm('真元極縮，凝液成丹', '<div class="jade-destination jade-destination-question"><small>劉備</small><strong>是否晉升天道金丹？</strong></div><dl class="jade-stats jade-chance"><div><dt>成功率</dt><dd><b>50%</b></dd></div></dl><p class="jade-risk">失敗會損失25%修為，並道基受損，扣除血量50%</p>', '確認', '再選擇');
        const coreY = buttonY(), risk = document.querySelector('.jade-risk');
        const riskFits = risk.scrollWidth <= risk.clientWidth + 1;
        const singleLine = getComputedStyle(risk).whiteSpace === 'nowrap';
        void d.message('歷練紅塵，化凡悟道', '<strong class="jade-ready-names">劉備</strong><p class="jade-hint">自封修為入世化凡。</p>');
        const trialY = buttonY();
        void d.choose('九州歸心', '<div class="jade-destination"><small>劉備</small><strong>渡劫</strong></div><p class="jade-hint jade-city-hint">與一城人民共興衰<br>過路費x2，失守將跌落境界</p>',
          ['成都','洛陽','長安'].map(value => ({ label:value, sub:'繁榮度 250', value })));
        const list = document.querySelector('.jade-decision .choice-list');
        const first = list.firstElementChild.getBoundingClientRect(), second = list.children[1].getBoundingClientRect();
        const box = list.getBoundingClientRect();
        const cityY = buttonY(), scrollbar = getComputedStyle(list).scrollbarWidth;
        const cardHeight = list.clientHeight;
        list.scrollTop = cardHeight;
        const scroll = list.scrollTop;
        d.close();
        return {weaponY,readyY,coreY,trialY,cityY,riskFits,singleLine,scrollbar,scroll,cardHeight,height:box.height,firstHeight:first.height,secondOffset:second.top-box.top};
      });
      assert([layout.readyY,layout.coreY,layout.trialY,layout.cityY].every(y=>Math.abs(y-layout.weaponY)<1),JSON.stringify({viewport,...layout}));
      assert(layout.riskFits && layout.singleLine,JSON.stringify({viewport,...layout}));
      assert.equal(layout.scrollbar,'none');
      assert(Math.abs(layout.height-layout.firstHeight)<.1);
      assert(Math.abs(layout.height-layout.secondOffset)<.1);
      assert.equal(layout.cardHeight,layout.scroll);
    }
    await page.setViewportSize({width:1920,height:1080});
    for (const prompt of [
      {kind:'confirm',title:'不死圖騰：免疫死亡？',text:'使用圖騰回復滿血',yes:'使用圖騰',no:'不使用',icon:''},
      {kind:'pickMany',title:'佔領城池',text:'請選擇駐將',choices:[{label:'關羽'}],min:1,max:1,confirm:'佔領'},
      {kind:'slider',title:'派多少士兵駐守成都？',text:'請選擇兵力',min:100,max:300,step:100,initial:200,confirm:'派駐',icon:''},
    ]) {
      await page.evaluate(prompt => {
        window.promptAnswer = window.game.promptUI('liu',{...prompt,buttonsOnly:true});
        document.activeElement.blur();
        document.querySelector('.dialog').parentElement.click();
      }, prompt);
      if (prompt.kind==='pickMany') {
        await page.locator('.dialog .choice').click();
        await page.evaluate(()=>document.activeElement.blur());
      }
      for (const key of ['Escape','Enter']) {
        await page.keyboard.press(key);
        assert(await page.evaluate(()=>window.game.dialog.isOpen),prompt.title+' ignored '+key);
      }
      const cancel = prompt.kind !== 'slider';
      await page.locator(cancel ? '.dialog .dialog-buttons .btn:not(.primary)' : '.dialog .dialog-buttons .primary').click();
      assert.equal(await page.evaluate(()=>window.promptAnswer),prompt.kind==='confirm'?false:cancel?null:200);
    }
    await page.evaluate(async () => {
      const { createGameState } = await import('/src/game/GameState.ts');
      const { makeEquipment } = await import('/src/data/items.ts');
      const { receiveEquipment } = await import('/src/systems/EquipmentInventory.ts');
      const state = createGameState('liu'), lord = state.lords.liu;
      for (let i = 0; i < 21; i++) receiveEquipment(lord, makeEquipment('test-armor-'+i, 'armor', 0, 'chiyou-huang'));
      window.overflowAnswer = window.game.generalsView.pickReplacements(state, lord);
    });
    const roster = page.locator('.replacement-mode');
    const list = roster.locator('.roster-entries');
    assert(await list.evaluate(e=>e.scrollHeight>e.clientHeight));
    await list.evaluate(e=>e.scrollTop=e.scrollHeight);
    assert(await list.evaluate(e=>e.scrollTop>0));
    await list.evaluate(e=>e.scrollTop=0);
    await roster.locator('.inventory-cell [data-equipment-item="test-armor-0"]').click();
    await roster.locator('[data-equipment-target="liubei"][data-equipment-kind="armor"]').click();
    await roster.locator('.replacement-confirm').click();
    assert.deepEqual(await page.evaluate(()=>window.overflowAnswer),{rewards:['test-armor-20'],replaced:[],equipped:[{itemUid:'test-armor-0',generalId:'liubei'}]});
    await page.evaluate(()=>{
      const ui=window.game.ui;
      const [sample]=window.game.partyIcons(window.game.state.lords.liu,false);
      window.partyClicks=0;
      window.testIcons=['party-a','party-b','party-c'].map(id=>({...sample,id,name:id,onClick:()=>window.partyClicks++}));
      ui.renderParty(window.testIcons,'liu');
    });
    const card = id => page.locator(`[data-party-id="${id}"]`);
    const order = () => page.locator('.party-dock [data-party-id]').evaluateAll(cards=>cards.map(c=>c.dataset.partyId));
    await card('party-a').click();
    assert.equal(await page.evaluate(()=>window.partyClicks),1);
    const first = await card('party-a').boundingBox(), second = await card('party-b').boundingBox();
    await page.mouse.move(first.x+first.width/2,first.y+first.height/2);
    await page.mouse.down();
    await card('party-a').and(page.locator('.party-dragging')).waitFor();
    await page.mouse.move(second.x+second.width*.8,second.y+second.height/2,{steps:6});
    assert.deepEqual(await order(),['party-b','party-a','party-c']);
    assert.equal(await card('party-b').evaluate(e=>getComputedStyle(e).opacity),'0.58');
    await page.mouse.up();
    assert.equal(await page.evaluate(()=>window.partyClicks),1);
    await page.evaluate(()=>window.game.ui.renderParty(window.testIcons,'liu'));
    assert.deepEqual(await order(),['party-b','party-a','party-c']);
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
    assert.equal(await flight.locator('.failure-result .failure-status').count(),0);assert.equal(await flight.locator('.failure-result .flight-heading').innerText(),'突破失敗');await page.keyboard.press('Enter');
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
