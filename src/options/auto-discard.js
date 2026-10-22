import { createStorageClient } from '../shared/storage-client.js';
import { DISCARD_MINUTES_KEY, DISCARD_EXCEPTIONS_KEY, DEFAULT_DISCARD_EXCEPTIONS, discardMinutes, discardExceptions, discardPreferences } from '../shared/auto-discard.js';
const storage = createStorageClient();
const slider = document.querySelector('#autoDiscardMinutes'), output = document.querySelector('#autoDiscardValue');
const exceptions = document.querySelector('#autoDiscardExceptions'), save = document.querySelector('#saveDiscardExceptions');
const status = document.querySelector('#autoDiscardStatus');
let revision = 0, sliderDirty = false, exceptionsDirty = false, saving = 0, generation = 0, tail = Promise.resolve();
const dirty = () => sliderDirty || exceptionsDirty;
function paint(value = slider.value) {
  const minutes = discardMinutes(value);
  slider.value = String(minutes); output.value = minutes ? `${minutes} min` : 'Disabled';
  slider.setAttribute('aria-valuetext', output.value);
  return minutes;
}
async function load() {
  const token = ++generation, before = revision;
  const stored = await storage.local.get([DISCARD_MINUTES_KEY, DISCARD_EXCEPTIONS_KEY]);
  if (token !== generation || before !== revision || saving || dirty()) return;
  const prefs = discardPreferences(stored);
  paint(prefs.minutes); exceptions.value = prefs.exceptions.join('\n');
}
function enqueue(values, savedRevision) {
  saving++;
  tail = tail.then(async () => {
    await storage.local.set(values);
    if (savedRevision === revision) status.textContent = 'Automatic discard settings saved on this computer.';
  }).catch(error => {
    if (savedRevision === revision) status.textContent = `Could not save: ${error.message}`;
  }).finally(() => { saving--; if (!saving && !dirty()) load().catch(console.warn); });
}
slider.addEventListener('input', () => { revision++; sliderDirty = true; paint(); });
slider.addEventListener('change', () => { const minutes = paint(); sliderDirty = false; enqueue({ [DISCARD_MINUTES_KEY]: minutes }, ++revision); });
exceptions.addEventListener('input', () => { revision++; exceptionsDirty = true; exceptions.setCustomValidity(''); });
document.querySelector('#restoreDiscardExceptions').addEventListener('click', () => {
  revision++; exceptionsDirty = true; exceptions.setCustomValidity('');
  exceptions.value = DEFAULT_DISCARD_EXCEPTIONS.join('\n');
  status.textContent = 'Default website exceptions loaded. Choose Save website exceptions to apply.';
});
save.addEventListener('click', () => {
  try {
    const hosts = discardExceptions(exceptions.value.split(/\r?\n/).map(value => value.trim()).filter(Boolean));
    exceptions.value = hosts.join('\n'); exceptionsDirty = false;
    enqueue({ [DISCARD_EXCEPTIONS_KEY]: hosts }, ++revision);
  } catch (error) { exceptions.setCustomValidity(error.message); exceptions.reportValidity(); }
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && (changes[DISCARD_MINUTES_KEY] || changes[DISCARD_EXCEPTIONS_KEY])) load().catch(console.warn);
});
load().catch(error => { status.textContent = `Could not load: ${error.message}`; });
