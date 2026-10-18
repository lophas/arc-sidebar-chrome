export const SPACE_PALETTES = [
  { id: 'black', name: 'Classic (black)', colors: ['#18181a'] },
  { id: 'blue', name: 'Ocean', colors: ['#1855c9', '#10b5c2'] },
  { id: 'green', name: 'Forest', colors: ['#15803d', '#80b426'] },
  { id: 'purple', name: 'Aurora', colors: ['#6920ca', '#db337b'] },
  { id: 'orange', name: 'Amber', colors: ['#e76b17', '#d69d19'] },
  { id: 'cyan', name: 'Lagoon', colors: ['#087b91', '#16b6a2'] },
  { id: 'pink', name: 'Blossom', colors: ['#d72f92', '#a233ce'] },
  { id: 'red', name: 'Sunset', colors: ['#c92e43', '#ed7438'] },
  { id: 'yellow', name: 'Citrus', colors: ['#b28c05', '#86a81a'] },
  { id: 'grey', name: 'Slate', colors: ['#52637a', '#797085'] }
];
const presets = new Map(SPACE_PALETTES.map(palette => [palette.id, palette]));
export const DEFAULT_SPACE_PALETTE = { id: 'black', kind: 'preset' };

export function normalizeHex(value) {
  if (typeof value !== 'string') return null;
  const text = value.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(text)) return text;
  if (/^#[0-9a-f]{3}$/.test(text)) return '#' + [...text.slice(1)].map(char => char + char).join('');
  return null;
}

export function normalizeSpacePalette(value) {
  if (value?.kind === 'preset' && presets.has(value.id)) return { id: value.id, kind: 'preset' };
  if (!['solid', 'gradient'].includes(value?.kind)) return null;
  const colors = (Array.isArray(value.colors) ? value.colors : []).map(normalizeHex);
  const length = value.kind === 'solid' ? 1 : 2;
  return colors.length === length && colors.every(Boolean) ? { colors, kind: value.kind } : null;
}

export function paletteColors(value) {
  const palette = normalizeSpacePalette(value) || DEFAULT_SPACE_PALETTE;
  return palette.kind === 'preset' ? [...presets.get(palette.id).colors] : [...palette.colors];
}

// Default to Classic and keep saved palettes attached to each Space's identity.
// Existing colors, icons, folders and other model fields are retained.
export function withSpacePalettes(model) {
  if (!Array.isArray(model?.spaces)) return model;
  let changed = false;
  const spaces = model.spaces.map(space => {
    const palette = normalizeSpacePalette(space.palette) || { ...DEFAULT_SPACE_PALETTE };
    const same = space.palette?.kind === palette.kind && Object.keys(space.palette).length === 2 &&
      (palette.kind === 'preset' ? space.palette.id === palette.id : JSON.stringify(space.palette.colors) === JSON.stringify(palette.colors));
    if (same) return space;
    changed = true;
    return Object.fromEntries(Object.entries({ ...space, palette }).sort(([a], [b]) => a.localeCompare(b)));
  });
  return changed ? { ...model, spaces } : model;
}

export function isAutomaticPaletteMigration(before, after) {
  const upgraded = withSpacePalettes(before);
  if (!before || upgraded === before) return false;
  const ordered = value => Array.isArray(value) ? value.map(ordered) : value && typeof value === 'object'
    ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => [key, ordered(value)])) : value;
  return JSON.stringify(ordered(upgraded)) === JSON.stringify(ordered(after));
}

export function nextSpacePalette() {
  return { ...DEFAULT_SPACE_PALETTE };
}

export function hasCustomSpacePalette(space) {
  const palette = normalizeSpacePalette(space?.palette);
  // Ocean was the generated My Space default in earlier releases. It must not
  // turn an otherwise empty starting profile into a new cloud snapshot.
  return Boolean(palette && (palette.kind !== 'preset' ||
    (palette.id !== DEFAULT_SPACE_PALETTE.id && !(space.id === '__my_space__' && palette.id === 'blue'))));
}

const rgb = color => [1, 3, 5].map(offset => parseInt(color.slice(offset, offset + 2), 16));
const blend = (color, base, amount) => '#' + rgb(color).map((channel, index) =>
  Math.round(channel * amount + rgb(base)[index] * (1 - amount)).toString(16).padStart(2, '0')).join('');

export function paletteGroupColor(value) {
  const palette = normalizeSpacePalette(value) || DEFAULT_SPACE_PALETTE;
  if (palette.kind === 'preset') return palette.id === 'black' ? 'grey' : palette.id;
  const [r, g, b] = rgb(palette.colors[0]).map(channel => channel / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min;
  if (delta < 0.08) return 'grey';
  let hue = max === r ? ((g - b) / delta) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
  hue = (hue * 60 + 360) % 360;
  const hues = { blue: 217, green: 140, purple: 271, orange: 28, cyan: 184, pink: 332, red: 4, yellow: 50 };
  const distance = target => Math.min(Math.abs(target - hue), 360 - Math.abs(target - hue));
  return Object.keys(hues).reduce((closest, color) => distance(hues[color]) < distance(hues[closest]) ? color : closest, 'blue');
}

const luminance = color => rgb(color).map(channel => channel / 255)
  .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
  .reduce((total, value, index) => total + value * [0.2126, 0.7152, 0.0722][index], 0);
const contrast = (a, b) => (Math.max(luminance(a), luminance(b)) + 0.05) / (Math.min(luminance(a), luminance(b)) + 0.05);
export function selectedBackground(background, text, muted = text) {
  // Match the default folder's 16% foreground tint, reducing it only when an
  // extreme custom color would make the active row's text hard to read.
  for (let percent = 16; percent >= 0; percent -= 2) {
    const color = blend(text, background, percent / 100);
    if (contrast(text, color) >= 4.5 && contrast(muted, color) >= 4.5) return color;
  }
  return background;
}
function readableBackground(color, dark, text) {
  const base = dark ? '#11141b' : '#e7e9ed', amount = dark ? 0.60 : 0.40;
  const background = blend(color, base, amount);
  if (contrast(text, background) >= 4.5) return background;
  // Keep vivid presets while limiting exceptionally bright/dark custom colors.
  let low = 0, high = amount;
  for (let step = 0; step < 12; step++) {
    const middle = (low + high) / 2;
    if (contrast(text, blend(color, base, middle)) >= 4.5) low = middle;
    else high = middle;
  }
  return blend(color, base, low);
}

export const PALETTE_VARIABLES = ['color-scheme', '--space-background', '--bg', '--panel', '--text', '--muted', '--border', '--hover', '--active', '--space-accent', '--favorite-background', '--favorite-border', '--favorite-hover'];
export function paletteStyle(value, dark = false) {
  const palette = normalizeSpacePalette(value) || DEFAULT_SPACE_PALETTE;
  if (palette.kind === 'preset' && palette.id === 'black') return {
    'color-scheme': 'dark',
    '--space-background': '#18181a',
    '--bg': '#18181a',
    '--panel': '#202023',
    '--text': '#f4f4f5',
    '--muted': '#a0a0a6',
    '--border': 'rgba(255,255,255,.10)',
    '--hover': 'rgba(255,255,255,.065)',
    '--active': 'rgba(255,255,255,.12)',
    '--space-accent': '#a0a0a6',
    '--favorite-background': 'rgba(255,255,255,.16)',
    '--favorite-border': 'rgba(255,255,255,.28)',
    '--favorite-hover': 'rgba(255,255,255,.23)'
  };
  const colors = paletteColors(value);
  const muted = dark ? '#edf2fa' : '#374151';
  const backgrounds = colors.map(color => readableBackground(color, dark, muted));
  const primary = colors[0];
  return {
    'color-scheme': dark ? 'dark' : 'light',
    '--space-background': backgrounds.length === 1 ? backgrounds[0] : `linear-gradient(155deg, ${backgrounds[0]}, ${backgrounds[1]})`,
    '--bg': backgrounds[0],
    '--panel': blend(primary, dark ? '#191d25' : '#eef0f3', dark ? 0.28 : 0.12),
    '--text': dark ? '#f4f6fb' : '#18202a',
    '--muted': muted,
    '--border': dark ? 'rgba(255,255,255,.20)' : 'rgba(0,0,0,.16)',
    '--hover': dark ? 'rgba(255,255,255,.12)' : 'rgba(0,0,0,.065)',
    '--active': dark ? 'rgba(255,255,255,.18)' : 'rgba(0,0,0,.11)',
    '--space-accent': blend(primary, dark ? '#ffffff' : '#18202a', 0.55),
    '--favorite-background': dark ? 'rgba(255,255,255,.16)' : 'rgba(88,101,121,.14)',
    '--favorite-border': dark ? 'rgba(255,255,255,.28)' : 'rgba(0,0,0,.18)',
    '--favorite-hover': dark ? 'rgba(255,255,255,.23)' : 'rgba(88,101,121,.22)'
  };
}

export function applyPaletteStyle(element, palette, dark = false) {
  for (const variable of PALETTE_VARIABLES) element.style.removeProperty(variable);
  if (palette) for (const [variable, value] of Object.entries(paletteStyle(palette, dark))) element.style.setProperty(variable, value);
}
