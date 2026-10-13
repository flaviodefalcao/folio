import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {chromium,expect} from '@playwright/test';
import JSZip from 'jszip';
const origin='http://127.0.0.1:5202';

test('Integrated search returns native results, shows real link choices and imports the selected EPUB',async()=>{
 const preview=spawn(process.execPath,['node_modules/vite/bin/vite.js','preview','--host','127.0.0.1','--port','5202','--strictPort'],{cwd:new URL('..',import.meta.url),stdio:'ignore'});
 let browser;
 try{
  for(let i=0;i<60;i++){try{if((await fetch(origin)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
  const zip=await JSZip.loadAsync(await readFile(new URL('../public/sample.epub',import.meta.url)));
  const title='Livro original — fluxo de links';
  zip.file('OEBPS/content.opf',(await zip.file('OEBPS/content.opf').async('string')).replace('A arte de ler devagar',title).replace('urn:folio:original-demo-1','urn:folio:catalog-links-test'));
  const bytes=Array.from(await zip.generateAsync({type:'uint8array'}));
  browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{})});
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  await context.addInitScript(bytes=>{
   const hash='0123456789abcdef0123456789abcdef';
   window.__flow={opened:[],downloaded:[],oldSearchCalls:0};
   window.folio={
    getSettings:async()=>({model:'gpt-5-nano',annaUrl:'https://annas-archive.gl',hasApiKey:false,hasAnnaKey:true,supportsAnnaPremium:true,supportsIntegratedCatalog:true}),
    searchCatalog:async()=>{window.__flow.oldSearchCalls++;throw new Error('Failed HTTP login must not be required.');},
    openCatalog:async(url,options)=>{window.__flow.opened.push({url,options});if(options?.collect==='search')window.dispatchEvent(new CustomEvent('folio-catalog-results',{detail:{results:[{id:hash,md5:hash,title:'Livro original — fluxo de links',author:'Folio',format:'epub',language:'pt',url:'https://annas-archive.gl/md5/'+hash}],page:1,hasMore:false,query:new URL(url).searchParams.get('q')}}));},
    catalogLinks:async url=>({options:[{id:'server2',label:'Servidor premium 2',url:'https://annas-archive.gl/fast_download/'+hash+'/1/2',kind:'premium',pathIndex:1,domainIndex:2},{id:'public',label:'EPUB direto',url:'https://books.example/book.epub',kind:'direct'}],sourceUrl:url}),
    downloadAnna:async(md5,options)=>{window.__flow.downloaded.push({md5,options});return {name:'original-link-test.epub',data:new Uint8Array(bytes)};},
    saveSettings:async()=>{},openExternal:async()=>{},exportFile:async()=>true
   };
  },bytes);
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route(/^https?:\/\/(?!127\.0\.0\.1)/,r=>r.abort());
  await page.goto(origin);await expect(page.getByRole('button',{name:'Ler A arte de ler devagar',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Descobrir livros',exact:true}).tap();
  const query=page.getByRole('textbox',{name:'Buscar título ou autor no catálogo'});await query.fill(title);
  assert.ok((await query.boundingBox()).y<200,'Search appears near the top of the mobile screen.');
  await page.getByRole('button',{name:'Buscar',exact:true}).tap();
  await expect(page.locator('.native-catalog-book h3')).toHaveText(title);
  assert.equal(await page.evaluate(()=>window.__flow.oldSearchCalls),0);
  const open=await page.evaluate(()=>window.__flow.opened[0]);assert.equal(open.options.collect,'search');assert.equal(new URL(open.url).searchParams.get('q'),title);
  await page.screenshot({path:new URL('../research/catalog-v040-results.png',import.meta.url).pathname,fullPage:true});
  await page.getByRole('button',{name:'Ver links',exact:true}).tap();
  await expect(page.getByRole('dialog')).toBeVisible();await expect(page.locator('.download-option')).toHaveCount(2);
  await expect(page.getByText('https://books.example/book.epub',{exact:true})).toBeVisible();
  await page.screenshot({path:new URL('../research/catalog-v040-links.png',import.meta.url).pathname,fullPage:true});
  await page.locator('.download-option').filter({hasText:'Servidor premium 2'}).getByRole('button',{name:'Baixar para biblioteca',exact:true}).tap();
  await expect(page.getByRole('button',{name:`Ler ${title}`,exact:true})).toBeVisible();
  assert.deepEqual(await page.evaluate(()=>window.__flow.downloaded),[{md5:'0123456789abcdef0123456789abcdef',options:{pathIndex:1,domainIndex:2}}]);
  await page.reload();await page.getByRole('button',{name:`Ler ${title}`,exact:true}).tap();
  await expect(page.frameLocator('.epub-container iframe').first().locator('h1')).toHaveText('Um lugar para a atenção');
  assert.deepEqual(errors,[]);
 }finally{await browser?.close();preview.kill();}
});
