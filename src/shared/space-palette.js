export const SPACE_PALETTES = [
  { id: 'blue', name: 'Ocean', colors: ['#4b83d1', '#49a4ad'] },
  { id: 'green', name: 'Forest', colors: ['#3c9b75', '#7da45d'] },
  { id: 'purple', name: 'Lavender', colors: ['#9472c5', '#b477a2'] },
  { id: 'orange', name: 'Amber', colors: ['#c98445', '#c6a856'] },
  { id: 'cyan', name: 'Lagoon', colors: ['#41a4b5', '#60a18a'] },
  { id: 'pink', name: 'Blossom', colors: ['#cc77a5', '#c88679'] },
  { id: 'red', name: 'Rose', colors: ['#d85e65', '#be7b8e'] },
  { id: 'yellow', name: 'Sunshine', colors: ['#d3a72b', '#b6ad64'] },
  { id: 'grey', name: 'Slate', colors: ['#718096', '#8a819c'] }
];
const presets = new Map(SPACE_PALETTES.map(palette => [palette.id, palette]));
export const DEFAULT_SPACE_PALETTE = { kind: 'preset', id: 'blue' };

export function normalizeHex(value) {
  if (typeof value !== 'string') return null;
  const text = value.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(text)) return text;
  if (/^#[0-9a-f]{3}$/.test(text)) return '#' + [...text.slice(1)].map(char => char + char).join('');
  return null;
}

export function normalizeSpacePalette(value) {
  if (value?.kind === 'preset' && presets.has(value.id)) return { kind: 'preset', id: value.id };
  if (!['solid', 'gradient'].includes(value?.kind)) return null;
  const colors = (Array.isArray(value.colors) ? value.colors : []).map(normalizeHex);
  const length = value.kind === 'solid' ? 1 : 2;
  return colors.length === length && colors.every(Boolean) ? { kind: value.kind, colors } : null;
}

export function paletteColors(value) {
  const palette = normalizeSpacePalette(value) || DEFAULT_SPACE_PALETTE;
  return palette.kind === 'preset' ? [...presets.get(palette.id).colors] : [...palette.colors];
}

// Assign once and keep the result attached to the Space's stable identity.
// Existing colors, icons, folders and other model fields are retained.
export function withSpacePalettes(model) {
  if (!Array.isArray(model?.spaces)) return model;
  let changed = false;
  const spaces = model.spaces.map((space, index) => {
    const palette = normalizeSpacePalette(space.palette) || { kind: 'preset', id: SPACE_PALETTES[index % SPACE_PALETTES.length].id };
    if (JSON.stringify(palette) === JSON.stringify(space.palette)) return space;
    changed = true;
    return { ...space, palette };
  });
  return changed ? { ...model, spaces } : model;
}

export function nextSpacePalette(spaces = []) {
  const used = new Set(spaces.map(space => normalizeSpacePalette(space.palette)?.id));
  return { kind: 'preset', id: (SPACE_PALETTES.find(palette => !used.has(palette.id)) || SPACE_PALETTES[spaces.length % SPACE_PALETTES.length]).id };
}

export function hasCustomSpacePalette(space) {
  const palette = normalizeSpacePalette(space?.palette);
  return Boolean(palette && JSON.stringify(palette) !== JSON.stringify(DEFAULT_SPACE_PALETTE));
}

const rgb = color => [1, 3, 5].map(offset => parseInt(color.slice(offset, offset + 2), 16));
const blend = (color, base, amount) => '#' + rgb(color).map((channel, index) =>
  Math.round(channel * amount + rgb(base)[index] * (1 - amount)).toString(16).padStart(2, '0')).join('');

export function paletteGroupColor(value) {
  const palette = normalizeSpacePalette(value) || DEFAULT_SPACE_PALETTE;
  if (palette.kind === 'preset') return palette.id;
  const [r, g, b] = rgb(palette.colors[0]).map(channel => channel / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min;
  if (delta < 0.08) return 'grey';
  let hue = max === r ? ((g - b) / delta) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
  hue = (hue * 60 + 360) % 360;
  const hues = { blue: 217, green: 140, purple: 271, orange: 28, cyan: 184, pink: 332, red: 4, yellow: 50 };
  const distance = target => Math.min(Math.abs(target - hue), 360 - Math.abs(target - hue));
  return Object.keys(hues).reduce((closest, color) => distance(hues[color]) < distance(hues[closest]) ? color : closest, 'blue');
}

export const PALETTE_VARIABLES = ['--space-background', '--bg', '--panel', '--text', '--muted', '--border', '--hover', '--active', '--space-accent'];
export function paletteStyle(value, dark = false) {
  const colors = paletteColors(value);
  const backgrounds = colors.map(color => blend(color, dark ? '#11141b' : '#ffffff', dark ? 0.24 : 0.18));
  const primary = colors[0];
  return {
    '--space-background': backgrounds.length === 1 ? backgrounds[0] : `linear-gradient(155deg, ${backgrounds[0]}, ${backgrounds[1]})`,
    '--bg': backgrounds[0],
    '--panel': blend(primary, dark ? '#191d25' : '#ffffff', dark ? 0.16 : 0.07),
    '--text': dark ? '#f4f6fb' : '#18202a',
    '--muted': dark ? '#c1c8d1' : '#485261',
    '--border': dark ? 'rgba(255,255,255,.15)' : 'rgba(0,0,0,.13)',
    '--hover': dark ? 'rgba(255,255,255,.09)' : 'rgba(0,0,0,.065)',
    '--active': dark ? 'rgba(255,255,255,.16)' : 'rgba(0,0,0,.11)',
    '--space-accent': blend(primary, dark ? '#ffffff' : '#18202a', 0.65)
  };
}

export function applyPaletteStyle(element, palette, dark = false) {
  for (const variable of PALETTE_VARIABLES) element.style.removeProperty(variable);
  if (palette) for (const [variable, value] of Object.entries(paletteStyle(palette, dark))) element.style.setProperty(variable, value);
}
