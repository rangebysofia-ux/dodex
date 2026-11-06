const { chromium } = require('playwright'); const fs = require('fs');
const fmt = process.argv[2], FPS = 24, SEK = 90, START = +(process.argv[3] || 0);
(async () => {
  const b = await chromium.launch();
  const v = fmt === "9x16" ? { width: 1080, height: 1920 } : { width: 1920, height: 1080 };
  const p = await b.newPage({ viewport: v }); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(`file://${process.cwd()}/film.html?format=${fmt}`); await p.evaluate(() => window.klar); await p.waitForTimeout(500);
  fs.mkdirSync(`rutor-${fmt}`, { recursive: true });
  for (let f = START; f < FPS * SEK; f++) {
    await p.evaluate(t => render(t), f / FPS);
    await p.screenshot({ path: `rutor-${fmt}/${String(f).padStart(5, "0")}.jpg`, type: "jpeg", quality: 92 });
    if (f % 240 === 0) console.log(fmt, f);
  }
  console.log("klar", fmt, errs); await b.close();
})();
