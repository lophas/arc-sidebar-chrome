export const DISCARD_MINUTES_KEY = 'arcSidebarAutoDiscardMinutes';
export const DISCARD_EXCEPTIONS_KEY = 'arcSidebarAutoDiscardExceptions';
export const DEFAULT_DISCARD_MINUTES = 30;
export const isDiscardMinutes = value => Number.isInteger(value) && value >= 0 && value <= 120 && value % 5 === 0;
export const discardMinutes = value => ['number', 'string'].includes(typeof value) && isDiscardMinutes(Number(value)) && value !== ''
  ? Number(value) : DEFAULT_DISCARD_MINUTES;

export function exceptionHost(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const text = value.trim().replace(/^\*\./, '');
  try {
    const url = new URL(text.includes('://') ? text : 'https://' + text);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || !url.hostname || /[\s*]/.test(url.hostname)) return null;
    return url.hostname.toLowerCase().replace(/\.$/, '');
  } catch { return null; }
}
export function discardExceptions(values = []) {
  if (!Array.isArray(values) || values.length > 200) throw new Error('Use at most 200 website exceptions.');
  const hosts = values.filter(value => value !== '');
  if (hosts.some(value => !exceptionHost(value))) throw new Error('Enter one website domain or HTTP(S) address per line.');
  return [...new Set(hosts.map(exceptionHost))].sort();
}
export function discardPreferences(stored) {
  let exceptions = [];
  try { exceptions = discardExceptions(stored[DISCARD_EXCEPTIONS_KEY]); } catch {}
  return { minutes: discardMinutes(stored[DISCARD_MINUTES_KEY]), exceptions };
}
export function excludedWebsite(url, exceptions) {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/\.$/, '');
    return exceptions.some(exception => host === exception || host.endsWith('.' + exception));
  } catch { return true; }
}
export function discardCandidate(tab, exceptions = []) {
  return tab?.id != null && !tab.active && !tab.pinned && !tab.discarded &&
    tab.autoDiscardable !== false && !tab.audible && tab.status !== 'loading' &&
    /^https?:\/\//i.test(tab.pendingUrl || tab.url || '') &&
    !excludedWebsite(tab.pendingUrl || tab.url, exceptions);
}
