// Mjesečni automatski export za Deep Maps.
// Otvara pravu stranicu u headless Chromeu i poziva istu logiku koju
// koristi "Export Image" gumb u browseru -> slika je identična ručnom exportu.
//
// Pokretanje lokalno:  SITE_URL="https://tvoj-site.com" node run-exports.mjs
// U GitHub Actionsu:   vidi .github/workflows/monthly-export.yml

import { chromium } from 'playwright';

const SITE_URL = process.env.SITE_URL;
const EXPORT_BOT_EMAIL = process.env.EXPORT_BOT_EMAIL;
const EXPORT_BOT_PASSWORD = process.env.EXPORT_BOT_PASSWORD;

if (!SITE_URL) {
    console.error('Nedostaje SITE_URL env varijabla (link na hostanu index.html stranicu).');
    process.exit(1);
}
if (!EXPORT_BOT_EMAIL || !EXPORT_BOT_PASSWORD) {
    console.error('Nedostaju EXPORT_BOT_EMAIL / EXPORT_BOT_PASSWORD env varijable (Supabase Auth login za automatski export).');
    process.exit(1);
}

(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });

    page.on('console', msg => console.log('  [page]', msg.text()));
    page.on('pageerror', err => console.error('  [page error]', err.message));

    console.log(`Otvaram ${SITE_URL} ...`);
    await page.goto(SITE_URL, { waitUntil: 'networkidle' });

    console.log('Čekam da se data.json učita (MAPS/SETS)...');
    await page.waitForFunction(
        () => typeof MAPS !== 'undefined' && MAPS.length > 0 && typeof SETS !== 'undefined',
        { timeout: 30000 }
    );

    console.log('Prijavljujem se kao export-bot (Supabase Auth) ...');
    const loginError = await page.evaluate(async (email, password) => {
        const { error } = await db.auth.signInWithPassword({ email, password });
        return error ? error.message : null;
    }, EXPORT_BOT_EMAIL, EXPORT_BOT_PASSWORD);

    if (loginError) {
        console.error('Export-bot login neuspješan:', loginError);
        await browser.close();
        process.exit(1);
    }

    console.log('Pokrećem runAutomatedExports() ...');
    const results = await page.evaluate(() => window.runAutomatedExports());

    console.log('\nRezultati:');
    results.forEach(r => {
        console.log(`  - ${r.map} / ${r.set}: ${r.url ? 'OK -> ' + r.url : 'GREŠKA'}`);
    });

    await browser.close();

    const failed = results.filter(r => !r.url);
    if (results.length === 0) {
        console.warn('Nema uključenih (enabled) targeta u export_targets tablici — ništa nije exportirano.');
    }
    if (failed.length > 0) {
        console.error(`${failed.length}/${results.length} exporta nije uspjelo.`);
        process.exit(1);
    }

    console.log(`\nGotovo: ${results.length}/${results.length} exporta uspješno.`);
})().catch(err => {
    console.error('Fatalna greška:', err);
    process.exit(1);
});
