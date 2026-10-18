import { FOLDER_COLORS, normalizeFolderColor, applyFolderColor } from '../shared/folder-color.js';

export function createFolderColorEditor(dialog) {
  const section = document.createElement('section');
  section.className = 'folder-color-editor';
  section.innerHTML = `
    <label>Color<select id="folderColorMode"><option value="space">Space color</option><option value="custom">Custom color</option></select></label>
    <div class="folder-color-presets" role="group" aria-label="Choose folder color"></div>
    <label class="folder-custom-color" hidden>Custom color<span class="space-color-input"><input id="folderColorPicker" type="color" aria-label="Choose custom folder color"><input id="folderColorHex" type="text" maxlength="7" spellcheck="false" aria-label="Folder color hex"></span></label>
    <div class="folder folder-color-preview" aria-label="Folder color preview">
      <div class="folder-header"><span class="folder-caret">▼</span><span class="row-title"></span></div>
      <div class="folder-children"><div class="row">Pinned link</div><div class="row active">Active link</div></div>
    </div>`;
  dialog.querySelector('.dialog-actions').before(section);
  const mode = section.querySelector('#folderColorMode');
  const grid = section.querySelector('.folder-color-presets');
  const picker = section.querySelector('#folderColorPicker');
  const hex = section.querySelector('#folderColorHex');
  const preview = section.querySelector('.folder-color-preview');
  const name = dialog.querySelector('#folderName');
  let color = FOLDER_COLORS[0].color;

  function paint() {
    const custom = mode.value === 'custom';
    section.querySelector('.folder-custom-color').hidden = !custom;
    for (const button of grid.querySelectorAll('button')) {
      button.setAttribute('aria-pressed', String(custom && color === button.dataset.color));
    }
    applyFolderColor(preview, custom ? color : null);
    preview.querySelector('.row-title').textContent = name.value.trim() || 'Folder preview';
  }

  function setColor(value) {
    color = value;
    picker.value = hex.value = color;
    hex.setCustomValidity('');
  }

  for (const preset of FOLDER_COLORS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'folder-color-choice';
    button.dataset.color = preset.color;
    button.title = preset.name;
    button.setAttribute('aria-label', preset.name);
    button.style.backgroundColor = preset.color;
    button.addEventListener('click', () => {
      mode.value = 'custom'; setColor(preset.color); paint();
    });
    grid.append(button);
  }
  mode.addEventListener('change', () => { setColor(color); paint(); });
  picker.addEventListener('input', () => { setColor(picker.value); paint(); });
  hex.addEventListener('input', () => {
    const value = normalizeFolderColor(hex.value);
    hex.setCustomValidity(value ? '' : 'Enter a color such as #c98b52.');
    if (value) { color = value; picker.value = value; paint(); }
  });
  name.addEventListener('input', paint);
  return {
    setValue(value) {
      const normalized = normalizeFolderColor(value);
      mode.value = normalized ? 'custom' : 'space';
      setColor(normalized || FOLDER_COLORS[0].color);
      paint();
    },
    getValue() {
      if (mode.value !== 'custom') return null;
      const value = normalizeFolderColor(hex.value);
      if (!value) { hex.reportValidity(); return undefined; }
      return value;
    }
  };
}
