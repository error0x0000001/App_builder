/**
 * Renders a component preview from untitledui.com (the real markup and look) so UI here can be built against it: writes <name>.png and <name>.html.
 * Component index: https://www.untitledui.com/react/components — preview pages live under /react/iframe/<group>/<name>.
 */
const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
  const b = await chromium.launch(proxy ? { proxy: { server: proxy } } : {});
  const ctx = await b.newContext({ viewport: { width: 1100, height: 900 }, ignoreHTTPSErrors: true });
  const page = await ctx.newPage();
  // usage: node tools/untitled-ref/shot.cjs drawers/user-profile-menu [more paths…]   (paths are under https://www.untitledui.com/react/iframe/)
  const paths = process.argv.slice(2);
  if (!paths.length) { console.log('Give one or more iframe paths, e.g. drawers/user-profile-menu messaging/message-example'); process.exit(1); }
  const out = process.env.OUT || '/tmp/untitled-ref';
  require('fs').mkdirSync(out, { recursive: true });
  for (const path of paths) {
    const name = path.replace(/\//g, '-');
    try {
      await page.goto(`https://www.untitledui.com/react/iframe/${path}`, { waitUntil: 'networkidle', timeout: 45000 });
      await page.waitForTimeout(1500);
      await page.screenshot({ path: `${out}/${name}.png` });
      fs.writeFileSync(`${out}/${name}.html`, await page.content());
      console.log(name, 'ok', (await page.content()).length);
    } catch (e) { console.log(name, 'FAIL', e.message.slice(0, 120)); }
  }
  await b.close();
})();
