export async function sidebarTabAction(action, values = {}) {
  const windowId = (await chrome.windows.getCurrent()).id;
  const response = await chrome.runtime.sendMessage({ type: 'arc-sidebar-tab-action', action, windowId, ...values });
  if (!response?.ok) {
    const error = new Error(response?.error || 'Sidebar tab action failed');
    window.dispatchEvent(new CustomEvent('arc-sidebar-save-error', { detail: { message: error.message } }));
    throw error;
  }
  return response.values;
}
