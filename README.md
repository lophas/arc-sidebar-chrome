# Arc Sidebar for Chrome

**Bring the useful parts of Arc’s sidebar workflow into Google Chrome.**

Arc Sidebar for Chrome is a Manifest V3 extension for people who like Arc’s **Spaces, Favorites, folders, pinned tabs and sidebar-first workflow**, but want Chrome’s compatibility and extension ecosystem underneath.

It is not a full visual clone of Arc. The goal is to preserve the browsing model while keeping normal Chrome tabs as the execution layer.

> This project is independent and is not affiliated with, endorsed by, or sponsored by The Browser Company or Arc.

## 1.1.0

**v1.1.0 adds an Arc-style command bar to the stable sidebar.**

- **Command+K** on macOS / **Ctrl+K** on Windows and Linux;
- recent open tabs shown first when the search is empty;
- search open tabs across windows, Favorites, pinned links, folders and Spaces;
- website favicons beside results;
- open a URL or start a Google search;
- Up/Down navigation, Enter to open and Escape to dismiss;
- selecting a pinned link or its live tab switches the sidebar to its Space and expands parent folders;
- New Tab, blank and internal browser pages excluded from the open-tab results;
- one sidebar search control, with the Add Favorite button retained.

All features from v1.0.0 remain available:

- two sidebar modes: Autohide overlay and Native Chrome Side Panel;
- Arc-style Spaces, folders, persistent pinned links and global Favorites;
- native Chrome tab grouping by Space and Favorites, with group tab order following the sidebar hierarchy;
- drag-and-drop reordering for Spaces, folders, Favorites and pinned items;
- moving pinned items between folders, out to Space root, and across Spaces;
- folder moves across Spaces through the folder editor;
- red live-state indicators and bulk-close actions for folders and Spaces;
- responsive Favorite drawer with five size presets: 80%, 90%, 100%, 110%, 120%;
- custom uploaded icons for Favorites, pinned links and Spaces;
- searchable Space emoji picker with a curated compatibility-safe set, country flags, country-name search and common ASCII emoticon aliases;
- per-Space and Open-tabs scroll-position memory;
- Chrome Sync, backup/restore and full reset;
- right-click webpage pinning;
- stable extension ID across unpacked installs;
- overlay editing lock: the autohide sidebar stays open while an editor dialog is active.

## Core model

Arc Sidebar deliberately separates **persistent sidebar items** from **live Chrome tabs**:

- a saved sidebar item remains until you remove it;
- a live Chrome tab exists only when you open that item;
- reopening the item focuses the existing live tab instead of creating a duplicate;
- closing the live tab does not delete the saved sidebar item.

This makes it practical to keep hundreds of organized links without keeping hundreds of renderer processes alive.

## Features

### Search popup (Command bar)

- open with **Command+K** on macOS or **Ctrl+K** on Windows/Linux, even when the sidebar is closed;
- open the same search from the sidebar’s **Search or enter URL** button, beside **Add Favorite**;
- see recently accessed open tabs first when the search is empty;
- search open tabs across windows, Favorites, pinned links, folders and Spaces;
- identify websites by their favicons;
- enter a URL to open it, or choose a Google search;
- use Up/Down to select, Enter to open and Escape to dismiss;
- match all entered words with accent-insensitive search;
- reuse an existing bound tab when opening a pinned link;
- automatically switch to the correct Space and expand parent folders when selecting a pinned item or its bound open tab;
- switch Space and expand folders from folder/Space results;
- exclude New Tab, blank and internal browser pages from open-tab results.

The shortcut opens a compact popup window; the sidebar button opens an inline dialog. Folder/Space navigation from the popup opens the native sidebar.

Configure the shortcut at `chrome://extensions/shortcuts` if it conflicts with another extension. Chrome’s Command+T/Ctrl+T continues to open a new tab.

### Spaces

- Arc-like Spaces with title and icon;
- emoji picker with search by name/keyword, country name and common emoticon aliases such as `:)`, `:D`, `<3`;
- custom SVG/PNG/WebP/JPEG icon upload by click or drag-and-drop;
- drag-and-drop Space reordering;
- red live-state dot when the Space contains open bound tabs;
- right-click to edit the Space or close every open tab in all Chrome groups associated with it, including non-pinned workflow tabs across windows;
- the close action shows the full live tab count and keeps saved pinned links/folders;
- workflow-only Chrome groups remain closable even after their last pinned tab has closed.

### Favorites

Favorites are global across Spaces.

- click to open/focus the bound Chrome tab;
- red live-state dot when open;
- click the red dot to close the live tab while preserving the Favorite;
- drag-and-drop Favorite reordering;
- use the site favicon or upload a custom SVG/PNG/WebP/JPEG icon;
- responsive drawer that adapts to available sidebar width;
- five local tile-size presets: 80%, 90%, 100%, 110%, 120%.

### Pinned links

Pinned items are persistent sidebar entries rather than permanently open browser tabs.

- click to open/focus;
- red live-state dot when open;
- click the dot to close/reset the live tab while keeping the saved URL;
- right-click to edit title, URL and custom icon;
- use the site favicon or upload a custom SVG/PNG/WebP/JPEG icon;
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

Each regular Space shows its non-pinned workflow tabs below the pinned items. The list follows that Space’s Chrome groups, including workflow-only groups and tabs in other windows (marked **Other window**). Already bound pinned links and Favorites are excluded to avoid duplicate rows. Live rows show favicons, activate their tab on click, close with ×, and support right-click pinning.

A dedicated **Open tabs** Space continues to show all live tabs in the current Chrome window and can pin an already-open page without opening a duplicate.

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
- supports a narrow compact layout;
- stays open while an edit dialog is active, and resumes autohide after Save/Cancel.

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
- a custom SVG/PNG/WebP/JPEG icon uploaded by click or drag-and-drop.

Spaces can use:

- a searchable emoji from the built-in compatibility-safe set;
- a country flag searchable by country name/code;
- a pasted emoji;
- a custom SVG/PNG/WebP/JPEG icon uploaded by click or drag-and-drop.

Uploaded image icons are resized/compressed before storage. Custom icons are part of the persistent sidebar model, so they are included in Backup/Restore and Chrome Sync.

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
- custom Favorite/pinned/Space icons;
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

1. Download the latest release ZIP.
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
- favicon API;
- Commands API.

The background entry point is `src/background/service-worker.js`. Native group creation/synchronization lives in the service worker, while group ordering and native-panel reload handling are loaded through background feature modules.

The persistent sidebar model lives in `chrome.storage.local`. If Chrome Sync is enabled, a chunked mirror is stored in `chrome.storage.sync`. Live item-to-tab bindings use session storage with persistent recovery metadata for Chrome restart recovery.

Sidebar state changes and saved-tab actions are coordinated by one background controller. Independent edits from different sidebar views are merged; conflicting edits show an error instead of overwriting newer data. Opening a pinned item reuses its live tab and reveals its Space.

The autohide iframe loads only on first hover. Closed views pause background UI work, and idle hidden-tab overlays release their iframe. Open editors remain available across tab switches. Each sidebar reads a fresh shared state snapshot when activated.

See [state and lifecycle architecture](docs/architecture.md) for the implementation plan, transaction limits and regression checklist. Run `npm test` and `npm run check` for automated checks.

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
- Arc’s complete browser-chrome UI.

## Release packaging

Tagged releases are built by GitHub Actions and contain only:

- `manifest.json`
- `src/`

For the stable 1.1 release:

```bash
git tag v1.1.0
git push origin v1.1.0
```

The workflow validates the tag against `manifest.json`, builds `arc-sidebar-chrome-v1.1.0.zip`, and publishes it as a normal GitHub Release.

## Current version

**v1.1.0**

Manifest numeric version: **1.1.0**

## License

See [LICENSE](LICENSE).
