import { serializeState } from './state-controller.js';
import { withSpacePalettes } from '../shared/space-palette.js';
export function ensureEmptySidebar() {
  return serializeState(async () => {
    const stored = await chrome.storage.local.get(['arcSidebarModel', 'arcSidebarState']);
    if (stored.arcSidebarModel?.spaces?.length) {
      const model = withSpacePalettes(stored.arcSidebarModel);
      if (model !== stored.arcSidebarModel) await chrome.storage.local.set({arcSidebarModel:model});
      return model;
    }
    const model = withSpacePalettes({...(stored.arcSidebarModel || {version:2, favorites:[]}), spaces:[{id:'__my_space__', title:'My Space', emoji:'🚀', children:[]}], stats:{spaces:1,folders:0,tabs:0,favorites:stored.arcSidebarModel?.favorites?.length || 0}});
    await chrome.storage.local.set({arcSidebarModel:model, arcSidebarState:{...stored.arcSidebarState, currentSpaceId:'__my_space__', collapsedFolders:{}}});
    return model;
  });
}
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.arcSidebarModel && (!changes.arcSidebarModel.newValue?.spaces?.length || withSpacePalettes(changes.arcSidebarModel.newValue) !== changes.arcSidebarModel.newValue)) ensureEmptySidebar().catch(console.error);
});
ensureEmptySidebar().catch(console.error);
