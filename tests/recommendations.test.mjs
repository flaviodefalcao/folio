import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {chromium,expect} from '@playwright/test';
import JSZip from 'jszip';
const origin='http://127.0.0.1:5217';
const escape=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
async function workbook(rows){
 const z=new JSZip();z.file('xl/workbook.xml','<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Livros" r:id="rId10"/></sheets></workbook>');
 z.file('xl/_rels/workbook.xml.rels','<Relationships><Relationship Id="rId10" Target="worksheets/sheet10.xml"/></Relationships>');
 const headers=['Link','Título','Autor','Título original','Data sugerida','Tema','Por que ler','Ligação com os artigos','EPUB'];
 z.file('xl/worksheets/sheet10.xml','<worksheet><sheetData>'+[headers,...rows].map((row,i)=>'<row>'+row.map((s,j)=>`<c r="${String.fromCharCode(65+j)}${i+1}" t="inlineStr"><is><t>${escape(s)}</t></is></c>`).join('')+'</row>').join('')+'</sheetData></worksheet>');
 return z.generateAsync({type:'base64'});
}
test('Entrelinhas updates suggestions, imports a matching EPUB once, rejects a different book and opens inside Folio',async()=>{
 const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5217','--strictPort'],{stdio:'ignore'});let browser;
 try{
  for(let i=0;i<60;i++){try{if((await fetch(origin)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
  const original=await readFile(new URL('../public/sample.epub',import.meta.url));const zip=await JSZip.loadAsync(original);
  const opf=Object.keys(zip.files).find(p=>p.endsWith('.opf'));zip.file(opf,(await zip.file(opf).async('string')).replace('A arte de ler devagar','Uma ideia entre linhas'));
  const book=Array.from(await zip.generateAsync({type:'uint8array'}));
  const feed=await workbook([
   ['https://publisher.example/book','Uma ideia entre linhas','Folio','The Spaces Between Lines','14/10/2026','Cultura & ideias','Um exemplo original para testar leitura e aprendizado.','Relaciona leitura e atenção.',''],
   ['https://publisher.example/other','Outro livro diferente','Outro Autor','','14/10/2026','Ciência','Não importar arquivo errado.','','https://books.example/wrong.epub'],
   ['https://publisher.example/missing','Livro sem arquivo','Uma Pessoa','','13/10/2026','Sociedade','Uma indicação sem arquivo.','',''],
   ['https://publisher.example/existing','A arte de ler devagar','Folio','','12/10/2026','Cultura','Já disponível.','','https://books.example/existing.epub'],
  ]);
  browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{})});
  const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(({feed,book})=>{
   window.__rec={opened:0,downloaded:[],searched:[]};
   window.folio={getSettings:async()=>({model:'gpt-5-nano',annaUrl:'https://annas-archive.gl',hasApiKey:false,hasAnnaKey:true}),recommendationsFeed:async()=>({base64:feed}),openRecommendations:async()=>{window.__rec.opened++;},download:async url=>{window.__rec.downloaded.push(url);return {name:'test.epub',data:new Uint8Array(book)};},downloadAnna:async md5=>{window.__rec.downloaded.push('anna:'+md5);return {name:'premium.epub',data:new Uint8Array(book),quota:{remaining:5,perDay:10}};},searchCatalog:async({query})=>{window.__rec.searched.push(query);return {results:query==='The Spaces Between Lines Folio'?[{id:'wrong',title:query,author:'Autor errado',format:'epub'},{id:'0123456789abcdef0123456789abcdef',md5:'0123456789abcdef0123456789abcdef',title:'The Spaces Between Lines',author:'Folio',format:'epub'}]:[],page:1,hasMore:false};}};
  },{feed,book});
  await page.route(/^https?:\/\/(?!127\.0\.0\.1)/,r=>r.abort());
  await page.goto(origin);
  await expect(page.getByRole('button',{name:'Ler Uma ideia entre linhas',exact:true})).toBeVisible({timeout:15000});
  assert.deepEqual(await page.evaluate(()=>window.__rec.downloaded),['anna:0123456789abcdef0123456789abcdef','https://books.example/wrong.epub']);
  assert.ok((await page.evaluate(()=>window.__rec.searched)).includes('The Spaces Between Lines Folio'));
  await page.getByRole('button',{name:'Recomendações',exact:true}).click();await expect.poll(()=>page.evaluate(()=>window.__rec.opened)).toBe(1);
  await page.getByRole('tab',{name:/Livros sugeridos/}).click();
  await expect(page.locator('.recommendation-list article')).toHaveCount(4);
  await expect(page.getByText('Título ou autor do arquivo não corresponde à recomendação. O livro não foi adicionado.')).toBeVisible();
  await expect(page.locator('.recommendation-list article').filter({hasText:'Livro sem arquivo'})).toContainText('Nenhum EPUB com título e autor');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await page.screenshot({path:'research/recommendations-mobile.png',fullPage:true});
  await page.locator('.recommendation-list article').filter({hasText:'Livro sem arquivo'}).getByRole('button',{name:'Procurar EPUB'}).click();
  await expect(page.getByRole('textbox',{name:'Buscar título ou autor no catálogo'})).toHaveValue('Livro sem arquivo');
  const cached=await page.evaluate(async()=>{const {loadBooks}=await import('/src/books.ts');return (await loadBooks()).map(b=>({title:b.title,collection:b.collection}));});
  assert.equal(cached.filter(b=>b.title==='Uma ideia entre linhas').length,1);assert.equal(cached.find(b=>b.title==='Uma ideia entre linhas').collection,'Entrelinhas');assert.equal(cached.length,2);
  await page.reload();await expect(page.getByRole('button',{name:'Ler Uma ideia entre linhas',exact:true})).toBeVisible();assert.deepEqual(await page.evaluate(()=>window.__rec.downloaded),[]);
  assert.deepEqual(errors,[]);
 }finally{await browser?.close();server.kill();}
});
test('Feed parser preserves hyperlinks without evaluating formulas, rejects unsafe links and requires exact title plus author',async()=>{
 const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5218','--strictPort'],{stdio:'ignore'});let browser;
 try{
  for(let i=0;i<60;i++){try{if((await fetch('http://127.0.0.1:5218')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
  const base64=await workbook([['javascript:alert(1)','Árvores: uma história','Maria Silva','','14/10/2026','Cultura','Resumo','','http://private.test/a.epub']]);
  const z=await JSZip.loadAsync(base64,{base64:true});z.file('xl/worksheets/sheet10.xml',(await z.file('xl/worksheets/sheet10.xml').async('string')).replace('<c r="I2" t="inlineStr"><is><t>http://private.test/a.epub</t></is></c>','<c r="I2"><f>HYPERLINK("https://books.example/arvores.epub","Download")</f><v>Download</v></c>'));
  // Daily suggestions live in a different sheet, often with numeric Excel dates.
  z.file('xl/workbook.xml',(await z.file('xl/workbook.xml').async('string')).replace('</sheets>','<sheet name="Livros do dia" r:id="rId9"/></sheets>'));
  z.file('xl/_rels/workbook.xml.rels',(await z.file('xl/_rels/workbook.xml.rels').async('string')).replace('</Relationships>','<Relationship Id="rId9" Target="worksheets/sheet9.xml"/></Relationships>'));
  z.file('xl/worksheets/sheet9.xml',(await z.file('xl/worksheets/sheet10.xml').async('string')).replace('Árvores: uma história','Uma novidade').replace('14/10/2026','46309.0'));
  const input=await z.generateAsync({type:'base64'});
  browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{})});const page=await browser.newPage();
  await page.route('http://127.0.0.1:5218/',r=>r.fulfill({body:'<!doctype html><title>Parser test</title>',contentType:'text/html'}));await page.goto('http://127.0.0.1:5218/');
  const parsed=await page.evaluate(async b=>{const m=await import('/src/recommendations.ts');const data=Uint8Array.from(atob(b),c=>c.charCodeAt(0));const all=await m.parseRecommendations(data.buffer);const item=all.find(x=>x.title.startsWith("Árvores"));return {count:all.length,daily:all.find(x=>x.title==="Uma novidade").date,item,yes:m.sameBook(item,{title:'Arvores',author:'Silva, Maria'}),no:m.sameBook(item,{title:'Árvores',author:'Outro Autor'}),partial:m.sameBook(item,{title:'Árvores e florestas',author:'Maria Silva'}),bad:m.httpsLink('https://user:secret@example.com/a.epub')};},input);
  assert.equal(parsed.count,2);assert.equal(parsed.daily,'14/10/2026');assert.equal(parsed.item.url,'');assert.equal(parsed.item.epubUrl,'https://books.example/arvores.epub');assert.equal(parsed.yes,true);assert.equal(parsed.no,false);assert.equal(parsed.partial,false);assert.equal(parsed.bad,'');
 }finally{await browser?.close();server.kill();}
});
