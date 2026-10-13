// Use the actual signed APK and native accessibility tree, without WebView debugging.
// bash -c 'source scripts/android-env.sh; node scripts/test-android-keyboard.mjs'
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile } from 'node:fs/promises';
import { DOMParser } from '@xmldom/xmldom';
import assert from 'node:assert/strict';

const exec = promisify(execFile), serial = 'emulator-5558';
const adb = async (...args) => (await exec('adb', ['-s', serial, ...args], { maxBuffer: 8 * 1024 * 1024 })).stdout;
assert.match(await adb('emu', 'avd', 'name'), /^folio-test-api36\r?\n/);
await adb('shell', 'settings', 'put', 'secure', 'show_ime_with_hard_keyboard', '1');
await adb('shell', 'am', 'start', '-n', 'org.folio.reader/.MainActivity');
const observations = [];
const pause = () => new Promise(resolve => setTimeout(resolve, 1000));
async function snapshot() {
  await adb('shell', 'uiautomator', 'dump', '/data/local/tmp/folio-keyboard-test.xml');
  const xml = await adb('exec-out', 'cat', '/data/local/tmp/folio-keyboard-test.xml');
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  return Array.from(doc.getElementsByTagName('node')).map(n => {
    const [left, top, right, bottom] = (n.getAttribute('bounds') || '').match(/\d+/g)?.map(Number) || [];
    return { text: n.getAttribute('text'), class: n.getAttribute('class'),
      package: n.getAttribute('package'), left, top, right, bottom };
  });
}
async function tap(node) {
  assert.ok(node && node.bottom > node.top && node.right > node.left, 'Control is visible.');
  await adb('shell', 'input', 'tap', String(Math.round((node.left + node.right) / 2)), String(Math.round((node.top + node.bottom) / 2)));
  await pause();
}
const field = nodes => nodes.find(n => n.class === 'android.widget.EditText' && n.package === 'org.folio.reader');
async function keyboard() {
  // uiautomator dump includes only the active app window on this image, so
  // obtain actual IME visibility/geometry from Android, not from DOM resizing.
  const status = await adb('shell', 'dumpsys', 'input_method');
  const shown = /mInputShown=true/.test(status);
  if (!shown) return { shown: false };
  const windows = await adb('shell', 'dumpsys', 'window', 'windows');
  const block = windows.split(/(?=  Window #\d+ )/).find(s => /u0 InputMethod\}/.test(s));
  const region = block?.match(/touchable region=SkRegion\(\(\d+,(\d+),/);
  assert.ok(region, 'The real keyboard has a visible touchable region.');
  return { shown: true, top: Number(region[1]) };
}
const observe = async (phase, nodes, open) => {
  const input = field(nodes), ime = await keyboard();
  const webview = nodes.find(n => n.class === 'android.webkit.WebView');
  assert.ok(input && webview, 'Search and WebView remain in the accessibility tree.');
  assert.equal(input.text, 'Dom Casmurro', 'The typed query is preserved.');
  assert.ok(input.bottom > input.top && input.top >= webview.top && input.bottom <= webview.bottom, 'The text field remains inside the visible app.');
  assert.equal(ime.shown, open, 'Actual Android IME visibility matches the test phase.');
  if (ime.shown) {
    assert.ok(input.bottom <= ime.top, 'The text field is above the real Android keyboard.');
    assert.ok(Math.abs(webview.bottom - ime.top) <= 3, 'The app uses all available space without subtracting the keyboard twice.');
  }
  observations.push({ phase, input, webview, keyboard: ime });
  console.log('Verified ' + phase);
};

let nodes = await snapshot();
const appDeadline = Date.now() + 60000;
while (!nodes.some(n => n.text === 'Descobrir livros') && Date.now() < appDeadline) {
  // A newly installed release may still be creating its WebView. Do not send
  // Back here: the native handler would exit the app before React is ready.
  if (nodes.some(n => /Anna.*Archive/.test(n.text))) {
    await adb('shell', 'input', 'keyevent', 'KEYCODE_BACK');
  }
  await pause();
  nodes = await snapshot();
}
await tap(nodes.find(n => n.text === 'Descobrir livros'));
nodes = await snapshot();
if (!nodes.some(n => /Anna.*Archive/.test(n.text))) {
  await tap(nodes.find(n => /Gutenberg.*download direto/.test(n.text)));
  nodes = await snapshot();
}
await tap(nodes.find(n => /Anna.*Archive/.test(n.text)));
nodes = await snapshot();
assert.equal(field(nodes)?.text, '', 'Test starts with an empty query.');
for (let cycle = 0; cycle < 3; cycle++) {
  await tap(field(nodes));
  if (cycle === 0) await adb('shell', 'input', 'text', 'Dom%sCasmurro');
  nodes = await snapshot();
  await observe(`keyboard-open-${cycle + 1}`, nodes, true);
  if (cycle === 0) {
    const shot = await exec('adb', ['-s', serial, 'exec-out', 'screencap', '-p'], { encoding: 'buffer', maxBuffer: 8 * 1024 * 1024 });
    await writeFile('research/android-v021-anna-keyboard.png', shot.stdout);
  }
  await adb('shell', 'input', 'keyevent', 'KEYCODE_BACK');
  await pause();
  nodes = await snapshot();
  await observe(`keyboard-closed-${cycle + 1}`, nodes, false);
}
await tap(nodes.find(n => n.text === 'Buscar'));
const deadline = Date.now() + 60000;
do {
  nodes = await snapshot();
  if (!nodes.some(n => n.text === 'Buscando…')) break;
  await pause();
} while (Date.now() < deadline);
assert.ok(!nodes.some(n => n.text === 'Buscando…'), 'The native search finishes.');
await observe('after-real-native-search', nodes, false);
await writeFile('research/android-v021-keyboard-observations.json', JSON.stringify(observations, null, 2) + '\n');
console.log(JSON.stringify({ passed: true, cycles: 3, observations }, null, 2));
await adb('shell', 'rm', '/data/local/tmp/folio-keyboard-test.xml');
