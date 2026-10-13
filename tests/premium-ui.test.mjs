import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';
import JSZip from 'jszip';
const origin='http://127.0.0.1:5199';

test('Premium preferences preserve OpenAI and import a real EPUB using only the MD5 transport',async()=>{
  const preview=spawn(process.execPath,['node_modules/vite/bin/vite.js','preview','--host','127.0.0.1','--port','5199','--strictPort'],{cwd:new URL('..',import.meta.url),stdio:'ignore'});
  let browser;
  try {
    for(let i=0;i<60;i++){try{if((await fetch(origin)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
    const zip=await JSZip.loadAsync(await readFile(new URL('../public/sample.epub',import.meta.url)));
    const title='EPUB original — teste premium';
    zip.file('OEBPS/content.opf',(await zip.file('OEBPS/content.opf').async('string')).replace('A arte de ler devagar',title).replace('urn:folio:original-demo-1','urn:folio:premium-transport-test'));
    const bytes=Array.from(await zip.generateAsync({type:'uint8array'}));
    browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{})});
    const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
    // Native I/O is controlled only in this browser test. EPUB validation,
    // sanitization, import, indexing, persistence and reader are actual app code.
    await context.addInitScript(bytes=>{
      let settings={model:'gpt-5-nano',annaUrl:'https://annas-archive.gl/',hasApiKey:true,hasAnnaKey:false,supportsAnnaPremium:true,...JSON.parse(sessionStorage.getItem('__mock_premium_settings')||'{}')};
      window.__premium={saves:[],downloads:[],searches:[]};
      window.folio={
        getSettings:async()=>({...settings}),
        saveSettings:async input=>{window.__premium.saves.push(input);if(input.annaKey)settings.hasAnnaKey=true;if(input.removeAnnaKey)settings.hasAnnaKey=false;sessionStorage.setItem('__mock_premium_settings',JSON.stringify(settings));return {...settings};},
        searchCatalog:async input=>{window.__premium.searches.push(input);return {results:[{id:'0123456789abcdef0123456789abcdef',md5:'0123456789abcdef0123456789abcdef',provider:'anna',title:'EPUB original — teste premium',author:'Folio',language:'pt',format:'epub',url:'https://annas-archive.gl/md5/0123456789abcdef0123456789abcdef'}],page:1,hasMore:false};},
        downloadAnna:async md5=>{window.__premium.downloads.push(md5);return {name:'original-premium-test.epub',data:new Uint8Array(bytes),quota:{remaining:24,perDay:25}};},
        download:async()=>{throw new Error('Premium must use its MD5 endpoint.');},
        openCatalog:async()=>{},openExternal:async()=>{},exportFile:async()=>true,
        chat:async()=>{throw new Error('No paid API requests in tests.');}
      };
    },bytes);
    const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.route(/^https?:\/\/(?!127\.0\.0\.1)/,route=>route.abort());
    await page.goto(origin);
    await expect(page.getByRole('button',{name:'Ler A arte de ler devagar',exact:true})).toBeVisible();
    await page.getByRole('button',{name:'Mais',exact:true}).tap();await page.locator('.mobile-more').getByRole('button',{name:'Preferências',exact:true}).tap();
    const key=page.getByLabel('Chave premium do Anna’s Archive',{exact:true});
    await expect(key).toBeEnabled();await key.fill('FAKE-PREMIUM-KEY-NEVER-USED-ONLINE');
    await page.getByRole('button',{name:'Salvar preferências',exact:true}).tap();
    const saved=await page.evaluate(()=>window.__premium.saves[0]);
    assert.equal(saved.annaKey,'FAKE-PREMIUM-KEY-NEVER-USED-ONLINE');assert.ok(!('apiKey' in saved),'Saving Anna must not replace the OpenAI key.');
    await page.getByRole('button',{name:'Mais',exact:true}).tap();await page.locator('.mobile-more').getByRole('button',{name:'Preferências',exact:true}).tap();
    await expect(key).toHaveValue('');
    await expect(page.getByRole('checkbox',{name:'Remover a chave premium deste aparelho'})).toBeVisible();
    await page.getByRole('button',{name:'Fechar',exact:true}).tap();
    await page.getByRole('button',{name:'Descobrir livros',exact:true}).tap();
    await expect(page.getByRole('combobox',{name:'Fonte do catálogo'})).toHaveValue('anna');
    await expect(page.locator('.native-catalog-book')).toHaveCount(0);
    await page.getByRole('textbox',{name:'Buscar título ou autor no catálogo'}).fill(title);
    await page.getByRole('button',{name:'Buscar',exact:true}).tap();
    await expect(page.getByRole('button',{name:'Baixar premium',exact:true})).toBeVisible();
    await page.getByRole('button',{name:'Baixar premium',exact:true}).tap();
    await expect(page.getByRole('button',{name:`Ler ${title}`,exact:true})).toBeVisible();
    assert.deepEqual(await page.evaluate(()=>window.__premium.downloads),['0123456789abcdef0123456789abcdef']);
    assert.ok(!(await page.evaluate(()=>JSON.stringify(window.__premium.searches))).includes('FAKE-PREMIUM'));
    await page.reload();await page.getByRole('button',{name:`Ler ${title}`,exact:true}).tap();
    await expect(page.frameLocator('.epub-container iframe').first().locator('h1')).toHaveText('Um lugar para a atenção');
    await page.getByRole('button',{name:'Biblioteca',exact:true}).tap();
    await page.getByRole('button',{name:'Mais',exact:true}).tap();await page.locator('.mobile-more').getByRole('button',{name:'Preferências',exact:true}).tap();
    await page.getByRole('checkbox',{name:'Remover a chave premium deste aparelho'}).check();
    await page.getByRole('button',{name:'Salvar preferências',exact:true}).tap();
    assert.equal(await page.evaluate(()=>window.__premium.saves.at(-1).removeAnnaKey),true);
    await page.getByRole('button',{name:'Mais',exact:true}).tap();await page.locator('.mobile-more').getByRole('button',{name:'Preferências',exact:true}).tap();
    await expect(page.getByRole('checkbox',{name:'Remover a chave premium deste aparelho'})).toHaveCount(0);
    assert.deepEqual(errors,[]);
  } finally {await browser?.close();preview.kill();}
});
