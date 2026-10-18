import assert from 'node:assert/strict';

export async function checkIconSurfaces(page, poll) {
  const original = await page.evaluate(async () => (await chrome.storage.local.get('arcSidebarModel')).arcSidebarModel);
  const white = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="none" stroke="white" stroke-width="2" d="M4 4h16v12H9l-5 4z"/></svg>');
  const black = white.replace('white', 'black');
  await page.evaluate(async ({ white, black }) => {
    const { arcSidebarModel: model } = await chrome.storage.local.get('arcSidebarModel');
    model.favorites[0].icon = white;
    model.favorites.push({ id: 'black-icon', type: 'tab', title: 'Black logo', url: 'https://black-icon.test/', icon: black });
    model.spaces.find(space => space.id === 'work').children.find(node => node.id === 'folder').children.find(node => node.id === 'pin').icon = white;
    await chrome.storage.local.set({ arcSidebarModel: model });
  }, { white, black });
  try {
    const favorite = page.locator('.favorite-tile[data-favorite-id="fav"]');
    await poll(async () => await favorite.locator('img').getAttribute('src') === white, 'Transparent white Favorite icon did not load');
    await page.mouse.move(1, 500);
    assert.equal(await favorite.evaluate(el => getComputedStyle(el).backgroundColor), 'rgba(88, 101, 121, 0.14)');
    assert.equal(await favorite.locator('img').evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(133, 139, 149)');
    await favorite.hover();
    const hover = await favorite.evaluate(el => getComputedStyle(el).backgroundColor);
    assert.equal(hover, 'rgba(88, 101, 121, 0.22)');
    await favorite.evaluate(el => el.classList.add('active'));
    assert.notEqual(await favorite.evaluate(el => getComputedStyle(el).backgroundColor), hover);
    assert.equal(await favorite.locator('img').evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(133, 139, 149)');
    await favorite.evaluate(el => el.classList.remove('active'));
    await page.mouse.move(1, 500);
    const pin = page.locator('#pinned .row[data-saved-node-id="pin"] img');
    await poll(async () => await pin.getAttribute('src') === white, 'Transparent pinned icon did not load');
    const size = await pin.evaluate(el => {
      const style = getComputedStyle(el);
      return { background: style.backgroundColor, outline: style.outlineWidth, filter: style.filter, width: el.getBoundingClientRect().width };
    });
    assert.equal(size.background, 'rgb(133, 139, 149)');
    assert.equal(size.outline, '1px');
    assert.equal(size.filter, 'none');
    assert.equal(size.width, 20, 'The plate must not shrink uploaded pinned icons');
    if (process.env.ARC_PALETTE_SCREENSHOTS) console.log('ICON_SURFACES_LIGHT_PNG=' + (await page.screenshot()).toString('base64'));
    await page.emulateMedia({ colorScheme: 'dark' });
    await poll(async () => await pin.evaluate(el => getComputedStyle(el).backgroundColor) === 'rgba(0, 0, 0, 0)', 'Dark icons must keep their existing appearance');
    await page.emulateMedia({ colorScheme: 'light' });
    console.log('PASS transparent icons: white and black Favorites, hover/active contrast, pinned icon backing, thin border and original artwork/size');
  } finally {
    await page.evaluate(model => chrome.storage.local.set({ arcSidebarModel: model }), original);
    await page.locator('.favorite-tile[data-favorite-id="black-icon"]').waitFor({ state: 'detached' });
  }
}
