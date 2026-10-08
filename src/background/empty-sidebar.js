import { serializeState } from './state-controller.js';
export function ensureEmptySidebar() {
  return serializeState(async () => {
    const stored = await chrome.storage.local.get('arcSidebarModel');
    if (stored.arcSidebarModel) return stored.arcSidebarModel;
    const model = {version:2, favorites:[], spaces:[], stats:{spaces:0,folders:0,tabs:0,favorites:0}};
    await chrome.storage.local.set({arcSidebarModel:model});
    return model;
  });
}
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.arcSidebarModel && !changes.arcSidebarModel.newValue) ensureEmptySidebar().catch(console.error);
});
ensureEmptySidebar().catch(console.error);
