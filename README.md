# Arc Sidebar for Chrome

**Bring the parts of Arc’s sidebar workflow you actually use into Google Chrome.**

Arc Sidebar for Chrome is a Manifest V3 extension for people who like Arc’s **Spaces, Favorites, folders, pinned tabs and sidebar-first workflow**, but want or need to use Chrome.

It is not a visual clone of Arc and it is not intended to replace every Arc feature. The goal is narrower: preserve the browsing model that makes Arc useful, while keeping Chrome’s compatibility, extension ecosystem and normal tab engine underneath.

> This project is independent and is not affiliated with, endorsed by, or sponsored by The Browser Company or Arc.

## 1.0.0 RC1

The current release candidate is **v1.0.0-rc1**. It includes the full day-to-day workflow intended for the 1.0 release: Spaces, Favorites, folders, persistent pinned items, live-tab bindings, Chrome tab groups, overlay/native sidebar modes, drag-and-drop organization, Chrome Sync, backup/restore and reset tools.

RC1 is intended for real use, but it is still a release candidate. Back up your sidebar before major experiments or upgrades.

## Why an Arc user might want this

If your Arc sidebar has become the way you organize the web, moving back to a conventional browser can be painful. Bookmarks are too static, normal tabs are too temporary, and keeping every pinned page open wastes memory.

Arc Sidebar keeps those concepts separate:

- a **saved sidebar item** is persistent;
- a **live Chrome tab** exists only when you actually open that item;
- reopening the saved item focuses its existing live tab instead of creating duplicates;
- closing the live tab does not delete the saved sidebar item.

That means you can keep hundreds of organized links without keeping hundreds of renderer processes alive.

## Arc concepts reproduced

### Spaces

Create and switch between Arc-like Spaces. Each Space keeps its own pinned hierarchy and can use an emoji/icon.

Spaces can be reordered by drag-and-drop. If a Space contains live tabs, it shows a red status dot. Right-click the Space to edit it or close every live tab belonging to that Space without deleting saved links.

### Favorites

Favorites are global. A Favorite opens once, then focuses the same live tab on later clicks.

Live Favorites show a red dot. Clicking that dot closes the live Chrome tab while preserving the Favorite.

### Pinned tabs

Pinned items are persistent sidebar entries, not permanently open browser tabs.

When a pinned item is live, the sidebar shows a red status dot. **The dot itself is the close/reset control**: click it to close the live Chrome tab while keeping the saved URL intact.

Pinned items can be dragged:

- within the Space root;
- within a folder;
- between folders;
- from a folder back to the Space root;
- onto another Space to move the pinned item there.

### Folders

Pinned items can be organized in folders. Folders can be collapsed, renamed, reordered within their current Space, moved to another Space through the folder editor, and removed without deleting their contents.

A folder containing live tabs shows a red status dot. Right-click the folder to edit it or close all live tabs contained in that folder.

Folder drag-and-drop only changes folder order inside the current Space. Moving a whole folder between Spaces remains an explicit editor action.

### Open tabs

A dedicated **Open tabs** Space provides a live view of the current Chrome window and lets you pin an already-open tab into a Space without opening a duplicate.

## Sidebar modes

The extension supports two sidebar modes, selectable under **Extension options → Sidebar mode**.

### Autohide overlay

- Arc-style sidebar overlay on normal webpages;
- opens when the pointer reaches the right edge;
- closes automatically after leaving it;
- does not resize the webpage viewport;
- width is resizable and remembered locally.

### Native Chrome side panel

- uses Chrome’s native Side Panel;
- opened by clicking the extension toolbar button;
- no edge trigger is active;
- no overlay UI is injected into the page.

The selected mode is local to each computer and is not synced.

When the mode changes, already-open normal webpages are marked for a one-time refresh. Each affected tab reloads when you next switch to it, so the new mode is applied cleanly without reloading every tab at once.

## Fixed sidebar layout

The search/Favorites drawer remains fixed at the top of the sidebar, and the Space switcher remains fixed at the bottom. Only the central pinned/open-tab content area scrolls.

## Arc import

The extension can import an Arc `StorableSidebar.json` and convert:

- Spaces
- Favorites
- pinned tabs
- folders

The import replaces the extension’s current sidebar model. Arc Archive/history data is not imported.

## What this adds beyond Arc-style organization

Arc Sidebar deliberately uses Chrome as the execution layer, which enables several useful additions:

- **Native Chrome Tab Groups:** live pinned tabs are automatically grouped by Space; Favorites get their own native group.
- **Group order follows sidebar order:** open tabs inside native Chrome groups are arranged to match the sidebar hierarchy.
- **Two sidebar modes:** autohide overlay or native Chrome Side Panel.
- **Resizable overlay sidebar:** drag the overlay's left edge to resize it; the width is remembered locally.
- **Right-click page pinning:** pin the current page or a specific link directly into a chosen Space.
- **Space and folder reordering:** drag Spaces and reorder folders inside a Space.
- **Folder-to-Space moves:** move a complete folder through its editor while preserving its contents.
- **Persistent live-tab binding:** if a pinned page navigates away from its original URL, it still belongs to that sidebar item.
- **Chrome restart recovery:** restored Chrome tabs reconnect to saved sidebar items when they can be matched safely.
- **Optional Chrome Sync:** sync Spaces, Favorites, folders and pinned links between Chrome installations signed into the same Chrome Sync account.
- **Backup & restore:** export and restore the complete persistent sidebar model.
- **Reset all extension data:** clear local/session/sync extension state for clean testing or recovery.
- **Bulk live-tab cleanup:** close all live tabs belonging to a folder or Space without deleting saved links.
- **Low-memory model:** saved sidebar entries do not require open Chrome tabs.
- **System light/dark mode:** the sidebar follows the operating system theme.

## What it does not provide

This is not a full Arc reimplementation. The following are intentionally out of scope at present:

- Boosts
- Split View
- Notes / Easel
- Arc AI features
- full Arc Archive/history migration
- Arc account sync
- Arc’s complete command-bar / browser-chrome experience

Chrome also restricts extensions on some privileged pages such as `chrome://` pages, the Chrome Web Store and certain browser error/interstitial pages. The overlay cannot run there; native Side Panel mode remains available.

## Installation

Arc Sidebar for Chrome is distributed as a ZIP file from GitHub Releases. It is not currently published in the Chrome Web Store, so Chrome requires **Developer mode** and **Load unpacked**.

1. Open the repository’s **Releases** page.
2. Download the latest `arc-sidebar-chrome-vX.Y.Z.zip` or prerelease ZIP.
3. Unzip it to a permanent folder on your computer.
4. Open `chrome://extensions` in Chrome.
5. Enable **Developer mode**.
6. Click **Load unpacked**.
7. Select the folder that directly contains `manifest.json`.
8. Optionally pin **Arc Sidebar for Chrome** from Chrome’s Extensions menu.

Do not delete or move the unpacked folder after installation, because Chrome loads the extension directly from that location.

### Updating

When a new version is released:

1. Download the new ZIP from **Releases**.
2. Replace the previous extension files, or extract to a new permanent folder.
3. Open `chrome://extensions`.
4. Click **Reload** on the Arc Sidebar for Chrome extension card.

If you extracted the update to a different folder, remove the old unpacked extension and use **Load unpacked** again.

## Importing your Arc sidebar

On macOS, Arc normally stores the sidebar file at:

`~/Library/Application Support/Arc/StorableSidebar.json`

In Finder press **⌘⇧G**, paste that path, and copy the file somewhere safe before importing it.

On Windows, the common location is:

`%LOCALAPPDATA%\Packages\TheBrowserCompany.Arc_*\LocalCache\Local\Arc\StorableSidebar.json`

Then:

1. Open **Extensions → Arc Sidebar for Chrome → Details → Extension options**.
2. Choose **Import StorableSidebar.json**.
3. The imported Spaces, Favorites, pinned tabs and folders become the extension’s persistent sidebar model.

Importing replaces the current Arc Sidebar model. It does not modify Arc itself.

## Right-click context menu

Arc Sidebar adds a **Pin to Arc Sidebar** submenu to Chrome's normal webpage context menu.

- Right-click the page background to pin the current page.
- Right-click a link to pin that link directly.
- Choose the destination Space.
- The item is added to that Space and appears in the sidebar immediately.

When the current page itself is pinned, Arc Sidebar keeps the existing live Chrome tab associated with the new sidebar item where possible, avoiding an unnecessary duplicate.

## Chrome Sync

Cross-device sync is optional and disabled until explicitly enabled.

### Enabling sync

1. Make sure Chrome is signed in and Chrome Sync is enabled.
2. Open **Extension options**.
3. Enable **Chrome Sync**.
4. Repeat on each computer where you want the same Arc Sidebar model.

The following data is synchronized:

- Spaces and their order
- Space names and emoji/icons
- Favorites
- folders and folder order
- folder placement between Spaces
- pinned links and hierarchy

The following remains local to each computer:

- currently open Chrome tabs
- live saved-item ↔ tab bindings
- restored-tab recovery state
- collapsed folder state
- overlay width
- sidebar mode
- other machine-specific UI/session state

### Stable extension ID

Starting with **v0.6.2**, the extension includes a fixed manifest key so unpacked installations use the same extension ID on every computer. This is required because `chrome.storage.sync` is namespaced by extension ID.

The expected extension ID for current builds is:

`clfmokcejlbebjlmohfjkffeoocffjdn`

If you are upgrading from v0.6.1 or earlier, create a backup first because the stable extension ID may differ from the ID Chrome previously generated.

### Sync behavior and conflict handling

Synchronization is whole-model rather than per-item merging.

When local and synced copies differ:

- the newer modification timestamp wins;
- a newer local model is pushed to Chrome Sync;
- a newer synced model is pulled into local storage.

If necessary, the Extension Options page can trigger an explicit reconciliation with **Sync now**.

## Backup, restore and reset

### Create a backup

1. Open **Extension options**.
2. In **Backup & restore**, click **Download backup**.
3. Save the generated JSON file somewhere safe.

The backup contains the persistent sidebar model:

- Spaces
- Space names and emoji/icons
- Favorites
- folders and hierarchy
- pinned links

It intentionally does not contain currently open tabs, live item↔tab bindings, collapsed-folder state, overlay width or sidebar mode.

### Restore a backup

1. Open **Extension options**.
2. Choose **Restore backup**.
3. Select an Arc Sidebar backup JSON file.

Restore replaces the current persistent sidebar model with the backup contents.

### Reset all extension data

For clean testing or recovery, **Extension options → Arc import → Reset all extension data** clears the extension’s local, session and sync state after confirmation.

This includes sidebar data, bindings, UI state, sidebar mode, overlay width and the extension’s Chrome Sync snapshot. It does **not** close your normal Chrome tabs.

A useful backup test sequence is:

1. Download backup.
2. Reset all extension data.
3. Confirm the sidebar is empty.
4. Restore backup.

## Everyday workflow

- Click a Favorite or pinned item to open it.
- Click it again to focus the existing live tab.
- Navigate inside that tab freely — the binding stays attached to the sidebar item.
- Use red dots to see which saved items, folders and Spaces currently have live tabs.
- Click a pinned/Favorite red dot to close that one live tab.
- Right-click a folder or Space to close all live tabs belonging to it.
- Right-click a webpage to pin the current page or a link into a chosen Space.
- Right-click Favorites, pinned links, folders and Spaces to edit them.
- Drag pinned links within/between folders, back to the Space root, or onto another Space.
- Drag folders to reorder them inside the current Space.
- Drag Space icons to reorder Spaces.
- Use the **Open tabs** Space to pin an already-open Chrome tab without creating a duplicate.
- Enable Chrome Sync for the same persistent structure on multiple Chrome installations.
- Use Backup & restore before major upgrades, migrations or experiments.

## Architecture and privacy

Arc Sidebar is a local-first Manifest V3 extension built on Chrome’s Side Panel, Tabs, Tab Groups, Storage, Context Menus and favicon APIs.

The persistent sidebar model is kept locally in Chrome storage. If Chrome Sync is enabled, that model is additionally mirrored through Chrome’s `storage.sync` service in chunks. Live item-to-tab bindings use session storage, with local recovery data used to reconnect restored tabs after Chrome restarts.

The extension does not require an Arc account or its own cloud backend.

## Release packaging

Release ZIPs are generated from tagged source and contain only the files Chrome needs to run the extension: `manifest.json` and `src/`.

For prereleases, the tag must match `manifest.json` → `version_name`. For stable releases without a `version_name`, it must match `version`.

For RC1:

```bash
git tag v1.0.0-rc1
git push origin v1.0.0-rc1
```

The GitHub Actions workflow validates the tag, packages the extension and publishes prerelease tags as GitHub prereleases automatically.

## Current version

**v1.0.0-rc1**

Manifest numeric version: **1.0.0**

## License

See [LICENSE](LICENSE).
