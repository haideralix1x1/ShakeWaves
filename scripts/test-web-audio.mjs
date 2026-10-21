import { chromium } from 'playwright-core';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const URL = 'http://localhost:8081';

const browser = await chromium.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--autoplay-policy=no-user-gesture-required'],
});

const page = await browser.newPage();

const logs = [];
page.on('console', (msg) => logs.push(`[${msg.type()}] ${msg.text()}`));
page.on('pageerror', (err) => logs.push(`[PAGEERROR] ${err.message}`));
page.on('requestfailed', (req) => logs.push(`[REQFAIL] ${req.url()} ${req.failure()?.errorText}`));
page.on('response', (res) => {
  if (res.url().includes('.js') || res.url().includes('bundle')) {
    logs.push(`[JS] ${res.status()} ${res.url().substring(0, 120)}`);
  }
});

await page.goto(URL, { waitUntil: 'commit', timeout: 30000 });

// Wait for the JS bundle to load and React to mount
console.log('Waiting for app to render...');
try {
  await page.waitForFunction(() => {
    return document.querySelectorAll('div').length > 5;
  }, { timeout: 120000, polling: 500 });
  console.log('App rendered!');
} catch (e) {
  console.log('App did not render within 120s');
  // Check if script is still loading
  const scriptState = await page.evaluate(() => {
    const scripts = document.querySelectorAll('script');
    return Array.from(scripts).map(s => ({
      src: s.src?.substring(0, 80),
      readyState: s.readyState,
      async: s.async,
      defer: s.defer,
    }));
  });
  console.log('Script states:', JSON.stringify(scriptState, null, 2));
}

// Instrument Web Audio API before any interaction
await page.evaluate(() => {
  window.__audioLog = [];
  const origCreateBuffer = AudioContext.prototype.createBuffer;
  AudioContext.prototype.createBuffer = function (...args) {
    window.__audioLog.push(`createBuffer(${args[1]} samples, ${args[2]}Hz)`);
    return origCreateBuffer.apply(this, args);
  };
  const origCreateSource = AudioContext.prototype.createBufferSource;
  AudioContext.prototype.createBufferSource = function (...args) {
    window.__audioLog.push('createBufferSource()');
    const src = origCreateSource.apply(this, args);
    const origStart = src.start.bind(src);
    src.start = (...a) => {
      window.__audioLog.push('source.start() CALLED');
      return origStart(...a);
    };
    return src;
  };
  const origResume = AudioContext.prototype.resume;
  AudioContext.prototype.resume = function (...args) {
    window.__audioLog.push(`resume() state=${this.state}`);
    return origResume.apply(this, args);
  };
});

await page.waitForTimeout(5000);

const title = await page.title();
const bodyText = await page.evaluate(() => document.body?.innerText?.substring(0, 300));
const rootHtml = await page.evaluate(() => document.getElementById('root')?.innerHTML?.substring(0, 500) || document.getElementById('__next')?.innerHTML?.substring(0, 500) || 'no root/next');
const allDivs = await page.evaluate(() => document.querySelectorAll('div').length);
const scripts = await page.evaluate(() => Array.from(document.querySelectorAll('script')).map(s => s.src || s.innerHTML.substring(0, 100)));
const fullHtml = await page.evaluate(() => document.documentElement.outerHTML.substring(0, 2000));
console.log('TITLE:', title);
console.log('BODY:', bodyText);
console.log('ROOT HTML:', rootHtml);
console.log('DIV count:', allDivs);
console.log('SCRIPTS:', JSON.stringify(scripts, null, 2));
console.log('FULL HTML:', fullHtml);

// Find and click PLAY TARGET button
const playTargetBtn = page.locator('text=PLAY TARGET').first();
const btnCount = await playTargetBtn.count();
console.log('PLAY TARGET buttons found:', btnCount);

if (btnCount > 0) {
  await playTargetBtn.click();
  await page.waitForTimeout(2000);

  const audioLog = await page.evaluate(() => window.__audioLog);
  console.log('AUDIO LOG after PLAY TARGET:', JSON.stringify(audioLog, null, 2));
} else {
  console.log('PLAY TARGET button not found!');
  const allButtons = await page.locator('button, [role=button], a').allTextContents();
  console.log('All clickable texts:', allButtons.slice(0, 20));
}

// Also try PLAY MINE
const playMineBtn = page.locator('text=PLAY MINE').first();
const mineCount = await playMineBtn.count();
console.log('PLAY MINE buttons found:', mineCount);
if (mineCount > 0) {
  await playMineBtn.click();
  await page.waitForTimeout(1500);
  const audioLog2 = await page.evaluate(() => window.__audioLog);
  console.log('AUDIO LOG after PLAY MINE:', JSON.stringify(audioLog2, null, 2));
}

console.log('\n--- CONSOLE LOGS ---');
logs.forEach((l) => console.log(l));

await browser.close();
console.log('\nDONE');
