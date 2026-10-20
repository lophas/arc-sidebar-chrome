import { DISCARD_MINUTES_KEY, DISCARD_EXCEPTIONS_KEY, discardPreferences, discardCandidate } from '../shared/auto-discard.js';
import { probeDiscardSafety } from './discard-probe.js';
export const DISCARD_ALARM = 'arc-sidebar-auto-discard';
export const DISCARD_IDLE_KEY = 'arcSidebarDiscardIdle';
const MINUTE = 60000, RETRY = 5 * MINUTE;
const snapshot = ({ id, windowId, url, pendingUrl, active, pinned, discarded, autoDiscardable, audible, status }) =>
  ({ id, windowId, url, pendingUrl, active, pinned, discarded, autoDiscardable, audible, status });

export function createDiscardController(api, now = Date.now) {
  let prefs = { minutes: 0, exceptions: [] }, idle = {}, tabs = new Map(), active = new Map();
  let tail = Promise.resolve(), alarmAt = 0;
  const serial = operation => {
    const result = tail.then(operation);
    tail = result.catch(error => console.warn('Arc Side of the Chrome: automatic discard:', error));
    return result;
  };
  const save = () => api.storage.session.set({ [DISCARD_IDLE_KEY]: idle });
  async function readTabs() {
    const current = await api.tabs.query({});
    tabs = new Map(current.map(tab => [tab.id, snapshot(tab)])); active = new Map();
    for (const tab of current) {
      if (tab.active) active.set(tab.windowId, tab.id);
      if (tab.active || tab.pinned || tab.discarded || !/^https?:\/\//i.test(tab.pendingUrl || tab.url || '')) delete idle[tab.id];
      else if (!Number.isFinite(idle[tab.id]?.since) || idle[tab.id].since < 0 || idle[tab.id].since > now()) idle[tab.id] = { since: now() };
    }
    for (const id of Object.keys(idle)) if (!tabs.has(Number(id))) delete idle[id];
  }
  async function schedule() {
    let next = Infinity;
    if (prefs.minutes) for (const tab of tabs.values()) {
      const state = idle[tab.id];
      if (state && !state.blocked && discardCandidate(tab, prefs.exceptions)) {
        next = Math.min(next, Math.max(state.since + prefs.minutes * MINUTE, state.retry || 0));
      }
    }
    if (!Number.isFinite(next)) { await api.alarms.clear(DISCARD_ALARM); alarmAt = 0; return; }
    next = Math.max(next, now() + 30000);
    if (Math.abs(alarmAt - next) < 1000) return;
    await api.alarms.create(DISCARD_ALARM, { when: next }); alarmAt = next;
  }
  async function configure() {
    const previous = prefs;
    prefs = discardPreferences(await api.storage.local.get([DISCARD_MINUTES_KEY, DISCARD_EXCEPTIONS_KEY]));
    if (!prefs.minutes || !previous.minutes) idle = {};
    await readTabs(); await save(); await schedule();
  }
  async function inspect(tab) {
    try {
      const origin = api.runtime.getURL('').replace(/\/$/, '');
      const top = await api.scripting.executeScript({ target: { tabId: tab.id }, world: 'MAIN', func: probeDiscardSafety, args: [origin] });
      if (!top?.[0]?.result?.safe) return top?.[0]?.result || { safe: false, reason: 'unverified' };
      // Destroy extension-owned child contexts BEFORE Chrome discards the host
      // renderer. A preserved editor vetoes this; focus reinjects a disposed
      // controller if a later page check prevents the actual discard.
      const prepared = await api.scripting.executeScript({ target: { tabId: tab.id }, func: () => {
        if (document.visibilityState !== 'hidden') return false;
        const controller = globalThis.__arcSidebarOverlayController;
        return !controller || typeof controller.prepareDiscard === 'function' && controller.prepareDiscard();
      } });
      if (prepared?.[0]?.result !== true) return { safe: false, reason: 'editing' };
      const results = await api.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, world: 'MAIN', func: probeDiscardSafety, args: [origin] });
      if (!results?.length) return { safe: false, reason: 'unverified' };
      return results.map(frame => frame.result || { safe: false, reason: 'unverified' }).find(result => !result.safe) || { safe: true };
    } catch { return { safe: false, reason: 'unverified' }; }
  }
  return {
    start: () => serial(async () => {
      const stored = (await api.storage.session.get(DISCARD_IDLE_KEY))[DISCARD_IDLE_KEY];
      idle = stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {};
      prefs = discardPreferences(await api.storage.local.get([DISCARD_MINUTES_KEY, DISCARD_EXCEPTIONS_KEY]));
      alarmAt = (await api.alarms.get(DISCARD_ALARM))?.scheduledTime || 0;
      await readTabs(); await save(); await schedule();
    }),
    configure: () => serial(configure),
    activated: (info, at = now()) => serial(async () => {
      if (!prefs.minutes) return;
      const previous = active.get(info.windowId);
      if (previous != null && previous !== info.tabId) {
        const tab = tabs.get(previous);
        if (tab) { tab.active = false; idle[previous] = { since: at }; }
      }
      const tab = await api.tabs.get(info.tabId).catch(() => null);
      if (tab) { tabs.set(tab.id, { ...snapshot(tab), active: true }); active.set(info.windowId, tab.id); }
      delete idle[info.tabId]; await save(); await schedule();
    }),
    updated: (id, info, tab) => serial(async () => {
      if (!prefs.minutes) return;
      tabs.set(id, snapshot(tab));
      if (tab.active || tab.pinned || tab.discarded) delete idle[id];
      else if (!idle[id] || info.url || info.status === 'loading' || info.audible === false || info.autoDiscardable === true) idle[id] = { since: now() };
      await save(); await schedule();
    }),
    removed: id => serial(async () => {
      tabs.delete(id); delete idle[id];
      for (const [windowId, activeId] of active) if (activeId === id) active.delete(windowId);
      if (prefs.minutes) { await save(); await schedule(); }
    }),
    refresh: () => serial(async () => { if (prefs.minutes) { await readTabs(); await save(); await schedule(); } }),
    resetSession: () => serial(async () => { idle = {}; await readTabs(); await save(); await schedule(); }),
    alarm: () => serial(async () => {
      alarmAt = 0;
      prefs = discardPreferences(await api.storage.local.get([DISCARD_MINUTES_KEY, DISCARD_EXCEPTIONS_KEY]));
      if (!prefs.minutes) { await schedule(); return; }
      await readTabs();
      const due = [...tabs.values()].filter(tab => {
        const state = idle[tab.id];
        return state && !state.blocked && discardCandidate(tab, prefs.exceptions) &&
          Math.max(state.since + prefs.minutes * MINUTE, state.retry || 0) <= now();
      }).sort((a, b) => idle[a.id].since - idle[b.id].since).slice(0, 10);
      for (const tab of due) {
        const result = await inspect(tab);
        if (!result.safe) {
          idle[tab.id] = { ...idle[tab.id], retry: now() + RETRY, blocked: result.reason === 'unverified' };
          continue;
        }
        try {
          // Settings and actual tab state may change while the safety probe runs.
          const latest = discardPreferences(await api.storage.local.get([DISCARD_MINUTES_KEY, DISCARD_EXCEPTIONS_KEY]));
          const current = await api.tabs.get(tab.id);
          tabs.set(tab.id, snapshot(current));
          if (!latest.minutes || !discardCandidate(current, latest.exceptions) || current.url !== tab.url || current.pendingUrl !== tab.pendingUrl ||
              idle[tab.id].since + latest.minutes * MINUTE > now()) continue;
          const discarded = await api.tabs.discard(tab.id);
          if (discarded?.discarded) { tabs.set(tab.id, snapshot(discarded)); delete idle[tab.id]; }
          else idle[tab.id].retry = now() + RETRY;
        } catch { if (idle[tab.id]) idle[tab.id].retry = now() + RETRY; }
      }
      await save(); await schedule();
    })
  };
}
