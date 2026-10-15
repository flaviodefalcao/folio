import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readdirSync,existsSync} from 'node:fs';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {chromium,expect} from '@playwright/test';
let executablePath=process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
if(!executablePath){const cache=join(homedir(),'Library/Caches/ms-playwright');if(existsSync(cache))for(const folder of readdirSync(cache).filter(s=>s.startsWith('chromium_headless_shell-')).sort().reverse()){const candidate=join(cache,folder,'chrome-headless-shell-mac-arm64/chrome-headless-shell');if(existsSync(candidate)){executablePath=candidate;break;}}}
test('Mobile pages reserve only one navigation height and end immediately after their content',async()=>{
 const origin='http://127.0.0.1:5235';const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5235','--strictPort'],{stdio:'ignore'});let browser;
 try{
  for(let i=0;i<60;i++){try{if((await fetch(origin)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
  browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{})});
  const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  await page.route(/^https?:\/\/(?!127\.0\.0\.1)/,r=>r.abort());
  await page.goto(origin);await expect(page.getByRole('button',{name:'Ler A arte de ler devagar',exact:true})).toBeVisible();
  assert.ok(await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight+1),'A short page must not create an empty scroll range');
  await page.evaluate(async()=>{const {loadBooks,saveBook}=await import('/src/books.ts');const [book]=await loadBooks();for(let i=0;i<14;i++)await saveBook({...book,id:`scroll-fixture-${i}`,title:`Livro ${i}`});});
  await page.reload();await expect(page.locator('.book-card')).toHaveCount(15);
  async function checkEnd(label){
   await page.evaluate(()=>scrollTo(0,document.documentElement.scrollHeight));
   const metrics=await page.evaluate(()=>{const content=document.querySelector('.library-content');const main=document.querySelector('.main-library');const shell=document.querySelector('.app-shell');const nav=document.querySelector('.mobile-navigation');return {shell:parseFloat(getComputedStyle(shell).paddingBottom),main:parseFloat(getComputedStyle(main).paddingBottom),content:parseFloat(getComputedStyle(content).paddingBottom),nav:nav.getBoundingClientRect().height,contentEnd:content.getBoundingClientRect().bottom,mainEnd:main.getBoundingClientRect().bottom,navTop:nav.getBoundingClientRect().top,overflow:document.documentElement.scrollWidth>innerWidth+1};});
   assert.equal(metrics.shell,0,label);assert.equal(metrics.content,16,label);assert.ok(Math.abs(metrics.main-metrics.nav)<=2,JSON.stringify({label,...metrics}));assert.equal(metrics.overflow,false,label);
   assert.ok(Math.abs(metrics.contentEnd-metrics.navTop)<=3,JSON.stringify({label,...metrics}));
  }
  await checkEnd('library');const last=await page.locator('.book-card').last().boundingBox();const nav=await page.locator('.mobile-navigation').boundingBox();assert.ok(nav.y-last.y-last.height<=20,'Last book must finish within 20px of navigation at scroll end');
  await page.screenshot({path:'research/mobile-scroll-library-fixed.png',fullPage:false});
  await page.getByRole('button',{name:'Descobrir livros',exact:true}).click();await expect(page.locator('.catalog-v4')).toBeVisible();await checkEnd('catalog');
  await page.getByRole('button',{name:'Estatísticas',exact:true}).click();await expect(page.locator('.statistics')).toBeVisible();await checkEnd('statistics');
  await page.getByRole('button',{name:'Recomendações',exact:true}).click();await expect(page.locator('.recommendations')).toBeVisible();await checkEnd('recommendations');
 }finally{await browser?.close();server.kill();}
});
