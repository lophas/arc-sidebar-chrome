const STORAGE_KEY = 'arcSidebarModel';
const favoritesEl = document.querySelector('#favorites');

const ICONS = {
  messenger: chrome.runtime.getURL('src/sidepanel/icons/messenger.svg'),
  whatsapp: chrome.runtime.getURL('src/sidepanel/icons/whatsapp.svg'),
  homeAssistant: chrome.runtime.getURL('src/sidepanel/icons/home-assistant.svg')
};

function serviceIconFor(item) {
  const title = (item?.title || '').toLowerCase();
  let host = '';
  let path = '';

  try {
    const url = new URL(item?.url || '');
    host = url.hostname.toLowerCase();
    path = url.pathname.toLowerCase();
  } catch {}

  const isMessenger =
    host === 'messenger.com' ||
    host.endsWith('.messenger.com') ||
    ((host === 'facebook.com' || host.endsWith('.facebook.com')) && path.startsWith('/messages')) ||
    title.includes('messenger');

  if (isMessenger) return ICONS.messenger;

  const isWhatsApp =
    host === 'whatsapp.com' ||
    host.endsWith('.whatsapp.com') ||
    title.includes('whatsapp');

  if (isWhatsApp) return ICONS.whatsapp;

  const isHomeAssistant =
    host.includes('homeassistant') ||
    host.includes('home-assistant') ||
    title.includes('home assistant');

  if (isHomeAssistant) return ICONS.homeAssistant;

  return null;
}

async function applyFavoriteIcons() {
  if (!favoritesEl) return;

  const stored = await chrome.storage.local.get(STORAGE_KEY);
  const favorites = stored[STORAGE_KEY]?.favorites || [];
  const tiles = [...favoritesEl.querySelectorAll('.favorite-tile')];

  tiles.forEach((tile, index) => {
    const icon = serviceIconFor(favorites[index]);
    if (!icon) return;

    const img = tile.querySelector('img');
    if (!img || img.dataset.serviceIcon === icon) return;
    img.dataset.serviceIcon = icon;
    img.src = icon;
  });
}

window.addEventListener('arc-sidebar-rendered', () => queueMicrotask(applyFavoriteIcons));
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes[STORAGE_KEY]) queueMicrotask(applyFavoriteIcons);
});

applyFavoriteIcons();
