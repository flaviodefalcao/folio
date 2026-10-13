import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chromium, expect } from '@playwright/test';
import { readFile,mkdir } from 'node:fs/promises';
import JSZip from 'jszip';
const origin='http://127.0.0.1:5197';

test('Mobile catalog searches the actual local seed and imports real EPUB bytes through a controlled transport',async()=>{
  const preview=spawn(process.execPath,['node_modules/vite/bin/vite.js','preview','--host','127.0.0.1','--port','5197','--strictPort'],{cwd:new URL('..',import.meta.url),stdio:'ignore'});
  let browser;
  try {
    for(let i=0;i<60;i++){try{if((await fetch(origin)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
    const zip=await JSZip.loadAsync(await readFile(new URL('../public/sample.epub',import.meta.url)));
    const fixtureTitle='Leitura do catálogo — teste de transporte';
    zip.file('OEBPS/content.opf',(await zip.file('OEBPS/content.opf').async('string')).replace('A arte de ler devagar',fixtureTitle).replace('urn:folio:original-demo-1','urn:folio:catalog-transport-test'));
    const bytes=Array.from(await zip.generateAsync({type:'uint8array'}));
    browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{})});
    const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true});
    // Only native I/O transport is simulated. Import, XML parsing, sanitization, indexing and persistence are real app code.
    await context.addInitScript(bytes=>{
      window.__testDownloads=[];window.__testCatalogRequests=[];window.__testOpenedCatalog=[];window.__testRemoteSearches=0;
      window.folio={
        getSettings:async()=>({model:'gpt-5-nano',annaUrl:'https://annas-archive.gl',hasApiKey:false}),
        saveSettings:async()=>({model:'gpt-5-nano',annaUrl:'https://annas-archive.gl',hasApiKey:false}),
        download:async url=>{window.__testDownloads.push(url);return {name:'original-demo-test.epub',data:new Uint8Array(bytes)};},
        searchBooks:async()=>{window.__testRemoteSearches++;throw new Error('Online transport deliberately unavailable in the offline test.');},
        searchCatalog:async input=>{window.__testCatalogRequests.push(input);return {results:[],page:input.page,hasMore:false,challenge:true,provider:'anna',query:input.query};},
        openCatalog:async url=>{window.__testOpenedCatalog.push(url);},
        openExternal:async()=>{},exportFile:async()=>true,
        chat:async()=>{throw new Error('No paid API requests in tests.');}
      };
    },bytes);
    const page=await context.newPage();const errors=[];let remoteSearches=0;
    page.on('pageerror',e=>errors.push(e.message));
    page.on('request',r=>{if(r.url().includes('gutendex.com/books'))remoteSearches++;});
    await page.route(/^https?:\/\/(?!127\.0\.0\.1)/,route=>route.abort());
    await page.goto(origin);
    await expect(page.getByRole('button',{name:'Ler A arte de ler devagar',exact:true})).toBeVisible();
    await page.getByRole('button',{name:'Descobrir livros',exact:true}).tap();
    await expect(page.locator('.native-catalog-book')).toHaveCount(32);
    await expect(page.locator('.catalog-results-heading')).toContainText('32 clássicos em português');
    const input=page.getByRole('textbox',{name:'Buscar título ou autor no catálogo'});
    await input.fill('DÓM CÁSMURRO');await page.getByRole('button',{name:'Buscar',exact:true}).tap();
    await expect(page.locator('.native-catalog-book')).toHaveCount(1);
    await expect(page.locator('.native-catalog-book h3')).toHaveText('Dom Casmurro');
    await input.fill('MACHÁDO DE ASSÍS');await page.getByRole('button',{name:'Buscar',exact:true}).tap();
    assert.ok(await page.locator('.native-catalog-book').count()>1);
    const authors=await page.locator('.catalog-book-copy > p').allTextContents();
    assert.ok(authors.every(a=>/Machado de Assis/i.test(a)));
    assert.equal(remoteSearches,0,'Known titles and author searches use the bundled catalog without the remote API.');
    assert.equal(await page.evaluate(()=>window.__testRemoteSearches),0,'Known local queries do not invoke the native remote-search transport either.');
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    await mkdir(new URL('../research',import.meta.url),{recursive:true});
    await page.screenshot({path:new URL('../research/catalog-local-mobile.png',import.meta.url).pathname,fullPage:true});
    await input.fill('Dom Casmurro');await page.getByRole('button',{name:'Buscar',exact:true}).tap();
    await page.getByRole('button',{name:'Adicionar à biblioteca',exact:true}).tap();
    await expect(page.getByRole('button',{name:`Ler ${fixtureTitle}`,exact:true})).toBeVisible();
    assert.deepEqual(await page.evaluate(()=>window.__testDownloads),['https://www.gutenberg.org/ebooks/55752.epub3.images']);
    await page.reload();await expect(page.getByRole('button',{name:`Ler ${fixtureTitle}`,exact:true})).toBeVisible();
    await page.getByRole('button',{name:`Ler ${fixtureTitle}`,exact:true}).tap();
    await expect(page.locator('.reader-loading')).toHaveCount(0);
    await expect(page.frameLocator('.epub-container iframe').first().locator('h1')).toHaveText('Um lugar para a atenção');
    await page.getByRole('button',{name:'Biblioteca',exact:true}).tap();
    await page.getByRole('button',{name:'Descobrir livros',exact:true}).tap();
    await page.getByRole('combobox',{name:'Fonte do catálogo'}).selectOption('anna');
    await page.getByRole('textbox',{name:'Buscar título ou autor no catálogo'}).fill('Bibliotecas');
    await page.getByRole('button',{name:'Buscar',exact:true}).tap();
    await expect(page.getByRole('heading',{name:'O catálogo pediu uma verificação'})).toBeVisible();
    assert.deepEqual(await page.evaluate(()=>window.__testCatalogRequests),[{query:'Bibliotecas',language:'pt',format:'epub',page:1}]);
    await page.getByRole('button',{name:'Abrir busca dentro do app'}).tap();
    const inside=await page.evaluate(()=>window.__testOpenedCatalog);
    const target=new URL(inside[0]);assert.equal(target.hostname,'annas-archive.gl');assert.equal(target.searchParams.get('q'),'Bibliotecas');assert.equal(target.searchParams.get('ext'),'epub');
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    await page.screenshot({path:new URL('../research/catalog-challenge-controlled-transport.png',import.meta.url).pathname,fullPage:true});
    assert.deepEqual(errors,[]);
  } finally {await browser?.close();preview.kill();}
});
