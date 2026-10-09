import { isSidebarActive } from './lifecycle.js';
import { createStorageClient } from '../shared/storage-client.js';
const sidebarStorage = createStorageClient({ isActive: isSidebarActive });
const STORAGE_KEY = 'arcSidebarModel';
const IMAGE_ICON_PREFIX = 'data:image/';
const MAX_SOURCE_ICON_BYTES = 2 * 1024 * 1024;
const MAX_STORED_ICON_CHARS = 24000;
const ACCEPTED_ICON_TYPES = new Set(['image/svg+xml', 'image/png', 'image/webp', 'image/jpeg']);

let editingSpaceId = null;
let addingSpace = false;
let pendingSpaceIconSave = null;
let applyingSpaceIconSave = false;

const BASE_EMOJIS = [
  ['😀','grinning face smile happy'],['😃','grinning face smile happy'],['😄','smile happy grin'],['😁','beaming grin happy'],['😆','laugh laughing'],['😅','smile sweat'],['😂','tears joy laugh'],['🤣','rofl laugh'],['🙂','smile happy'],['🙃','upside down'],['😉','wink'],['😊','blush smile'],['😇','angel halo'],['🥰','love hearts'],['😍','heart eyes love'],['🤩','star struck'],['😘','kiss'],['😋','yummy food'],['😛','tongue playful'],['😜','wink tongue'],['🤪','zany crazy'],['😎','cool sunglasses'],['🤓','nerd glasses'],['🤔','thinking'],['🤐','zipper mouth'],['😐','neutral'],['🙄','rolling eyes'],['😴','sleep'],['🥳','party birthday'],['😢','cry sad'],['😭','crying sad'],['😱','scream fear'],['😡','angry'],['😈','devil'],['👻','ghost'],['🤖','robot'],
  ['❤️','red heart love'],['🧡','orange heart'],['💛','yellow heart'],['💚','green heart'],['💙','blue heart'],['💜','purple heart'],['🖤','black heart'],['🤍','white heart'],['🤎','brown heart'],['💔','broken heart'],['💕','hearts love'],['💖','sparkling heart'],['⭐','star favorite'],['🌟','glowing star'],['✨','sparkles'],['🔥','fire hot'],['⚡','lightning power'],
  ['👍','thumbs up yes like'],['👎','thumbs down no'],['👌','ok hand'],['✌️','victory peace'],['🤞','crossed fingers luck'],['🤘','rock horns'],['🤙','call me'],['👋','wave hello bye'],['👏','applause clap'],['🙌','celebrate'],['🙏','pray thanks'],['💪','strong muscle'],['👀','eyes watch'],['🧠','brain mind'],['👤','person profile'],['👥','people group'],['👨‍💻','man technologist computer developer'],['👩‍💻','woman technologist computer developer'],['🧑‍💻','technologist computer developer'],['👨‍🔧','mechanic repair'],['👩‍🔧','mechanic repair'],['🧑‍🔧','mechanic repair'],['👨‍🏫','teacher school'],['👩‍🏫','teacher school'],['🧑‍🏫','teacher school'],['👨‍⚕️','doctor health'],['👩‍⚕️','doctor health'],['🧑‍⚕️','doctor health'],['👨‍🎨','artist art'],['👩‍🎨','artist art'],['🧑‍🎨','artist art'],['👨‍🚀','astronaut space'],['👩‍🚀','astronaut space'],['🧑‍🚀','astronaut space'],
  ['🏠','home house'],['🏡','home garden house'],['🏢','office business work'],['🏭','factory industry'],['🏥','hospital health'],['🏫','school education'],['🏛️','government museum classical building'],['🏦','bank finance'],['🏪','shop store'],['🏬','shopping store'],['💼','briefcase business work'],['🛒','shopping cart'],['🛍️','shopping bags'],['💰','money finance'],['💵','dollar money'],['💶','euro money'],['💳','credit card payment'],['🧾','receipt invoice'],
  ['📁','folder file'],['📂','open folder file'],['🗂️','files index'],['📄','document file'],['📝','note memo edit'],['📌','pin'],['📍','location pin'],['🔖','bookmark'],['🏷️','tag label'],['📚','books reading library'],['📖','book reading'],['📰','newspaper news'],['✏️','pencil edit'],['🖊️','pen edit'],
  ['💻','laptop computer'],['🖥️','desktop computer monitor'],['⌨️','keyboard'],['🖱️','mouse computer'],['📱','phone mobile'],['☎️','telephone'],['📞','phone call'],['📡','antenna network'],['🛰️','satellite network space'],['🌐','web internet globe'],['☁️','cloud'],['⚙️','settings gear'],['🔧','wrench tool repair'],['🛠️','tools repair'],['🧰','toolbox'],['🔌','plug power'],['🔋','battery power'],['💡','idea light bulb'],['🔒','lock security'],['🔓','unlock security'],['🔑','key password'],['🛡️','shield security'],['🧪','test lab'],['🔬','microscope science'],
  ['✉️','mail envelope'],['📧','email mail'],['📨','incoming mail'],['📩','mail'],['💬','chat message'],['💭','thought'],['🔔','notification bell'],['🔕','mute bell'],['📅','calendar date'],['📆','calendar date'],['⏰','alarm time'],['⌚','watch time'],['⏱️','stopwatch timer'],['⏲️','timer'],
  ['☀️','sun weather'],['🌤️','sun cloud weather'],['🌧️','rain weather'],['❄️','snow cold'],['🌙','moon night'],['🌍','earth world europe africa'],['🌎','earth world americas'],['🌏','earth world asia australia'],['🌈','rainbow'],['🌲','tree nature'],['🌳','tree nature'],['🌴','palm tree'],['🌵','cactus'],['🌸','flower blossom'],['🌹','rose flower'],
  ['✈️','plane airplane flight travel'],['🚗','car vehicle'],['🚕','taxi'],['🚌','bus'],['🚆','train railway'],['🚲','bike bicycle'],['🚀','rocket launch space'],['⛽','fuel petrol gas'],['🚦','traffic light'],['🗺️','map travel'],['🧭','compass navigation'],['⚓','anchor ship'],['⛵','sailboat boat'],
  ['🎬','movie film cinema'],['📺','television tv'],['📷','camera photo'],['🎵','music note'],['🎶','music notes'],['🎧','headphones audio'],['🎤','microphone voice'],['🎮','game gaming'],['🏆','trophy award'],['⚽','football soccer'],['🏀','basketball'],['🎾','tennis'],['🏁','flag finish race'],['☕','coffee drink'],['🍽️','food meal'],['🍕','pizza food'],['🍔','burger food'],['🍎','apple fruit'],['🍺','beer drink'],
  ['✅','check done yes'],['❌','cross no cancel error'],['⚠️','warning caution'],['❗','important exclamation'],['❓','question help'],['➕','plus add'],['➖','minus remove'],['🔴','red circle'],['🟠','orange circle'],['🟡','yellow circle'],['🟢','green circle'],['🔵','blue circle'],['🟣','purple circle'],['⚫','black circle'],['⚪','white circle'],['🏳️‍🌈','rainbow flag pride'],['🏳️‍⚧️','transgender flag'],['🏴‍☠️','pirate flag']
];

const COUNTRY_CODES = `AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW`.split(' ');

function flagFor(code) {
  return String.fromCodePoint(...code.split('').map(char => 0x1f1e6 + char.charCodeAt(0) - 65));
}

function countryKeywords(code) {
  let en = code;
  let hu = '';
  try { en = new Intl.DisplayNames(['en'], { type: 'region' }).of(code) || code; } catch {}
  try { hu = new Intl.DisplayNames(['hu'], { type: 'region' }).of(code) || ''; } catch {}
  const aliases = {
    AR: 'argentine argentinian argentina', FR: 'french france francia', GB: 'uk united kingdom britain british england',
    US: 'usa united states america american', DE: 'germany german deutschland', HU: 'hungary hungarian magyar magyarország',
    IL: 'israel israeli', IT: 'italy italian', ES: 'spain spanish', PT: 'portugal portuguese',
    AT: 'austria austrian', CH: 'switzerland swiss', NL: 'netherlands dutch holland', BE: 'belgium belgian',
    PL: 'poland polish', CZ: 'czechia czech', SK: 'slovakia slovak', RO: 'romania romanian', HR: 'croatia croatian',
    RS: 'serbia serbian', UA: 'ukraine ukrainian', RU: 'russia russian', TR: 'turkey turkish',
    CN: 'china chinese', JP: 'japan japanese', KR: 'south korea korean', IN: 'india indian', AU: 'australia australian',
    CA: 'canada canadian', BR: 'brazil brazilian', MX: 'mexico mexican'
  };
  return `flag country ${code} ${en} ${hu} ${aliases[code] || ''}`.trim();
}

const EMOJI_ENTRIES = [
  ...BASE_EMOJIS,
  ...COUNTRY_CODES.map(code => [flagFor(code), countryKeywords(code)])
];

function isImageIcon(value) {
  return typeof value === 'string' && value.startsWith(IMAGE_ICON_PREFIX);
}

function fileToImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read this image.')); };
    image.src = url;
  });
}

async function rasterizeIconFile(file, size) {
  const image = await fileToImage(file);
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  if (!width || !height) throw new Error('Image has no usable dimensions.');
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d', { alpha: true });
  const scale = Math.min(size / width, size / height);
  const drawWidth = Math.max(1, Math.round(width * scale));
  const drawHeight = Math.max(1, Math.round(height * scale));
  ctx.clearRect(0, 0, size, size);
  ctx.drawImage(image, Math.round((size - drawWidth) / 2), Math.round((size - drawHeight) / 2), drawWidth, drawHeight);
  return canvas.toDataURL('image/webp', 0.9);
}

async function prepareIconFile(file) {
  if (!file) throw new Error('No file selected.');
  if (file.size > MAX_SOURCE_ICON_BYTES) throw new Error('Icon file is too large. Maximum source size is 2 MB.');
  const type = file.type || '';
  const extensionOk = /\.(svg|png|webp|jpe?g)$/i.test(file.name || '');
  if (!ACCEPTED_ICON_TYPES.has(type) && !extensionOk) throw new Error('Use an SVG, PNG, WebP or JPEG image.');
  for (const size of [64, 48, 32]) {
    const dataUrl = await rasterizeIconFile(file, size);
    if (dataUrl.length <= MAX_STORED_ICON_CHARS) return dataUrl;
  }
  throw new Error('The icon could not be compressed enough for safe Sync/Backup storage.');
}

function setSpacePreview(dialog, value) {
  const preview = dialog.querySelector('#spaceIconPreview');
  if (!preview) return;
  if (isImageIcon(value)) {
    const image = document.createElement('img');
    image.src = value;
    image.alt = '';
    image.className = 'space-custom-image';
    preview.replaceChildren(image);
  } else {
    const emoji = dialog.querySelector('#spaceEmoji')?.value.trim() || '';
    const name = dialog.querySelector('#spaceName')?.value.trim() || '';
    preview.textContent = emoji || name.slice(0, 1).toUpperCase() || '•';
  }
}

function setStatus(dialog, text, error = false) {
  const status = dialog.querySelector('.space-icon-status');
  if (!status) return;
  status.textContent = text || '';
  status.classList.toggle('error', Boolean(error));
}

function setImageState(dialog, dataUrl = '', fileName = '') {
  if (dataUrl) dialog.dataset.spaceFileIcon = dataUrl;
  else delete dialog.dataset.spaceFileIcon;
  const preview = dialog.querySelector('.space-image-preview');
  const image = preview?.querySelector('img');
  const name = preview?.querySelector('span');
  if (preview && image && name) {
    if (dataUrl) {
      image.src = dataUrl;
      name.textContent = fileName || 'Custom image icon';
      preview.hidden = false;
    } else {
      image.removeAttribute('src');
      name.textContent = '';
      preview.hidden = true;
    }
  }
  setSpacePreview(dialog, dataUrl);
}

async function loadCurrentSpaceIcon(dialog) {
  if (!editingSpaceId) { setImageState(dialog, ''); return; }
  const stored = await sidebarStorage.local.get(STORAGE_KEY);
  const space = stored[STORAGE_KEY]?.spaces?.find(candidate => candidate.id === editingSpaceId);
  if (isImageIcon(space?.icon)) setImageState(dialog, space.icon, 'Current custom image icon');
  else setImageState(dialog, '');
}

function populateFullEmojiGrid(dialog) {
  const grid = dialog.querySelector('#spaceEmojiGrid');
  const input = dialog.querySelector('#spaceEmoji');
  if (!grid || !input || grid.dataset.fullEmojiSet === '1') return;
  grid.dataset.fullEmojiSet = '1';
  grid.replaceChildren();
  const fragment = document.createDocumentFragment();
  for (const [emoji, keywords] of EMOJI_ENTRIES) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'space-emoji-choice';
    button.textContent = emoji;
    button.title = keywords.split(' ').slice(0, 5).join(' ');
    button.dataset.search = `${emoji} ${keywords}`.toLowerCase();
    button.addEventListener('click', () => {
      setImageState(dialog, '');
      input.value = emoji;
      setSpacePreview(dialog, '');
      grid.querySelectorAll('.selected').forEach(el => el.classList.remove('selected'));
      button.classList.add('selected');
      setStatus(dialog, '');
    });
    fragment.append(button);
  }
  grid.append(fragment);
}

function addImageControls(dialog) {
  const editor = dialog.querySelector('.space-icon-editor');
  if (!editor || editor.querySelector('.space-image-dropzone')) return;
  const wrap = document.createElement('div');
  wrap.className = 'space-image-controls';
  wrap.innerHTML = `
    <div class="space-image-separator">or use an image</div>
    <div class="space-image-dropzone" role="button" tabindex="0">
      <strong>Drop icon here</strong>
      <span>SVG, PNG, WebP or JPEG · or click to choose</span>
      <input class="space-image-file-input" type="file" accept="image/svg+xml,image/png,image/webp,image/jpeg" hidden>
    </div>
    <div class="space-image-preview" hidden><img alt=""><span></span></div>
    <div class="space-icon-status" aria-live="polite"></div>`;
  editor.append(wrap);

  const dropzone = wrap.querySelector('.space-image-dropzone');
  const fileInput = wrap.querySelector('.space-image-file-input');
  const emojiInput = dialog.querySelector('#spaceEmoji');
  const nameInput = dialog.querySelector('#spaceName');
  const useFile = async file => {
    try {
      dropzone.classList.add('busy');
      setStatus(dialog, 'Preparing icon…');
      const dataUrl = await prepareIconFile(file);
      if (emojiInput) emojiInput.value = '';
      dialog.querySelectorAll('.space-emoji-choice.selected').forEach(el => el.classList.remove('selected'));
      setImageState(dialog, dataUrl, file.name || 'Custom image icon');
      setStatus(dialog, 'Image icon ready. Save to apply it.');
    } catch (error) {
      setStatus(dialog, error?.message || 'Could not use this icon.', true);
    } finally { dropzone.classList.remove('busy'); }
  };
  const choose = () => fileInput.click();
  dropzone.addEventListener('click', choose);
  dropzone.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); choose(); }
  });
  fileInput.addEventListener('click', event => event.stopPropagation());
  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (file) useFile(file);
    fileInput.value = '';
  });
  for (const eventName of ['dragenter', 'dragover']) {
    dropzone.addEventListener(eventName, event => {
      event.preventDefault(); event.stopPropagation(); dropzone.classList.add('dragover');
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    });
  }
  for (const eventName of ['dragleave', 'drop']) {
    dropzone.addEventListener(eventName, event => { event.preventDefault(); event.stopPropagation(); dropzone.classList.remove('dragover'); });
  }
  dropzone.addEventListener('drop', event => {
    const file = event.dataTransfer?.files?.[0];
    if (file) useFile(file);
  });
  emojiInput?.addEventListener('input', () => { if (emojiInput.value.trim()) setImageState(dialog, ''); });
  nameInput?.addEventListener('input', () => {
    const image = dialog.dataset.spaceFileIcon || '';
    if (image) setSpacePreview(dialog, image);
  });
}

async function enhanceSpaceDialog() {
  const dialog = document.querySelector('.space-dialog');
  if (!dialog?.open) return false;
  populateFullEmojiGrid(dialog);
  addImageControls(dialog);
  await loadCurrentSpaceIcon(dialog);
  return true;
}

function enhanceSpaceDialogWhenReady(attempt = 0) {
  setTimeout(async () => {
    const ok = await enhanceSpaceDialog().catch(() => false);
    if (!ok && attempt < 30) enhanceSpaceDialogWhenReady(attempt + 1);
  }, attempt === 0 ? 0 : 20);
}

async function decorateSpaceButtons() {
  if (!isSidebarActive()) return;
  const nav = document.querySelector('#spaces');
  if (!nav) return;
  const stored = await sidebarStorage.local.get(STORAGE_KEY);
  const spaces = stored[STORAGE_KEY]?.spaces || [];
  const byId = new Map(spaces.map(space => [space.id, space]));
  for (const button of nav.querySelectorAll('.space-button[data-space-id]')) {
    const space = byId.get(button.dataset.spaceId);
    if (!isImageIcon(space?.icon)) continue;
    for (const node of [...button.childNodes]) if (node.nodeType === Node.TEXT_NODE) node.remove();
    let image = button.querySelector('.space-custom-image');
    if (!image) {
      image = document.createElement('img');
      image.className = 'space-custom-image';
      image.alt = '';
      button.prepend(image);
    }
    image.src = space.icon;
  }
}

function armSpaceSave() {
  const dialog = document.querySelector('.space-dialog');
  if (!dialog?.open) return;
  pendingSpaceIconSave = {
    id: editingSpaceId,
    adding: addingSpace,
    title: dialog.querySelector('#spaceName')?.value.trim() || '',
    icon: dialog.dataset.spaceFileIcon || '',
    emoji: dialog.querySelector('#spaceEmoji')?.value.trim() || ''
  };
}

async function applyPendingSpaceIcon(modelFromChange) {
  if (!pendingSpaceIconSave || applyingSpaceIconSave || !modelFromChange) return;
  applyingSpaceIconSave = true;
  const pending = pendingSpaceIconSave;
  pendingSpaceIconSave = null;
  try {
    const model = structuredClone(modelFromChange);
    let space = pending.id ? model.spaces?.find(candidate => candidate.id === pending.id) : null;
    if (!space && pending.adding) space = [...(model.spaces || [])].reverse().find(candidate => candidate.title === pending.title) || model.spaces?.at(-1);
    if (!space) return;
    const oldIcon = space.icon || '';
    const oldEmoji = space.emoji || '';
    if (pending.icon) { space.icon = pending.icon; space.emoji = ''; }
    else { delete space.icon; space.emoji = pending.emoji; }
    if ((space.icon || '') !== oldIcon || (space.emoji || '') !== oldEmoji) await sidebarStorage.local.set({ [STORAGE_KEY]: model }, { before: { [STORAGE_KEY]: modelFromChange } });
  } finally { applyingSpaceIconSave = false; }
}

async function applyPendingExistingSpaceIcon() {
  if (!pendingSpaceIconSave || pendingSpaceIconSave.adding) return;
  const stored = await sidebarStorage.local.get(STORAGE_KEY);
  if (stored[STORAGE_KEY]) await applyPendingSpaceIcon(stored[STORAGE_KEY]);
}

document.addEventListener('contextmenu', event => {
  const button = event.target.closest?.('.space-button[data-space-id]');
  if (!button || button.classList.contains('space-add-button') || button.querySelector('.space-count')) return;
  editingSpaceId = button.dataset.spaceId || null;
  addingSpace = false;
  enhanceSpaceDialogWhenReady();
}, true);

document.addEventListener('click', event => {
  const add = event.target.closest?.('.space-add-button');
  if (add) {
    editingSpaceId = null;
    addingSpace = true;
    enhanceSpaceDialogWhenReady();
    return;
  }
  if (event.target?.id === 'spaceSave') {
    armSpaceSave();
    setTimeout(() => applyPendingExistingSpaceIcon().catch(error => console.warn('Arc Side of the Chrome: Space image icon save fallback failed', error)), 80);
  }
}, true);

const dialogObserver = new MutationObserver(records => {
  for (const record of records) {
    if (record.type !== 'attributes' || record.attributeName !== 'open') continue;
    const dialog = record.target;
    if (dialog instanceof HTMLDialogElement && dialog.classList.contains('space-dialog') && dialog.open) enhanceSpaceDialog().catch(() => {});
  }
});
dialogObserver.observe(document.documentElement, { subtree: true, attributes: true, attributeFilter: ['open'] });

window.addEventListener('arc-sidebar-rendered', () => queueMicrotask(() => decorateSpaceButtons().catch(() => {})));
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes[STORAGE_KEY]) return;
  if (pendingSpaceIconSave && !applyingSpaceIconSave) applyPendingSpaceIcon(changes[STORAGE_KEY].newValue).catch(() => {});
  queueMicrotask(() => decorateSpaceButtons().catch(() => {}));
});

decorateSpaceButtons().catch(() => {});
