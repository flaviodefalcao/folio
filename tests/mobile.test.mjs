import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chromium, expect } from '@playwright/test';
import { readFile, mkdir } from 'node:fs/promises';
import JSZip from 'jszip';

test('Android-sized reader: import, navigation, themes, bookmarks, search and panels',async()=>{
  const preview=spawn(process.execPath,['node_modules/vite/bin/vite.js','preview','--host','127.0.0.1','--port','5234','--strictPort'],{cwd:new URL('..',import.meta.url),stdio:'ignore'});
  let browser;
  try {
    for(let i=0;i<60;i++) {
      try{const response=await fetch('http://127.0.0.1:5234');if(response.ok)break;}catch{}
      await new Promise(resolve=>setTimeout(resolve,100));
    }
    browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{})});
    const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true});
    const page=await context.newPage();
    const errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.goto('http://127.0.0.1:5234');
    await expect(page.getByRole('button',{name:'Ler A arte de ler devagar',exact:true})).toBeVisible();
    const noOverflow=async()=>assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),'The mobile document must not scroll horizontally.');
    await noOverflow();
    await mkdir(new URL('../research',import.meta.url),{recursive:true});
    await page.screenshot({path:new URL('../research/mobile-library.png',import.meta.url).pathname,fullPage:true});
    await page.getByRole('button',{name:'Mais',exact:true}).tap();await page.locator('.mobile-more').getByRole('button',{name:'Coleções',exact:true}).tap();
    await page.getByPlaceholder('Literatura, estudos, próximas leituras…').fill('Leituras no celular');
    await page.getByRole('button',{name:'Criar coleção',exact:true}).tap();
    await expect(page.getByRole('heading',{name:'Leituras no celular',exact:true})).toBeVisible();

    // Use the visible upload flow and a real EPUB; no application state is injected.
    const zip=await JSZip.loadAsync(await readFile(new URL('../public/sample.epub',import.meta.url)));
    zip.file('OEBPS/content.opf',(await zip.file('OEBPS/content.opf').async('string')).replace('A arte de ler devagar','Leitura no Android').replace('urn:folio:original-demo-1','urn:folio:mobile-test'));
    await page.locator('input[type=file]').setInputFiles({name:'leitura-android.epub',mimeType:'application/epub+zip',buffer:await zip.generateAsync({type:'nodebuffer'})});
    await expect(page.getByRole('button',{name:'Ler Leitura no Android',exact:true})).toBeVisible();
    await page.getByRole('button',{name:'Opções de Leitura no Android',exact:true}).tap();
    await page.locator('.book-menu select').selectOption('Leituras no celular');
    await page.getByRole('button',{name:'Mais',exact:true}).tap();await page.locator('.mobile-more').getByRole('button',{name:'Coleções',exact:true}).tap();
    await page.getByRole('dialog').getByRole('button',{name:'Leituras no celular',exact:true}).tap();
    await expect(page.getByRole('button',{name:'Ler A arte de ler devagar',exact:true})).toHaveCount(0);
    await page.getByRole('button',{name:'Ler Leitura no Android',exact:true}).tap();
    await expect(page.locator('.reader-loading')).toHaveCount(0);
    const frame=page.frameLocator('.epub-container iframe').first();
    await expect(frame.locator('h1')).toHaveText('Um lugar para a atenção');
    await noOverflow();
    await page.screenshot({path:new URL('../research/mobile-reader.png',import.meta.url).pathname});
    for(const name of ['Sumário','Buscar no livro','Ajustar leitura','Marcar página','Destaques e notas','Próxima página']) {
      const control=page.getByRole('button',{name,exact:true});
      await expect(control).toBeVisible();
      const rect=await control.boundingBox();
      assert.ok(rect&&rect.x>=-1&&rect.x+rect.width<=391,`${name} fits the phone width`);
    }

    await page.getByRole('button',{name:'Marcar página',exact:true}).tap();
    await page.getByRole('button',{name:'Sumário',exact:true}).tap();
    await expect(page.locator('.reader-panel')).toBeVisible();
    await expect(page.locator('.reader-panel .toc-link')).toHaveCount(5);
    await page.locator('.toc-link').filter({hasText:'O que a memória conserva'}).first().tap();
    await page.getByRole('button',{name:'Fechar painel',exact:true}).tap();
    await expect(frame.locator('h1')).toHaveText('O que a memória conserva');

    await page.getByRole('button',{name:'Ajustar leitura',exact:true}).tap();
    await page.getByRole('button',{name:'Escuro',exact:true}).tap();
    await expect(page.locator('.reader-shell')).toHaveClass(/theme-night/);
    const panel=await page.locator('.reader-panel').boundingBox();
    assert.ok(panel&&panel.x>=-1&&panel.y>=0&&panel.x+panel.width<=391&&panel.y+panel.height<=845,'Reader panel fits the phone viewport.');
    await page.screenshot({path:new URL('../research/mobile-panel.png',import.meta.url).pathname});
    await page.getByRole('button',{name:'Fechar painel',exact:true}).tap();

    await page.getByRole('button',{name:'Buscar no livro',exact:true}).tap();
    await page.getByPlaceholder('Uma palavra ou expressão…').fill('memória');
    await expect(page.locator('.search-result').first()).toBeVisible();
    assert.ok(await page.locator('.search-result').count()>0);
    await page.getByRole('button',{name:'Fechar painel',exact:true}).tap();
    await page.getByRole('button',{name:'Destaques e notas',exact:true}).tap();
    await expect(page.getByRole('button',{name:'Exportar notas'})).toBeVisible();
    await page.getByRole('button',{name:'Fechar painel',exact:true}).tap();

    await page.getByRole('button',{name:'Conversar',exact:true}).tap();
    await expect(page.getByRole('textbox',{name:'Pergunta sobre o livro'})).toBeVisible();
    await expect(page.getByRole('button',{name:'Enviar pergunta'})).toBeDisabled();
    const composer=await page.locator('.chat-composer').boundingBox();
    assert.ok(composer&&composer.y+composer.height<=845,'Chat composer remains visible above the viewport bottom.');
    await page.screenshot({path:new URL('../research/mobile-chat.png',import.meta.url).pathname});
    await page.getByRole('button',{name:'Fechar painel',exact:true}).tap();

    await page.getByRole('button',{name:'Biblioteca',exact:true}).tap();
    await page.reload();
    await expect(page.getByRole('button',{name:'Ler Leitura no Android',exact:true})).toBeVisible();
    await page.getByRole('button',{name:'Ler Leitura no Android',exact:true}).tap();
    await expect(page.locator('.reader-shell')).toHaveClass(/theme-night/);
    await expect(page.locator('.reader-loading')).toHaveCount(0);
    await page.getByRole('button',{name:'Sumário',exact:true}).tap();
    await expect(page.locator('.reader-panel .toc-link')).toHaveCount(5);
    await noOverflow();
    assert.deepEqual(errors,[],'No unhandled errors in the phone flow.');
  } finally {await browser?.close();preview.kill();}
});
