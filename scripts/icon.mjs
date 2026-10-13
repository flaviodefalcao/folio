import { chromium } from '@playwright/test';
import { readFile, writeFile, mkdir, copyFile, readdir, unlink, rmdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { homedir } from 'node:os';

// Optional argument replaces the base asset with a supplied image. Original pixels are preserved.
if (process.argv[2]) await copyFile(process.argv[2], 'public/folio-brand.png');
const original = await readFile('public/folio-brand.png');
let executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
if (!executablePath && !existsSync(chromium.executablePath())) {
  const cache = join(homedir(), 'Library/Caches/ms-playwright');
  if (existsSync(cache)) for (const directory of (await readdir(cache)).filter(s => s.startsWith('chromium_headless_shell-')).sort().reverse()) {
    const candidate = join(cache, directory, 'chrome-headless-shell-mac-arm64/chrome-headless-shell');
    if (existsSync(candidate)) { executablePath = candidate; break; }
  }
}
const browser = await chromium.launch({ executablePath, headless: true });
try {
  const page = await browser.newPage();
  const background = await page.evaluate(async base64 => {
    const image = new Image(); image.src = `data:image/png;base64,${base64}`; await image.decode();
    if (image.naturalWidth !== image.naturalHeight) throw new Error('The supplied app icon must be square.');
    window.folioIconSource = image;
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1;
    const context = canvas.getContext('2d'); context.drawImage(image, 0, 0);
    const color = context.getImageData(0, 0, 1, 1).data;
    return '#' + Array.from(color.slice(0, 3), value => value.toString(16).padStart(2, '0')).join('');
  }, original.toString('base64'));
  async function raster(path, width, height = width, mode = 'square') {
    const data = await page.evaluate(({ width, height, mode, background }) => {
      const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
      const context = canvas.getContext('2d'); context.imageSmoothingEnabled = true; context.imageSmoothingQuality = 'high';
      if (mode === 'round') { context.beginPath(); context.arc(width / 2, height / 2, width / 2, 0, Math.PI * 2); context.clip(); }
      let size = Math.min(width, height);
      if (mode === 'adaptive') size *= 72 / 108; // 18dp inset keeps the supplied F inside the 66dp safe circle.
      if (mode === 'splash') { context.fillStyle = background; context.fillRect(0, 0, width, height); size *= 0.34; }
      context.drawImage(window.folioIconSource, (width - size) / 2, (height - size) / 2, size, size);
      return canvas.toDataURL('image/png').split(',')[1];
    }, { width, height, mode, background });
    await writeFile(path, Buffer.from(data, 'base64'));
  }
  await raster('public/folio.png', 1024);
  await raster('public/folio-favicon.png', 64);
  await raster('public/folio-ui.png', 128);
  const favicon = (await readFile('public/folio-favicon.png')).toString('base64');
  await writeFile('public/folio.svg', `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><image width="64" height="64" href="data:image/png;base64,${favicon}"/></svg>\n`);
  const res = 'android/app/src/main/res';
  const densities = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
  for (const [density, scale] of Object.entries(densities)) {
    const directory = `${res}/mipmap-${density}`; await mkdir(directory, { recursive: true });
    await raster(`${directory}/ic_launcher.png`, 48 * scale);
    await raster(`${directory}/ic_launcher_round.png`, 48 * scale, 48 * scale, 'round');
    await raster(`${directory}/ic_launcher_foreground.png`, 108 * scale, 108 * scale, 'adaptive');
  }
  await mkdir(`${res}/mipmap-anydpi-v26`, { recursive: true });
  const adaptive = '<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android"><background android:drawable="@color/ic_launcher_background"/><foreground android:drawable="@mipmap/ic_launcher_foreground"/></adaptive-icon>\n';
  await writeFile(`${res}/mipmap-anydpi-v26/ic_launcher.xml`, adaptive);
  await writeFile(`${res}/mipmap-anydpi-v26/ic_launcher_round.xml`, adaptive);
  await writeFile(`${res}/values/ic_launcher_background.xml`, `<resources><color name="ic_launcher_background">${background}</color><color name="folio_brand_background">${background}</color><color name="colorPrimary">${background}</color><color name="colorPrimaryDark">${background}</color><color name="colorAccent">#fff2dc</color></resources>\n`);
  for (const directory of ['drawable', 'drawable-v24']) {
    await mkdir(`${res}/${directory}`, { recursive: true });
    await writeFile(`${res}/${directory}/ic_launcher_foreground.xml`, '<bitmap xmlns:android="http://schemas.android.com/apk/res/android" android:src="@mipmap/ic_launcher_foreground" android:gravity="fill" android:filter="true"/>\n');
  }
  await writeFile(`${res}/drawable/ic_launcher_background.xml`, '<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle"><solid android:color="@color/ic_launcher_background"/></shape>\n');
  // Keep Capacitor splash dimensions, replacing its old logo with the supplied bitmap.
  for (const directory of (await readdir(res)).filter(name => name === 'drawable' || /^drawable-(land|port)-/.test(name))) {
    const splash = `${res}/${directory}/splash.png`; if (!existsSync(splash)) continue;
    const metadata = execFileSync('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', splash], { encoding: 'utf8' });
    const width = Number(metadata.match(/pixelWidth:\s*(\d+)/)?.[1]); const height = Number(metadata.match(/pixelHeight:\s*(\d+)/)?.[1]);
    if (width && height) await raster(splash, width, height, 'splash');
  }
  await mkdir('research', { recursive: true });
  await raster('research/icon-round-preview.png', 256, 256, 'round');
  await page.setContent(`<style>body{margin:0;background:${background};display:flex;gap:32px;padding:32px}img{width:192px;height:192px;object-fit:contain;background:${background}}.circle{border-radius:50%}.squircle{border-radius:42px}</style><img class="circle" src="data:image/png;base64,${original.toString('base64')}"/><img class="squircle" src="data:image/png;base64,${original.toString('base64')}"/>`);
  await page.setViewportSize({ width: 480, height: 256 });
  await page.screenshot({ path: 'research/icon-mask-preview.png' });
  if (process.platform === 'darwin') {
    const iconset = '.toolchain/folio.iconset'; await mkdir(iconset, { recursive: true });
    for (const size of [16, 32, 128, 256, 512]) for (const scale of [1, 2]) {
      execFileSync('sips', ['-z', String(size * scale), String(size * scale), 'public/folio.png', '--out', `${iconset}/icon_${size}x${size}${scale === 2 ? '@2x' : ''}.png`], { stdio: 'ignore' });
    }
    execFileSync('iconutil', ['-c', 'icns', iconset, '-o', 'public/folio.icns']);
    // Remove only the previously generated public iconset files; build intermediates now stay outside web assets.
    if (existsSync('public/folio.iconset')) {
      for (const name of await readdir('public/folio.iconset')) if (/^icon_(16|32|128|256|512)x\1(?:@2x)?\.png$/.test(name)) await unlink(`public/folio.iconset/${name}`);
      if (!(await readdir('public/folio.iconset')).length) await rmdir('public/folio.iconset');
    }
  }
  console.log(`Supplied icon preserved; launcher densities, adaptive masks, splash and favicon generated (${background}).`);
} finally { await browser.close(); }
