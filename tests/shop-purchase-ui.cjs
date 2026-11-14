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


for(const kind of ['treasure','herb','forge','library','beast','merchant']){
 await page.evaluate(k=>openShop(k),kind);await page.waitForTimeout(200);const row=page.locator('.shop-row').first(),icon=row.locator('.sr-icon'),sign=row.locator('.shop-product-sign'),button=row.locator('.sr-actions button').first();const index=Number(await row.getAttribute('data-offer-index')),before=await icon.boundingBox(),color=await sign.evaluate(e=>getComputedStyle(e).color);
 await button.click();await page.waitForFunction(()=>answer?.type==='buy');assert(await icon.isHidden(),kind+' pending image remains');
 await page.evaluate(index=>{window.answer=null;data={...data,sold:[index]};void f.panel.ask(f.lord,data).then(a=>window.answer=a)},index);
 assert(await icon.isHidden(),kind+' sold image remains');assert.equal(await button.textContent(),'售罄');assert(await button.isDisabled());assert.equal(await sign.evaluate(e=>getComputedStyle(e).opacity),'1');assert.equal(await sign.evaluate(e=>getComputedStyle(e).color),color);
 const after=await icon.evaluate(e=>e.getBoundingClientRect().toJSON());assert(Math.abs(before.x-after.x)<1&&Math.abs(before.y-after.y)<1,kind+' shelf shifted: '+JSON.stringify({before,after}));
 await page.evaluate(()=>f.panel.render());const soldRow=page.locator('.shop-row[data-offer-index="'+index+'"]');assert(await soldRow.locator('.sr-icon').isHidden());assert.equal(await soldRow.locator('.sr-actions button').first().textContent(),'售罄');
 const next=page.locator('.shop-row:not(.sold)').first(),nextIcon=next.locator('.sr-icon');await next.locator('.sr-actions button').first().click();await page.waitForFunction(()=>answer?.type==='buy');assert(await nextIcon.isHidden());await page.evaluate(()=>{window.answer=null;void f.panel.ask(f.lord,data).then(a=>window.answer=a)});assert(await nextIcon.isVisible(),kind+' rejected purchase did not restore image');
 await capture('sold-'+kind+'.png');await page.evaluate(()=>f.panel.close());
}
assert.deepEqual(errors,[]);console.log('PASS six shops: sold image disappears, plaque retains color, sold button, stable shelf layout, rerender and rejected transaction restore');
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exit(1)});
