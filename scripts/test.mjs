import {existsSync,readdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {homedir} from 'node:os';
import {join} from 'node:path';
// Prefer the installed Playwright browser; reuse an existing local Chromium when available.
const env={...process.env};
if(!env.PLAYWRIGHT_CHROMIUM_EXECUTABLE){
  const {chromium}=await import('@playwright/test');
  if(!existsSync(chromium.executablePath())){
    const cache=join(homedir(),'Library/Caches/ms-playwright');
    if(existsSync(cache))for(const directory of readdirSync(cache).filter(s=>s.startsWith('chromium_headless_shell-')).sort().reverse()){
      const candidate=join(cache,directory,'chrome-headless-shell-mac-arm64/chrome-headless-shell');
      if(existsSync(candidate)){env.PLAYWRIGHT_CHROMIUM_EXECUTABLE=candidate;break;}
    }
  }
}
const result=spawnSync(process.execPath,['--test',...readdirSync('tests').filter(f=>f.endsWith('.test.mjs')).map(f=>'tests/'+f)],{stdio:'inherit',env});
process.exit(result.status||0);
