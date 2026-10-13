import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {chromium,expect} from '@playwright/test';
test('Neural voice download selects the offline model and passes it to native narration',async()=>{
 const origin='http://127.0.0.1:5216';const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','preview','--host','127.0.0.1','--port','5216','--strictPort'],{stdio:'ignore'});let browser;
 try{
  for(let i=0;i<60;i++){try{if((await fetch(origin)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
  browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{})});
  const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});let errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{
   window.voiceReady=false;window.voiceCalls=[];
   window.folio={getSettings:async()=>({model:'gpt-5-nano',annaUrl:'https://annas-archive.gl',hasApiKey:false}),neuralVoices:async()=>({voices:[{id:'faber-pt-br',name:'Faber · português do Brasil',language:'pt-BR',bytes:67183065,installed:window.voiceReady}]}),downloadNeuralVoice:async(id)=>{window.dispatchEvent(new CustomEvent('folio-neural-download',{detail:{id,percent:45}}));window.voiceReady=true;window.dispatchEvent(new CustomEvent('folio-neural-download',{detail:{id,percent:100}}));},speechVoices:async()=>({voices:window.voiceReady?[{id:'neural:faber-pt-br',name:'Faber · neural',language:'pt-BR',network:false}]:[]}),speak:async(text,options)=>window.voiceCalls.push({text,...options}),stopSpeaking:async()=>{}};
  });
  await page.goto(origin);await page.getByRole('button',{name:'Ler A arte de ler devagar',exact:true}).click();
  await expect(page.frameLocator('.epub-container iframe').first().locator('h1')).toHaveText('Um lugar para a atenção');
  await page.getByRole('button',{name:'Ler capítulo em voz alta'}).click();const player=page.getByRole('dialog',{name:'Ouvir livro'});
  await player.getByRole('button',{name:'Opções de áudio',exact:true}).click();const settings=page.getByRole('dialog',{name:'Configurar áudio'});
  await settings.getByRole('button',{name:/^Baixar voz:/}).click();await expect(settings.getByLabel('Voz',{exact:true})).toHaveValue('neural:faber-pt-br');
  await expect(settings.getByRole('button',{name:/^Usar voz:/})).toBeEnabled();
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await page.screenshot({path:'research/neural-voices-mobile.png',fullPage:true});
  await settings.getByRole('button',{name:'Fechar opções de áudio',exact:true}).click();await player.getByRole('button',{name:'Ouvir',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>window.voiceCalls.length)).toBeGreaterThan(0);
  assert.equal(await page.evaluate(()=>window.voiceCalls.at(-1).voice),'neural:faber-pt-br');assert.deepEqual(errors,[]);
 }finally{await browser?.close();server.kill();}
});
