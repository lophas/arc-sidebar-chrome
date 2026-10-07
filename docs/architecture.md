# Sidebar state and lifecycle

## Design

Chrome owns a separate renderer for each webpage. Edge hover must keep a small page-local trigger because Chrome does not expose browser-edge pointer events to extensions. A native Side Panel is browser-owned, but cannot provide this hover overlay behavior. The overlay uses a content-script host and an extension-origin iframe; it does not run the sidebar app in the webpage's JavaScript context.

The refactor shares the **state and operations**, rather than attempting to share one DOM instance between tabs:

1. `background/state-controller.js` serializes state mutations and cross-area snapshots in one service-worker queue. Durable data remains in Chrome storage when the worker sleeps.
2. `shared/storage-client.js` tracks editor baselines and sends changes to that controller. It never replaces or patches Chrome's global APIs.
3. `shared/state-merge.js` merges independent changes by stable item ID and field. Reordering preserves newer item content; incompatible edits fail visibly instead of silently overwriting a newer model. UI intentions update only the selected Space, folder or scroll entry.
4. `background/tab-actions.js` owns opening, focusing, closing and replacing live bindings. Repeated opens are serialized and reuse the same tab. Selecting a pinned item or its live tab reveals its Space and ancestor folders.
5. `background/persistent-bindings.js` performs restart recovery once, without requiring an open sidebar, before saved-tab activation.

Import/pinning batches validate all local/session changes before writes, and sidebar snapshots wait until the complete queued operation finishes. Chrome storage has no transaction spanning areas: quota/API failures during sequential writes can still leave a partial batch. The queue guarantees ordering, not an underlying database transaction.

## Overlay lifecycle

The page-local trigger and DOM-repair observers remain lightweight. The extension iframe gets its URL only on first open. `sidepanel/lifecycle.js` accepts visibility messages only from its parent and also observes document visibility. Closed or hidden views stop tab refreshes, rendering, icon decoration and scroll writes.

An idle overlay iframe is unloaded when its webpage tab becomes hidden. An open editor or resize interaction retains the iframe, so an unfinished edit survives a tab switch. Each active sidebar reloads its model, UI state and bindings from a queued snapshot before rendering. The native Side Panel uses the same state clients and tab actions.

Scroll writes capture the original Space before a switch and update that Space alone. Programmatic restoration does not trigger saves. DOM repair reattaches the existing overlay host instead of creating duplicate sidebar listeners. Mutation callbacks coalesce repairs into a timer, yielding to webpage loading. Host attribute observation is disconnected during repairs; styles are restored as a cached, browser-normalized declaration instead of repeatedly comparing CSS shorthand values.

## Validation

Run with Node.js 20 or newer, without installing dependencies:

```sh
npm test
npm run check
npm install --no-save --package-lock=false --ignore-scripts playwright-core@1.56.1
python3 tests/browser-overlay.py --require-browser
```

Tests use Chrome API and DOM fakes. They cover concurrent editors, order/content merges, conflict rejection, import/pin batches, binding removal/replacement/recovery, duplicate opens, Space reveal, overlay lazy loading and DOM repair, editor retention, lifecycle messaging and scroll memory. Source checks validate syntax and relative imports.

Manual Chrome regression checklist:

- Edge hover on ordinary pages and long-running Gmail/Facebook pages; hide/show tabs and remove/rebuild the overlay host.
- Native/overlay mode switching, resizing and native-panel reload handling.
- Cmd+K/Ctrl+K, recent tabs, favicon results, URL/search, keyboard navigation, New Tab filtering and pinned Space reveal.
- Two webpage sidebars: switch Spaces, collapse folders and edit separate items; confirm consistent state. Edit the same field and verify a visible conflict instead of data loss.
- Favorites/add button/tile sizes, uploaded item and Space icons, emoji picker.
- All drag paths: reorder Spaces/Favorites/folders/items; folder/root/cross-Space item moves; folder-editor Space moves.
- Per-Space and Open-tabs scroll memory; tab open/focus/reset and folder/Space bulk close.
- Right-click page/link pinning, Open-tabs pinning, native tab groups and group order.
- Arc import, backup/restore, Chrome Sync and reset; restart Chrome with bound tabs.

These browser checks require an actual Chrome installation; mock tests do not establish real-site compatibility.

The browser regression runs in real headless Chrome on CI. It checks page load and timer progress in both modes, repeated observer activity, host removal and style/hidden repair. It uses mocked extension APIs, so it does not replace full extension integration or Gmail/Facebook testing.

## Closing a Space workflow

The Space context menu uses background `space-close-info` and `close-space` actions. Both resolve the latest saved model, bindings, Chrome tabs and native group mappings. Closing unions all live tabs bound to that Space with every tab in its associated Chrome groups, across windows; duplicate tab IDs are removed. Tabs that joined a group after the menu opened are included when clicked. Saved links, folders and icons remain unchanged.

`native-group-map.js` retains valid group associations while Chrome still has a group, even when its last pinned tab has closed. Stale associations, deleted Spaces and groups with a mismatched window/title are discarded. Only bindings for successfully closed tabs are removed; partial failures show an error and retain retryable bindings. Folder-only close and individual tab close keep their existing behavior.

Additional regression tests cover non-pinned workflow tabs, multiple windows, workflow-only groups, changed membership, stale/deleted associations and partial close failures.

## Space workflow rows

`shared/space-tabs.js` resolves group membership for both the Space live-tab list and bulk close. The list excludes saved bindings across all Spaces/Favorites and orders rows by browser position, with the sidebar's current window first. It refreshes on tab/group events and native group-map changes; hidden sidebar views keep their lifecycle pause. Workflow rows have stable Chrome tab IDs so right-click pinning selects the correct tab despite search, ordering or cross-window display.
