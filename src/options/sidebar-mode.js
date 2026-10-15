import { createStorageClient } from '../shared/storage-client.js';
import { sidebarPreferences, AUTOHIDE_TIMEOUTS } from '../shared/sidebar-preferences.js';
import { EDGE_TRIGGER_KEY, DEFAULT_EDGE_TRIGGER, edgeTrigger } from '../shared/edge-trigger.js';
const sidebarStorage = createStorageClient();
const MODE_KEY = 'arcSidebarMode';
const TIMEOUT_KEY = 'arcSidebarAutohideTimeout';
const keys = [TIMEOUT_KEY, MODE_KEY, EDGE_TRIGGER_KEY];
const timeout = document.querySelector('#autohideTimeout');
const sliders = { top: document.querySelector('#triggerTop'), bottom: document.querySelector('#triggerBottom'), width: document.querySelector('#triggerWidth') };
const outputs = { top: document.querySelector('#triggerTopValue'), bottom: document.querySelector('#triggerBottomValue'), width: document.querySelector('#triggerWidthValue') };
const status = document.querySelector('#modeStatus');
const warning = document.querySelector('#autohideWarning');
const reset = document.querySelector('#resetAutohide');
const preview = document.querySelector('#triggerPreview');
let revision = 0, loading = 0, pending = 0, dirty = false;
let saveTail = Promise.resolve();
function paint(changed) {
  let top = Math.max(0, Math.min(80, Number(sliders.top.value)));
  let bottom = Math.max(20, Math.min(100, Number(sliders.bottom.value)));
  if (changed === sliders.top) top = Math.min(top, bottom - 20);
  else bottom = Math.max(bottom, top + 20);
  const trigger = edgeTrigger({ height: bottom - top, offset: top, width: Number(sliders.width.value) });
  const values = { top: trigger.offset, bottom: trigger.offset + trigger.height, width: trigger.width };
  for (const [name, slider] of Object.entries(sliders)) {
    slider.value = String(values[name]);
    outputs[name].value = `${values[name]}${name === 'width' ? ' px' : '%'}`;
    slider.setAttribute('aria-valuetext', outputs[name].value);
  }
  sliders.top.setAttribute('aria-valuemax', String(values.bottom - 20));
  sliders.bottom.setAttribute('aria-valuemin', String(values.top + 20));
  document.querySelector('#triggerHeightValue').value = `${trigger.height}% height`;
  const fill = document.querySelector('#triggerRangeFill');
  fill.style.left = `${values.top}%`;
  fill.style.width = `${trigger.height}%`;
  document.querySelector('#timeoutValue').value = `${timeout.value} ms`;
  timeout.setAttribute('aria-valuetext', `${timeout.value} milliseconds`);
  preview.style.top = `${trigger.offset}%`;
  preview.style.height = `${trigger.height}%`;
  preview.style.width = `${trigger.width}px`;
  return trigger;
}
async function loadSelection() {
  const request = ++loading, before = revision;
  const stored = await sidebarStorage.local.get(keys);
  if (request !== loading) return;
  warning.hidden = sidebarPreferences(stored).mode === 'native';
  if (before !== revision || pending || dirty) return;
  timeout.value = String(sidebarPreferences(stored).timeout);
  const trigger = edgeTrigger(stored[EDGE_TRIGGER_KEY]);
  sliders.top.value = String(trigger.offset);
  sliders.bottom.value = String(trigger.offset + trigger.height);
  sliders.width.value = String(trigger.width);
  paint();
}
function save(values) {
  pending++; reset.disabled = true;
  const savedRevision = revision;
  saveTail = saveTail.then(async () => {
    const stored = await sidebarStorage.local.get(keys);
    if (Object.hasOwn(values, TIMEOUT_KEY)) values[MODE_KEY] = sidebarPreferences(stored).mode;
    await sidebarStorage.local.set(values);
    if (savedRevision === revision) status.textContent = 'Autohide settings saved.';
  }).catch(error => { status.textContent = `Could not save autohide settings: ${error.message}`; })
    .finally(async () => {
      pending--; reset.disabled = pending > 0;
      if (savedRevision === revision && !pending) { dirty = false; await loadSelection(); }
    });
}
for (const slider of [timeout, ...Object.values(sliders)]) {
  slider.addEventListener('input', () => { revision++; dirty = true; paint(slider); });
  slider.addEventListener('change', () => {
    revision++; dirty = false;
    if (slider === timeout) {
      const value = Number(timeout.value);
      if (AUTOHIDE_TIMEOUTS.includes(value)) save({ [TIMEOUT_KEY]: value });
    } else save({ [EDGE_TRIGGER_KEY]: paint(slider) });
  });
}
reset.addEventListener('click', () => {
  revision++; dirty = false;
  timeout.value = '800';
  sliders.top.value = String(DEFAULT_EDGE_TRIGGER.offset);
  sliders.bottom.value = String(DEFAULT_EDGE_TRIGGER.height);
  sliders.width.value = String(DEFAULT_EDGE_TRIGGER.width);
  paint();
  save({ [TIMEOUT_KEY]: 800, [EDGE_TRIGGER_KEY]: { ...DEFAULT_EDGE_TRIGGER } });
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && keys.some(key => changes[key])) loadSelection().catch(console.error);
});
const previous = await sidebarStorage.local.get(keys);
if (previous[TIMEOUT_KEY] === 0) await sidebarStorage.local.set({ [TIMEOUT_KEY]: 800, [MODE_KEY]: 'native' });
await loadSelection();
async function previewSide() {
  try { const { side } = await chrome.sidePanel.getLayout(); preview.style.left = side === 'left' ? '0' : 'auto'; preview.style.right = side === 'left' ? 'auto' : '0'; } catch {}
}
previewSide();
window.addEventListener('focus', previewSide);

document.querySelector('#sidePanelSettings').addEventListener('click', async event => {
  event.preventDefault();
  try { await chrome.tabs.create({ url: 'chrome://settings/appearance' }); }
  catch (error) { status.textContent = `Could not open Chrome Settings: ${error.message}`; }
});
