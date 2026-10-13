import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {chromium,expect} from '@playwright/test';
const origin='http://127.0.0.1:5201';
test('Mobile library independently collapses its reading card and remembers the compact header',async()=>{
 const preview=spawn(process.execPath,['node_modules/vite/bin/vite.js','preview','--host','127.0.0.1','--port','5201','--strictPort'],{cwd:new URL('..',import.meta.url),stdio:'ignore'});
 let browser;
 try{
  for(let i=0;i<60;i++){try{if((await fetch(origin)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
  browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{})});
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin);await page.getByRole("button",{name:"Visualização da biblioteca",exact:true}).click();await page.getByLabel("Visual minimalista",{exact:true}).uncheck();await page.getByRole("button",{name:"Pronto",exact:true}).click();await page.getByRole('button',{name:'Ler A arte de ler devagar',exact:true}).tap();
  await expect(page.frameLocator('.epub-container iframe').first().locator('h1')).toHaveText('Um lugar para a atenção');
  await page.getByRole('button',{name:'Biblioteca',exact:true}).tap();
  await expect(page.locator('.continue-card')).toBeVisible();
  const expanded=(await page.locator('.continue-card').boundingBox()).height;
  await page.getByRole('button',{name:'Compactar biblioteca',exact:true}).tap();
  await expect(page.locator('.library-content')).toHaveClass(/library-compact/);
  await expect(page.locator('.continue-card')).toHaveClass(/is-compact/);
  const collapsed=(await page.locator('.continue-card').boundingBox()).height;
  assert.ok(collapsed<expanded-70);assert.ok(collapsed<=120);
  await expect(page.getByText('Boas histórias merecem um lugar só seu.',{exact:true})).toBeHidden();
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await page.screenshot({path:new URL('../research/library-compact-mobile.png',import.meta.url).pathname,fullPage:true});
  await page.getByRole('button',{name:'Expandir cartão de leitura',exact:true}).tap();
  await expect(page.locator('.continue-card')).not.toHaveClass(/is-compact/);
  await expect(page.locator('.library-content')).toHaveClass(/library-compact/);
  await page.getByRole('button',{name:'Recolher cartão de leitura',exact:true}).tap();
  await page.reload();await expect(page.getByRole('button',{name:'Expandir biblioteca',exact:true})).toBeVisible();
  await expect(page.locator('.continue-card')).toHaveClass(/is-compact/);
  await page.getByRole('button',{name:'Expandir biblioteca',exact:true}).tap();
  await expect(page.getByText('Boas histórias merecem um lugar só seu.',{exact:true})).toBeVisible();
  await expect(page.locator('.continue-card')).not.toHaveClass(/is-compact/);
  assert.deepEqual(errors,[]);
 }finally{await browser?.close();preview.kill();}
});
