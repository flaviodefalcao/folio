import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chromium, expect } from '@playwright/test';
import { mkdir, readFile } from 'node:fs/promises';
const origin='http://127.0.0.1:5196';
async function storedMetrics(page) {
  return page.evaluate(()=>new Promise((resolve,reject)=>{
    const request=indexedDB.open('keyval-store');
    request.onerror=()=>reject(request.error);
    request.onsuccess=()=>{const db=request.result;const r=db.transaction('keyval').objectStore('keyval').get('folio:metrics:v1');r.onerror=()=>reject(r.error);r.onsuccess=()=>{db.close();resolve(r.result);};};
  }));
}
const total=data=>(data?.spans||[]).reduce((sum,span)=>sum+span.durationMs,0);

test('Mobile statistics count reader interactions, pause panels and stop at the idle limit (virtual clock)',async()=>{
  const preview=spawn(process.execPath,['node_modules/vite/bin/vite.js','preview','--host','127.0.0.1','--port','5196','--strictPort'],{cwd:new URL('..',import.meta.url),stdio:'ignore'});
  let browser;
  try {
    for(let i=0;i<60;i++){try{if((await fetch(origin)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
    browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{})});
    const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true,timezoneId:'America/Sao_Paulo',acceptDownloads:true});
    const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
    // Time is virtual only in this test. No spans or fabricated historical usage are inserted into app storage.
    await page.clock.install({time:new Date('2026-10-12T15:00:00Z')});
    await page.goto(origin);
    await page.getByRole('button',{name:'Ler A arte de ler devagar',exact:true}).tap();
    await expect(page.locator('.reader-loading')).toHaveCount(0);
    await expect(page.locator('.reading-metrics-status')).toContainText('Leitura ativa');
    // Allow the CDP round trip on a busy host; 100ms could already be in the past.
    await page.clock.pauseAt(await page.evaluate(()=>Date.now()+5000));
    const heading=page.frameLocator('.epub-container iframe').first().locator('h1');
    await heading.tap({force:true});
    const before=total(await storedMetrics(page));
    await page.clock.runFor(65000);
    await heading.tap({force:true}); // Flush the tail between the five-second heartbeats through a real reader interaction.
    await expect.poll(async()=>total(await storedMetrics(page))-before).toBeGreaterThanOrEqual(64500);
    const counted=total(await storedMetrics(page));
    assert.ok(counted-before<=65500,'65 virtual seconds produce approximately 65 seconds of active reading.');
    await page.getByRole('button',{name:'Conversar',exact:true}).tap({force:true});
    await expect(page.locator('.reading-metrics-status')).toContainText('Contagem pausada');
    const paused=total(await storedMetrics(page));
    await page.clock.runFor(90000);
    assert.equal(total(await storedMetrics(page)),paused,'The chat panel does not count as reading.');
    await page.getByRole('button',{name:'Fechar painel',exact:true}).tap({force:true});
    await heading.tap({force:true});
    const idleStart=total(await storedMetrics(page));
    await page.clock.runFor(125000);
    await expect(page.locator('.reading-metrics-status')).toContainText('Pausa por inatividade');
    await expect.poll(async()=>total(await storedMetrics(page))-idleStart).toBeGreaterThanOrEqual(119500);
    assert.ok(total(await storedMetrics(page))-idleStart<=120500,'The idle cap counts 120 seconds, not the entire 125-second interval.');
    const stopped=total(await storedMetrics(page));
    await page.clock.runFor(30000);
    assert.equal(total(await storedMetrics(page)),stopped,'Idle reading remains paused.');
    await heading.tap({force:true});
    await expect(page.locator('.reading-metrics-status')).toContainText('Leitura ativa');
    await page.clock.runFor(15000);
    await heading.tap({force:true});
    await expect.poll(async()=>total(await storedMetrics(page))-stopped).toBeGreaterThanOrEqual(14500);
    await page.getByRole('button',{name:'Biblioteca',exact:true}).tap({force:true});
    await page.clock.resume();
    await page.getByRole('button',{name:'Estatísticas',exact:true}).tap();
    await expect(page.getByRole('heading',{name:'Seu ritmo de leitura.'})).toBeVisible();
    const data=await storedMetrics(page),recorded=total(data);
    assert.ok(recorded-before>=199000&&recorded-before<=202000);
    assert.ok(data.spans.every(span=>span.bookId&&span.title==='A arte de ler devagar'&&span.mode==='read'));
    await expect(page.locator('.stats-book-row')).toHaveCount(1);
    await expect(page.locator('.session-row')).toHaveCount(1);
    await page.getByRole('button',{name:'Meta e contagem',exact:true}).tap();
    await page.getByRole('spinbutton',{name:'Meta diária em minutos'}).fill('5');
    await page.getByRole('combobox',{name:'Limite de inatividade'}).selectOption('60');
    await page.getByRole('button',{name:'Salvar meta',exact:true}).tap();
    await expect.poll(async()=>(await storedMetrics(page)).goalMinutes).toBe(5);
    await expect.poll(async()=>(await storedMetrics(page)).idleSeconds).toBe(60);
    const noOverflow=async()=>assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Statistics fit the phone width.');
    for(const [name,bars] of [['Dia',24],['Semana',7],['Mês',31],['Ano',12]]) {
      await page.getByRole('button',{name,exact:true}).tap();
      await expect(page.getByRole('group',{name:'Gráfico de tempo de leitura'}).getByRole('button')).toHaveCount(bars);
      await noOverflow();
    }
    await expect(page.locator('.reading-heatmap button')).toHaveCount(91);
    await page.getByRole('button',{name:'Semana',exact:true}).tap();
    await page.getByRole('group',{name:'Gráfico de tempo de leitura'}).getByRole('button').first().tap();
    await expect(page.locator('.chart-selection')).toContainText('min');
    await mkdir(new URL('../research',import.meta.url),{recursive:true});
    await page.screenshot({path:new URL('../research/statistics-virtual-clock.png',import.meta.url).pathname,fullPage:true});
    await page.getByRole('tab',{name:'Histórico',exact:true}).click();const downloaded=page.waitForEvent('download');
    await page.getByRole('button',{name:'CSV diário',exact:true}).tap();
    const download=await downloaded;
    assert.match(download.suggestedFilename(),/^folio-estatisticas-2026-10-12\.csv$/);
    const csv=await readFile(await download.path(),'utf8');
    assert.match(csv,/data,minutos_totais,minutos_leitura,minutos_voz,sessoes,livros,concluidos,meta_minutos/);
    assert.match(csv,/2026-10-12,/);
    await page.reload();
    await page.getByRole('button',{name:'Estatísticas',exact:true}).tap();
    await expect(page.getByRole('heading',{name:'Seu ritmo de leitura.'})).toBeVisible();
    const restored=await storedMetrics(page);
    assert.equal(total(restored),recorded);assert.equal(restored.goalMinutes,5);assert.equal(restored.idleSeconds,60);
    assert.deepEqual(errors,[]);
  } finally {await browser?.close();preview.kill();}
});
