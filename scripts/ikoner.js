// Gör om hemskärmsikonerna från schemawebb/statisk/logga.svg: node scripts/ikoner.js (kräver Playwright).
// Renderar hemskärmsikoner av DODEX-klockan: klockan centrerad på skogsgrön botten (iOS tillåter inte genomskinligt).
const { chromium } = require('playwright'); const fs = require('fs');
const svg = fs.readFileSync('/home/user/dodex/schemawebb/statisk/logga.svg', 'utf8');
const ut = '/home/user/dodex/schemawebb/statisk/';
(async () => {
  const b = await chromium.launch();
  for (const [namn, storlek, andel] of [['ikon-180.png', 180, .78], ['ikon-192.png', 192, .78], ['ikon-512.png', 512, .78], ['ikon-maskable-512.png', 512, .62], ['favicon-32.png', 32, .92]]) {
    const p = await b.newPage({ viewport: { width: storlek, height: storlek }, deviceScaleFactor: 1 });
    await p.setContent(`<html><body style="margin:0;width:${storlek}px;height:${storlek}px;background:#193f38;display:grid;place-items:center">
      <div style="width:${Math.round(storlek * andel)}px;height:${Math.round(storlek * andel)}px">${svg.replace('<svg', '<svg width="100%" height="100%"')}</div></body></html>`);
    await p.screenshot({ path: ut + namn, omitBackground: false });
    await p.close();
  }
  await b.close(); console.log('klart');
})();
