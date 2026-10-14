import { SPACE_PALETTES, normalizeSpacePalette, normalizeHex, paletteColors, paletteGroupColor, applyPaletteStyle } from '../shared/space-palette.js';

export function createSpacePaletteEditor(dialog) {
  const section = document.createElement('section');
  section.className = 'space-palette-editor';
  section.innerHTML = `
    <label>Palette<select id="spacePaletteKind"><option value="preset">Ready-made palette</option><option value="solid">Custom color</option><option value="gradient">Two-color gradient</option></select></label>
    <div class="space-palette-presets" role="group" aria-label="Choose Space palette"></div>
    <div class="space-palette-colors" hidden>
      <label>Primary color<span class="space-color-input"><input id="spacePaletteColor1" type="color" aria-label="Choose primary color"><input id="spacePaletteHex1" type="text" maxlength="7" spellcheck="false" aria-label="Primary color hex"></span></label>
      <label class="space-palette-second">Second color<span class="space-color-input"><input id="spacePaletteColor2" type="color" aria-label="Choose second color"><input id="spacePaletteHex2" type="text" maxlength="7" spellcheck="false" aria-label="Second color hex"></span></label>
    </div>
    <div class="space-palette-preview"><strong>Space preview</strong><span>Favorites · Search</span><div class="space-palette-preview-link">Pinned link</div></div>
    <span class="space-palette-group-color"></span>`;
  dialog.querySelector('.space-icon-editor').before(section);
  const kind = section.querySelector('#spacePaletteKind');
  const grid = section.querySelector('.space-palette-presets');
  const colorFields = [1, 2].map(number => section.querySelector(`#spacePaletteColor${number}`));
  const hexFields = [1, 2].map(number => section.querySelector(`#spacePaletteHex${number}`));
  let value;
  const dark = () => document.documentElement.dataset.theme === 'dark' || (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);
  const paint = () => {
    const custom = kind.value !== 'preset';
    grid.hidden = custom;
    section.querySelector('.space-palette-colors').hidden = !custom;
    section.querySelector('.space-palette-second').hidden = kind.value !== 'gradient';
    grid.querySelectorAll('button').forEach(button => button.setAttribute('aria-pressed', String(value?.id === button.dataset.paletteId && !custom)));
    applyPaletteStyle(section.querySelector('.space-palette-preview'), value, dark());
    const group = paletteGroupColor(value);
    section.querySelector('.space-palette-group-color').textContent = `Chrome group: ${group[0].toUpperCase() + group.slice(1)}`;
  };
  const setColors = colors => colorFields.forEach((input, index) => {
    input.value = hexFields[index].value = colors[index] || colors[0];
    hexFields[index].setCustomValidity('');
  });
  const readCustom = () => {
    const colors = hexFields.slice(0, kind.value === 'gradient' ? 2 : 1).map(input => normalizeHex(input.value));
    if (colors.every(Boolean)) { value = { kind: kind.value, colors }; paint(); }
  };
  for (const preset of SPACE_PALETTES) {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'space-palette-choice'; button.dataset.paletteId = preset.id;
    button.title = preset.name; button.setAttribute('aria-label', preset.name);
    button.style.background = `linear-gradient(135deg, ${preset.colors.join(', ')})`;
    button.addEventListener('click', () => { value = { kind: 'preset', id: preset.id }; setColors(preset.colors); paint(); });
    grid.append(button);
  }
  kind.addEventListener('change', () => {
    if (kind.value === 'preset') { value = { kind: 'preset', id: paletteGroupColor(value) }; setColors(paletteColors(value)); }
    else value = { kind: kind.value, colors: colorFields.slice(0, kind.value === 'gradient' ? 2 : 1).map(input => input.value) };
    paint();
  });
  colorFields.forEach((input, index) => input.addEventListener('input', () => { hexFields[index].value = input.value; hexFields[index].setCustomValidity(''); readCustom(); }));
  hexFields.forEach((input, index) => input.addEventListener('input', () => {
    const color = normalizeHex(input.value);
    input.setCustomValidity(color ? '' : 'Enter a color such as #4b83d1.');
    if (color) colorFields[index].value = color;
    readCustom();
  }));
  window.addEventListener('arc-sidebar-theme-changed', paint);
  return {
    setValue(palette) { value = normalizeSpacePalette(palette); kind.value = value?.kind || 'preset'; setColors(paletteColors(value)); paint(); },
    getValue() {
      if (kind.value !== 'preset') for (const input of hexFields.slice(0, kind.value === 'gradient' ? 2 : 1)) {
        if (!normalizeHex(input.value)) { input.reportValidity(); return null; }
      }
      return normalizeSpacePalette(value);
    }
  };
}
