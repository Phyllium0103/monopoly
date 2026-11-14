const {chromium}=require('C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});try{
const capture=async name=>{if(process.env.UI_SCREENSHOTS){const fs=require('node:fs'),path=require('node:path');fs.mkdirSync(process.env.UI_SCREENSHOTS,{recursive:true});await page.screenshot({path:path.join(process.env.UI_SCREENSHOTS,path.basename(name))});}};
const page=await browser.newPage({viewport:{width:1600,height:960}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.route('**/__trade_review',r=>r.fulfill({contentType:'text/html',body:'<html><head><link rel="stylesheet" href="/src/style.css"></head><body><div id="ui"></div></body></html>'}));
await page.goto((process.env.UI_TEST_URL||'http://127.0.0.1:5175')+'/__trade_review');
await page.evaluate(async()=>{
const [{GameUI},{Dialog},{ShopPanel},{GeneralsView},{createGameState},shop,items]=await Promise.all([import('/src/ui/GameUI.ts'),import('/src/ui/Dialog.ts'),import('/src/ui/ShopView.ts'),import('/src/ui/GeneralsView.ts'),import('/src/game/GameState.ts'),import('/src/systems/ShopSystem.ts'),import('/src/data/items.ts')]);
const root=document.querySelector('#ui'),ui=new GameUI(root);ui.show();const state=createGameState('liu'),lord=state.lords.liu,dialog=new Dialog(root),roster=new GeneralsView(root);lord.stones=15000000;lord.items=Object.keys(items.ITEM_DEFS).map((id,i)=>items.makeItem('item'+i,id,0));lord.gear.push(items.makeEquipment('armor','armor',0));lord.scrolls.push(items.makeTechnique('scroll',0,'fire'));
const panel=new ShopPanel(dialog,g=>roster.inspectionCard(state,lord,g));window.f={state,lord,panel,shop,items,roster,ui};window.openShop=kind=>{panel.close();window.answer=null;const data={shopKind:kind,offers:shop.makeStock(state,lord,kind),sellStock:shop.makeSellStock(lord,kind),sold:[],refreshes:0,recruited:0,recruitLimit:1,revivedOther:false};window.data=data;void panel.ask(lord,data).then(a=>window.answer=a)};
await document.fonts.load('22px "Folio WenKai"');await document.fonts.load('40px "Folio Title"');
});
await page.evaluate(async()=>{f.training=await import('/src/systems/TrainingSystem.ts');const{TrainingPanel}=await import('/src/ui/TrainingView.ts');f.academy=new TrainingPanel(f.panel.dialog);f.fmt=(await import('/src/game/Currency.ts')).fmtStones});

for(const size of [{width:1600,height:960},{width:1280,height:720}]){
 await page.setViewportSize(size);
 for(const kind of ['tavern','herb']){
  await page.evaluate(kind=>{if(kind==='herb'){for(const g of Object.values(f.state.generals).slice(0,7)){g.status='dead';g.owner=null;g.lastOwner='liu'}}openShop(kind);if(kind==='herb'){f.panel.session.tab='還魂';f.panel.render()}},kind);
  const row=page.locator('.shop-row[data-kind='+ (kind==='herb'?'revive':'general')+']').first();
  if(kind==='herb'){
   assert(await row.locator('.sr-actions').isHidden());assert(await row.locator('.sr-price').isHidden());
   await row.locator('.sr-icon').hover();assert(await page.locator('#item-detail-popover').isVisible());assert((await page.locator('#item-detail-popover').textContent()).includes('還魂價格'));await page.mouse.move(1,1);
  }
  await row.locator('.sr-icon').click();const book=page.locator('.shop-detail .dossier-book'),close=book.locator('>.shop-detail-close');assert(await close.isVisible());
  const position=await close.evaluate(x=>{const b=x.parentElement.getBoundingClientRect(),r=x.getBoundingClientRect();return{top:r.top-b.top,right:b.right-r.right,width:r.width,height:r.height}});assert(Math.abs(position.top-30)<1);assert(Math.abs(position.right-48)<1);assert.equal(position.width,48);assert.equal(position.height,48);
  assert((await book.locator('.dossier-recruit-price').textContent()).includes(kind==='herb'?'還魂':'招募'));
  const bookmark=page.locator('.shop-detail-actions .btn').first();assert(await bookmark.isVisible());assert((await bookmark.textContent()).includes(kind==='herb'?'復活':'招募'));
  await capture('person-'+kind+'-'+size.width+'.png');await close.click();assert(await page.locator('.shop-detail').isHidden());
  await row.locator('.sr-icon').click();await page.locator('.shop-detail-actions .btn').first().click();await page.waitForFunction(()=>answer?.type==='buy');assert.equal(await page.evaluate(()=>answer.index),Number(await row.getAttribute('data-offer-index')));await page.evaluate(()=>f.panel.close());
 }
}
assert.deepEqual(errors,[]);console.log('PASS book-corner X, revival image-only price, inner price and bookmark-only buy flow at both sizes');
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exit(1)});
