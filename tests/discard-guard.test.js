import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { probeDiscardSafety } from '../src/background/discard-probe.js';
function guardFixture(readyState = 'loading') {
  const events = new Map(), listeners = new Map();
  const track = { readyState: 'live', addEventListener: (name, fn) => listeners.set(name, fn) };
  const navigator = { mediaDevices: { getUserMedia: async () => ({ getTracks: () => [track] }), getDisplayMedia: async () => ({ getTracks: () => [track] }) } };
  const document = { readyState, addEventListener: (name, fn) => events.set(name, fn) };
  const context = vm.createContext({ document, navigator, WeakRef, queueMicrotask });
  vm.runInContext(fs.readFileSync('src/memory/discard-guard.js', 'utf8'), context);
  return { context, document, navigator, track, events, stop: () => { track.readyState = 'ended'; listeners.get('ended')?.(); }, state: () => context.__arcSidebarDiscardGuard.state() };
}
test('capture guard follows camera/microphone and screen tracks without polling or changing returned streams', async () => {
  for (const name of ['getUserMedia', 'getDisplayMedia']) {
    const f = guardFixture(); assert.equal(f.state().capturing, false);
    const pending = f.navigator.mediaDevices[name]({ audio: true }); assert.equal(f.state().capturing, true);
    assert.equal((await pending).getTracks()[0], f.track); assert.equal(f.state().capturing, true);
    f.stop(); assert.equal(f.state().capturing, false);
  }
  assert.equal(guardFixture('complete').state().verified, false, 'A late guard cannot certify preexisting captures');
});
test('capture rejection is preserved and reinjection does not wrap APIs twice', async () => {
  const f = guardFixture(); const wrapped = f.navigator.mediaDevices.getUserMedia;
  vm.runInContext(fs.readFileSync('src/memory/discard-guard.js', 'utf8'), f.context);
  assert.equal(f.navigator.mediaDevices.getUserMedia, wrapped);
  const error = new Error('Permission denied');
  const context = vm.createContext({ document: f.document, navigator: { mediaDevices: { getUserMedia: async () => { throw error; } } }, WeakRef, queueMicrotask });
  vm.runInContext(fs.readFileSync('src/memory/discard-guard.js', 'utf8'), context);
  await assert.rejects(context.navigator.mediaDevices.getUserMedia(), /Permission denied/);
  assert.equal(context.__arcSidebarDiscardGuard.state().capturing, false);
});
test('trusted edits remain protected even if a framework rewrites input defaults; form reset clears protection', async () => {
  const f = guardFixture(), form = {};
  const field = { isConnected: true, form, matches: () => true, value: '', defaultValue: '' };
  f.events.get('beforeinput')({ type: 'beforeinput', isTrusted: true, composedPath: () => [field] });
  field.value = field.defaultValue = 'draft';
  f.events.get('input')({ type: 'input', isTrusted: true, composedPath: () => [field] });
  assert.equal(f.state().editing, true);
  f.events.get('reset')({ target: form, defaultPrevented: false }); await Promise.resolve();
  assert.equal(f.state().editing, false);
});
async function probe({ verified = true, capturing = false, editing = false, media = [], fields = [], pip } = {}) {
  const document = { querySelectorAll: selector => selector === 'video,audio' ? media : selector.startsWith('input,') ? fields : [] };
  const context = vm.createContext({ document, navigator: {}, window: {}, location: { origin: 'https://test' }, __arcSidebarDiscardGuard: { state: () => ({ verified, capturing, editing }) }, __arcSidebarAutoPip: pip ? { getState: () => ({ player: pip }) } : undefined });
  return vm.runInContext('(' + probeDiscardSafety.toString() + ')()', context);
}
test('safety probe rejects unverified documents, capture, PiP, playing media and dirty forms', async () => {
  for (const options of [{ verified: false }, { capturing: true }, { editing: true }, { pip: 'document' }, { media: [{ paused: false }] },
    { fields: [{ tagName: 'TEXTAREA', value: 'draft', defaultValue: '' }] }, { fields: [{ type: 'checkbox', checked: true, defaultChecked: false }] },
    { fields: [{ isContentEditable: true, textContent: 'draft' }] }]) assert.equal((await probe(options)).safe, false);
  assert.equal((await probe()).safe, true);
  assert.equal((await probe({ fields: [{ tagName: 'SELECT', multiple: false, options: [{ selected: true, defaultSelected: false }, { selected: false, defaultSelected: false }] }] })).safe, true);
});
