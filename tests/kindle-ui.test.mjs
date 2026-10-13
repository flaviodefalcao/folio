import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {chromium,expect} from '@playwright/test';
const origin='http://127.0.0.1:5214';
test('Kindle transfer prepares only selected EPUBs, shows OPDS steps and closes sharing',async()=>{
 const preview=spawn(process.execPath,['node_modules/vite/bin/vite.js','preview','--host','127.0.0.1','--port','5214','--strictPort'],{cwd:new URL('..',import.meta.url),stdio:'ignore'});let browser;
 try{
  for(let i=0;i<60;i++){try{if((await fetch(origin)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
  browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{})});
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  await context.addInitScript(()=>{
   window.transfer=[];window.shareRunning=false;
   window.folio={getSettings:async()=>({model:'gpt-5-nano',annaUrl:'https://annas-archive.gl',hasApiKey:false}),beginKindleShare:async()=>{window.transfer=[];},putKindleBook:async(input)=>window.transfer.push(input),startKindleShare:async()=>{window.shareRunning=true;return {url:'http://192.168.1.2:12345/test-session/opds',expiresAt:Date.now()+900000};},stopKindleShare:async()=>{window.shareRunning=false;},kindleShareStatus:async()=>({running:window.shareRunning})};
  });
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(origin);
  await expect(page.getByRole('button',{name:'Ler A arte de ler devagar',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Mais',exact:true}).tap();await page.getByRole('button',{name:'Conectar Kindle',exact:true}).tap();
  await page.getByRole('checkbox').first().check();await page.getByRole('button',{name:'Compartilhar 1 livro(s)',exact:true}).tap();
  await expect(page.getByLabel('Endereço OPDS')).toHaveValue(/\/opds$/);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  const verified=await page.evaluate(async()=>{
   const chunks=window.transfer;let raw='';for(const chunk of chunks)raw+=atob(chunk.base64);
   const bytes=Uint8Array.from(raw,c=>c.charCodeAt(0));const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
   return {sameHash:chunks.every(chunk=>chunk.id===hash),complete:chunks.at(-1).complete,startsAtZero:chunks[0].offset===0,bytes:bytes.length};
  });assert.ok(verified.sameHash&&verified.complete&&verified.startsAtZero&&verified.bytes>0);
  await page.screenshot({path:new URL('../research/kindle-connect-mobile.png',import.meta.url).pathname,fullPage:true});
  await page.getByRole('button',{name:'Encerrar compartilhamento',exact:true}).tap();await expect(page.getByLabel('Endereço OPDS')).toHaveCount(0);assert.equal(await page.evaluate(()=>window.shareRunning),false);assert.deepEqual(errors,[]);
 }finally{await browser?.close();preview.kill();}
});
