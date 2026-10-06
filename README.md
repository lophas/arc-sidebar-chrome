# Arc Sidebar for Chrome

**Bring the useful parts of Arc’s sidebar workflow into Google Chrome.**

Arc Sidebar for Chrome is a Manifest V3 extension for people who like Arc’s **Spaces, Favorites, folders, pinned tabs and sidebar-first workflow**, but want Chrome’s compatibility and extension ecosystem underneath.

It is not a full visual clone of Arc. The goal is to preserve the browsing model while keeping normal Chrome tabs as the execution layer.

> This project is independent and is not affiliated with, endorsed by, or sponsored by The Browser Company or Arc.

## 1.0.0 RC2

The current release candidate is **v1.0.0-rc2**.

RC2 keeps the RC1 feature set and adds the final UI/behavior refinements made during real-world testing:

- Favorite and pinned-link custom icon selection;
- responsive Favorite drawer;
- configurable Favorite tile size: 80%, 90%, 100%, 110% or 120%;
- 100% remains the original/default Favorite size;
- pinned rows no longer show the URL/domain beside the title;
- overlay sidebar can be resized much narrower than before;
- sidebar scroll position is remembered separately for each Space, including Open tabs;
- opening or closing Chrome’s native Side Panel while using Autohide overlay reloads the active webpage so the overlay state is applied cleanly;
- native Chrome tab grouping and sidebar-order group sorting are preserved after an RC2 startup regression was caught and fixed during final testing.

RC2 is still a release candidate. Back up the sidebar before major experiments or upgrades.

## Core model

Arc Sidebar deliberately separates **persistent sidebar items** from **live Chrome tabs**:

- a saved sidebar item remains until you remove it;
- a live Chrome tab exists only when you open that item;
- reopening the item focuses the existing live tab instead of creating a duplicate;
- closing the live tab does not delete the saved sidebar item.

This makes it practical to keep hundreds of organized links without keeping hundreds of renderer processes alive.

## Features

### Spaces

- Arc-like Spaces with title and emoji/icon;
- drag-and-drop Space reordering;
- red live-state dot when the Space contains open bound tabs;
- right-click to edit the Space or close all live tabs belonging to it.

### Favorites

Favorites are global across Spaces.

- click to open/focus the bound Chrome tab;
- red live-state dot when open;
- click the red dot to close the live tab while preserving the Favorite;
- drag-and-drop Favorite reordering;
- optional custom emoji/symbol icon;
- responsive drawer that adapts to available sidebar width;
- five local tile-size presets: 80%, 90%, 100%, 110%, 120%.

### Pinned links

Pinned items are persistent sidebar entries rather than permanently open browser tabs.

- click to open/focus;
- red live-state dot when open;
- click the dot to close/reset the live tab while keeping the saved URL;
- right-click to edit title, URL and optional custom icon;
- drag within the Space root, within folders, between folders, from a folder back to root, or onto another Space.

Pinned rows show the saved title without repeating the URL/domain beside it.

### Folders

- collapse/expand;
- rename;
- reorder by drag inside the current Space;
- move a complete folder to another Space through the folder editor;
- remove a folder without deleting its contents;
- red live-state dot when the folder contains open bound tabs;
- right-click to close all live tabs in that folder.

Folder drag-and-drop only changes folder order inside the current Space. Cross-Space folder moves remain an explicit editor action.

### Open tabs

A dedicated **Open tabs** Space shows the live tabs in the current Chrome window and can pin an already-open page without opening a duplicate.

### Native Chrome Tab Groups

Live pinned tabs are grouped by Space in normal Chrome tab groups. Favorites use a separate Favorites group.

The tab order inside each native Chrome group follows the sidebar hierarchy.

## Sidebar modes

Choose the mode under **Extension options → Sidebar mode**.

### Autohide overlay

- Arc-style overlay on normal webpages;
- appears when the pointer reaches the right edge;
- closes automatically after leaving it;
- floats above the page instead of narrowing the viewport;
- resizable and remembered locally;
- supports a narrow compact layout.

If Chrome’s native Side Panel is manually opened or closed while Autohide overlay mode is active, the current HTTP/HTTPS page reloads once so the overlay trigger/state is rebuilt cleanly.

### Native Chrome Side Panel

- uses Chrome’s built-in Side Panel;
- open it by clicking the extension toolbar button;
- no edge trigger is used;
- the overlay UI is not created;
- Chrome controls the native panel’s minimum width.

The selected sidebar mode is local to each computer and is not synced.

When the mode itself changes, existing normal webpages are marked for a one-time deferred refresh. Each affected tab reloads when you next activate it instead of reloading every open tab immediately.

## Layout

The search/Favorites area remains fixed at the top. The Space switcher remains fixed at the bottom. The middle pinned/open-tab area scrolls independently.

The current vertical scroll position is remembered separately for each Space and for the Open tabs view, so reopening the sidebar returns to the same place instead of jumping to the top.

The Favorite drawer is responsive rather than fixed at four columns, and can collapse to fewer columns as sidebar width decreases.

## Custom icons

Favorites and pinned links can use:

- the website favicon;
- one of the built-in emoji/symbol presets;
- any emoji or short symbol pasted into the icon field.

Custom icons are part of the persistent sidebar model, so they are included in Backup/Restore and Chrome Sync.

## Arc import

The extension can import Arc’s `StorableSidebar.json` and convert:

- Spaces;
- Favorites;
- pinned tabs;
- folders.

Import replaces the current Arc Sidebar model. Arc Archive/history data is not imported.

### Typical Arc file locations

macOS:

```text
~/Library/Application Support/Arc/StorableSidebar.json
```

Windows commonly uses a path under:

```text
%LOCALAPPDATA%\Packages\TheBrowserCompany.Arc_*\LocalCache\Local\Arc\StorableSidebar.json
```

## Right-click page pinning

Chrome’s webpage context menu contains **Pin to Arc Sidebar**.

- right-click the page background to pin the current page;
- right-click a link to pin that URL;
- choose the destination Space;
- when pinning the current page, the existing live tab is bound where possible instead of creating a duplicate.

## Chrome Sync

Chrome Sync is optional and disabled until explicitly enabled.

Synced persistent data includes:

- Spaces and their order;
- Space names/icons;
- Favorites;
- custom Favorite/pinned icons;
- folders and folder order;
- pinned links and hierarchy.

Machine-specific/session data remains local, including:

- currently open Chrome tabs;
- live item ↔ tab bindings;
- collapsed-folder state;
- per-Space/Open-tabs scroll positions;
- overlay width;
- sidebar mode;
- Favorite tile size;
- other session/UI state.

Synchronization is whole-model with timestamp-based conflict resolution: the newer model wins.

### Stable extension ID

Current unpacked builds use a fixed manifest key so the extension ID stays the same across machines:

```text
clfmokcejlbebjlmohfjkffeoocffjdn
```

This is required for consistent `chrome.storage.sync` namespacing.

## Backup, restore and reset

Extension Options provides:

- **Download backup** — exports the persistent sidebar model as JSON;
- **Restore backup** — replaces the current persistent model from a backup;
- **Reset all extension data** — clears local, session and sync extension state for clean testing/recovery.

Reset does not close ordinary Chrome tabs.

A useful restore test is:

1. Download backup.
2. Reset all extension data.
3. Confirm the sidebar is empty.
4. Restore the backup.

## Installation

Arc Sidebar for Chrome is distributed as an unpacked extension ZIP from GitHub Releases.

1. Download the latest release/prerelease ZIP.
2. Extract it to a permanent folder.
3. Open `chrome://extensions`.
4. Enable **Developer mode**.
5. Click **Load unpacked**.
6. Select the folder that directly contains `manifest.json`.
7. Optionally pin the extension toolbar button.

Do not delete or move that folder while Chrome is using the unpacked extension.

### Updating

For an existing unpacked installation:

1. replace the files with the new release contents;
2. open `chrome://extensions`;
3. click **Reload** on Arc Sidebar for Chrome.

## Architecture

The extension is local-first and built on Chrome’s Manifest V3 APIs:

- Side Panel;
- Tabs;
- Tab Groups;
- Storage;
- Context Menus;
- favicon API.

The background entry point is `src/background/service-worker.js`. Native group creation/synchronization lives in the service worker, while group ordering and native-panel reload handling are loaded as background feature modules through the existing context-menu import chain. This is the proven startup path used by RC1 and retained for RC2 after final regression testing.

The persistent sidebar model lives in `chrome.storage.local`. If Chrome Sync is enabled, a chunked mirror is stored in `chrome.storage.sync`. Live item-to-tab bindings use session storage with persistent recovery metadata for Chrome restart recovery.

The extension does not require an Arc account or its own cloud backend.

## Known platform limitations

Chrome restricts extensions on privileged pages such as `chrome://` pages, the Chrome Web Store and some browser interstitial/error pages. The injected overlay cannot operate there; the native Side Panel remains available.

Chrome also controls the minimum width of the native Side Panel. The extension cannot force that browser-owned panel narrower than Chrome allows.

## Out of scope

At present this project does not attempt to reproduce:

- Boosts;
- Split View;
- Notes / Easel;
- Arc AI features;
- full Arc Archive/history migration;
- Arc account sync;
- Arc’s complete command-bar/browser-chrome UI.

## Release packaging

Tagged releases are built by GitHub Actions and contain only:

- `manifest.json`
- `src/`

For prereleases, the tag must match `manifest.json` → `version_name`.

For RC2:

```bash
git tag v1.0.0-rc2
git push origin v1.0.0-rc2
```

The workflow validates the tag, builds `arc-sidebar-chrome-v1.0.0-rc2.zip`, and publishes it as a GitHub prerelease.

## Current version

**v1.0.0-rc2**

Manifest numeric version: **1.0.0**

## License

See [LICENSE](LICENSE).
