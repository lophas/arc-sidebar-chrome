// Compose store-sized HTML layouts around unmodified captures of the real UI.
import { readFile, writeFile, copyFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

export async function buildWebStoreAssets(context, source, version) {
  const output = 'docs/webstore';
  await mkdir(output, { recursive: true });
  const image = async (name, directory = source) => {
    const bytes = await readFile(join(directory, name));
    return `data:image/${name.endsWith('.jpg') ? 'jpeg' : 'png'};base64,${bytes.toString('base64')}`;
  };
  const [search, appearance, favorite, backup, work, personal, logo] = await Promise.all([
    image('search-popup.png'), image('appearance.png'), image('favorite-size.png'), image('backup-sync.png'),
    // The three actual sidebars were captured together without changing their UI.
    image('sidebar.png'), image('space-palettes.png'),
    image('icon128.png', 'src/icons')
  ]);
  const palette = personal;
  const page = await context.newPage();
  const base = `*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden}body{background:#10141c;color:#f7f8fc;font-family:Arial,sans-serif}h1,p{margin:0}h1{font-size:38px;line-height:1.15;letter-spacing:-1.1px}p{font-size:17px;line-height:1.45;color:#aeb9cc}.eyebrow{font-size:11px;letter-spacing:2px;color:#7dd3fc;font-weight:700;margin-bottom:9px}.heading{position:absolute;left:40px;top:27px;right:40px}.heading p{margin-top:11px}.capture{display:block;border-radius:12px;box-shadow:0 16px 48px #0006}.footer{position:absolute;left:40px;bottom:16px;font-size:12px;color:#8591a8}`;
  async function render(name, width, height, body) {
    await page.setViewportSize({ width, height });
    await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>${base}</style></head><body>${body}</body></html>`);
    await page.evaluate(() => Promise.all([...document.images].map(img => img.decode())));
    await page.screenshot({ path: join(output, name), type: 'jpeg', quality: 96 });
  }
  await copyFile(join(source, 'workspace.jpg'), join(output, '01-spaces-and-chrome.jpg'));
  await render('02-search-every-tab.jpg', 1280, 800, `
    <div class="heading"><div class="eyebrow">FIND YOUR NEXT TAB</div><h1>One shortcut. Every open tab.</h1><p>Search Favorites, pinned links and open tabs across Chrome windows.</p></div>
    <img class="capture" src="${search}" style="position:absolute;left:260px;top:197px;width:760px;height:520px">
    <div class="footer">Arc Side of the Chrome · ⌘K on macOS / Ctrl+K on Windows and Linux</div>`);
  await copyFile(join(source, 'mini-player.jpg'), join(output, '03-video-mini-player.jpg'));
  await render('04-space-palettes.jpg', 1280, 800, `
    <div class="heading"><div class="eyebrow">A PLACE FOR EACH PART OF YOUR DAY</div><h1>Recognize your Space at a glance.</h1></div>
    <img class="capture" src="${palette}" style="position:absolute;left:119px;top:112px;width:1042px;height:650px">
    <div class="footer">Work · Personal · Reading — real sidebar appearances in light and dark themes</div>`);
  await render('05-sidebar-options.jpg', 1280, 800, `
    <div class="heading"><div class="eyebrow">YOUR SIDEBAR, YOUR WAY</div><h1>Make it fit the way you browse.</h1></div>
    <img class="capture" src="${appearance}" style="position:absolute;left:40px;top:123px;width:640px;height:auto">
    <img class="capture" src="${favorite}" style="position:absolute;left:710px;top:123px;width:530px;height:auto">
    <img class="capture" src="${backup}" style="position:absolute;left:710px;top:335px;width:530px;height:auto">
    <div class="footer">Adjust the edge trigger and button size · Back up your preferences · Sync your organization</div>`);
  await render('promo-small-440x280.jpg', 440, 280, `
    <img src="${logo}" style="position:absolute;left:26px;top:23px;width:56px;height:56px">
    <div style="position:absolute;left:96px;top:32px;font-size:17px;font-weight:700;line-height:1.3">Arc Side<br>of the Chrome</div>
    <h1 style="position:absolute;left:28px;top:103px;font-size:43px">Your Spaces.<br>Your Chrome.</h1>
    <p style="position:absolute;left:30px;bottom:27px;font-size:16px;color:#9fd9ff">Spaces, tabs &amp; a little harmony.</p>`);
  await render('promo-marquee-1400x560.jpg', 1400, 560, `
    <img src="${logo}" style="position:absolute;left:54px;top:48px;width:66px;height:66px">
    <div style="position:absolute;left:139px;top:65px;font-size:25px;font-weight:700">Arc Side of the Chrome</div>
    <h1 style="position:absolute;left:57px;top:176px;font-size:64px">Make room<br>for your work.</h1>
    <p style="position:absolute;left:61px;top:354px;width:490px;font-size:21px">Spaces, native Chrome groups<br>and a mini player that follows your flow.</p>
    <img class="capture" src="${search}" style="position:absolute;left:684px;top:149px;width:523px;height:auto">
    <img class="capture" src="${work}" style="position:absolute;right:45px;top:24px;width:263px;height:512px">
    <div style="position:absolute;left:61px;bottom:32px;font-size:13px;color:#8591a8">Spaces, tabs &amp; a little harmony.</div>`);
  await page.close();
  await writeFile(join(output, 'capture-info.json'), JSON.stringify({
    extensionVersion: version, browser: context.browser().version(),
    source: 'Real installed extension, native Chrome groups and native PiP; fictional example sites and workspace data. Search, palette and Options captures are arranged in HTML presentation frames.',
    screenshots: ['01-spaces-and-chrome.jpg', '02-search-every-tab.jpg', '03-video-mini-player.jpg', '04-space-palettes.jpg', '05-sidebar-options.jpg'],
    screenshotSize: [1280, 800], promoTiles: { small: [440, 280], marquee: [1400, 560] }
  }, null, 2) + '\n');
  console.log('Captured five 1280x800 Web Store screenshots and both promo tiles');
}
