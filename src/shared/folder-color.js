import { normalizeHex, paletteStyle } from './space-palette.js';

export const FOLDER_COLORS = [
  { name: 'Amber', color: '#c98b52' },
  { name: 'Violet', color: '#9e79d1' },
  { name: 'Green', color: '#56a58c' },
  { name: 'Blue', color: '#6599d3' },
  { name: 'Rose', color: '#d36c78' },
  { name: 'Pink', color: '#ce7fa8' },
  { name: 'Cyan', color: '#51a9ba' },
  { name: 'Slate', color: '#8993a6' }
];

export const normalizeFolderColor = normalizeHex;

export function folderColorStyle(value, dark = false) {
  const color = normalizeFolderColor(value);
  if (!color) return {};
  // Use the same contrast rules as Space palettes, including extreme custom colors.
  const palette = paletteStyle({ kind: 'solid', colors: [color] }, dark);
  return {
    '--folder-heading': palette['--bg'],
    '--folder-background': palette['--panel'],
    '--folder-foreground': palette['--text'],
    '--folder-muted': palette['--muted'],
    '--folder-selected': palette['--bg'],
    '--folder-border': `color-mix(in srgb, ${palette['--text']} 22%, ${palette['--panel']})`
  };
}

const variables = Object.keys(folderColorStyle(FOLDER_COLORS[0].color));

export function applyFolderColor(element, value) {
  const color = normalizeFolderColor(value);
  for (const variable of variables) element.style.removeProperty(variable);
  if (!color) { delete element.dataset.folderColor; return; }
  element.dataset.folderColor = color;
  const light = folderColorStyle(color), dark = folderColorStyle(color, true);
  // Theme switches are handled by CSS; no extra listeners or per-tab work.
  for (const variable of variables) {
    element.style.setProperty(variable, `light-dark(${light[variable]}, ${dark[variable]})`);
  }
}
