#!/usr/bin/env node
// Live search smoke: open the search page in headless Chrome, run the first example search, and require a
// "Done" status with rendered jobs. Exit 0 on success, 1 with the last status and any page errors otherwise.
// Compile checks cannot catch a page that loads and then dies on real data (2026-09-15 to 09-19: every search
// died at the tree walk after a tree with appended chunk nodes went live). Run after every deploy and cutover:
//   node scripts/site-smoke.js [url]      (CHROME=/path/to/chrome to override the browser)
import puppeteer from 'puppeteer-core';
const URL = process.argv[2] || 'https://backend.dehnbostele.workers.dev/';
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const TIMEOUT_MS = 240000;
(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
  const errors = [];
  try {
    const page = await browser.newPage();
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error' && !/favicon/.test(m.text())) errors.push('console: ' + m.text().slice(0, 200)); });
    await page.goto(URL, { waitUntil: 'load', timeout: 60000 });
    await page.waitForSelector('.example', { timeout: 30000 });
    await page.click('.example');
    await page.evaluate(() => { document.querySelector('#loc').value = 'Chicago, IL'; document.querySelector('#f').requestSubmit(); });
    const t0 = Date.now();
    let last = '';
    while (Date.now() - t0 < TIMEOUT_MS) {
      const s = await page.evaluate(() => (document.querySelector('#msg') || {}).textContent || '');
      if (s !== last) { console.log(`  ${((Date.now() - t0) / 1000).toFixed(0)}s ${s.slice(0, 140)}`); last = s; }
      if (/^Done|^Stopped/.test(s)) break;
      await new Promise((r) => setTimeout(r, 1000));
    }
    const jobs = await page.evaluate(() => document.querySelectorAll('#list > *').length);
    const ok = /^Done/.test(last) && jobs > 0;
    console.log(`${ok ? 'site smoke ok' : 'SITE SMOKE FAILED'}: ${jobs} jobs rendered; status: ${last.slice(0, 200) || '(none)'}`);
    for (const e of errors) console.log('  ' + e);
    process.exit(ok ? 0 : 1);
  } catch (e) {
    console.log('SITE SMOKE FAILED: ' + e.message);
    for (const x of errors) console.log('  ' + x);
    process.exit(1);
  } finally { await browser.close().catch(() => {}); }
})();
