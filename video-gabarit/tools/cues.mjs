// Imprime les sous-titres calculés par la page (window.SRT) en JSON : node tools/cues.mjs <dossier>  (lancé depuis $LIB)
import path from 'path';
const LIB = process.env.LIB; const { openDemo, closeServer } = await import(path.join(LIB, 'core/render/page.mjs'));
const { browser, page } = await openDemo(process.argv[2], { w: 1080, h: 1920 });
console.log(JSON.stringify(await page.evaluate(() => ({ srt: window.SRT, minutage: window.MINUTAGE }))));
await browser.close(); closeServer();
