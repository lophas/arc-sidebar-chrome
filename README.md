# Arc Sidebar for Chrome

**Bring the parts of Arc’s sidebar workflow you actually use into Google Chrome.**

Arc Sidebar for Chrome is a Manifest V3 extension for people who like Arc’s **Spaces, Favorites, folders, pinned tabs and sidebar-first workflow**, but want or need to use Chrome.

It is not a visual clone of Arc and it is not intended to replace every Arc feature. The goal is narrower: preserve the browsing model that makes Arc useful, while keeping Chrome’s compatibility, extension ecosystem and normal tab engine underneath.

> This project is independent and is not affiliated with, endorsed by, or sponsored by The Browser Company or Arc.

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

### Favorites

Favorites are global, just as they should be for pages you want available everywhere. A Favorite opens once, then focuses the same live tab on later clicks.

### Pinned tabs

Pinned items are persistent sidebar entries, not permanently open browser tabs. When a pinned item is live, the sidebar shows a red status dot. Hovering the item exposes a reset control that closes its live tab while keeping the saved URL intact.

### Folders

Pinned items can be organized in folders. Folders can be collapsed, renamed, moved between Spaces and removed without deleting their contents. A folder with live tabs shows a red status dot and provides a `−` action to close all live tabs contained in that folder at once.

### Open tabs

A dedicated **Open tabs** Space provides a live view of the current Chrome window and lets you pin an already-open tab into a Space without opening a duplicate.

### Arc import

The extension can import an Arc `StorableSidebar.json` and convert:

- Spaces
- Favorites
- pinned tabs
- folders

The import replaces the extension’s current sidebar model. Arc Archive/history data is not imported.

## What this adds beyond Arc-style organization

Arc Sidebar deliberately uses Chrome as the execution layer, which enables a few useful additions:

- **Native Chrome Tab Groups:** live pinned tabs are automatically grouped by Space; Favorites get their own native group.
- **Edge-activated overlay sidebar:** move to the right edge of a normal webpage to reveal the sidebar without permanently giving up page width.
- **Resizable overlay sidebar:** drag the sidebar's left edge to resize it; the width is remembered locally per computer.
- **Right-click page pinning:** use the webpage context menu to pin the current page or a specific link directly into a chosen Space.
- **Folder-to-Space moves:** edit a folder and choose a different Space to move the complete folder with all of its contents.
- **Native Chrome Side Panel fallback:** the toolbar button can open the persistent Chrome Side Panel when you want the sidebar to stay visible.
- **Persistent live-tab binding:** if a pinned page navigates away from its original URL, it still belongs to that sidebar item.
- **Chrome restart recovery:** restored Chrome tabs are reconnected to their saved sidebar items after restart when they can be matched safely.
- **Optional Chrome Sync:** sync Spaces, Favorites, folders and pinned links between Chrome installations signed into the same Chrome Sync account.
- **Backup & restore:** export the complete persistent sidebar model to a JSON backup and restore it later on the same or another computer.
- **One-click folder cleanup:** close every live tab belonging to a folder without deleting any saved links.
- **Low-memory model:** saved sidebar entries do not require open Chrome tabs.
- **System light/dark mode:** the sidebar follows the operating system theme in both Side Panel and overlay modes.

## What it does not provide

This is not a full Arc reimplementation. The following are intentionally out of scope at present:

- Boosts
- Split View
- Notes / Easel
- Arc AI features
- full Arc Archive/history migration
- Arc account sync
- Arc’s complete command-bar / browser-chrome experience

Chrome also restricts extensions on some privileged pages such as `chrome://` pages, the Chrome Web Store and certain browser error/interstitial pages. The edge-activated overlay cannot run there; use the normal Chrome Side Panel instead.

## Installation

Arc Sidebar for Chrome is distributed as a ZIP file from GitHub Releases. It is not currently published in the Chrome Web Store, so Chrome requires **Developer mode** and **Load unpacked**.

1. Open the repository’s **Releases** page.
2. Download the latest `arc-sidebar-chrome-vX.Y.Z.zip` file from the release assets.
3. Unzip it to a permanent folder on your computer.
4. Open `chrome://extensions` in Chrome.
5. Enable **Developer mode** in the top-right corner.
6. Click **Load unpacked**.
7. Select the unzipped folder — the folder that directly contains `manifest.json`.
8. Optionally pin **Arc Sidebar for Chrome** from Chrome’s Extensions menu for quick access to the persistent Side Panel.

Do not delete or move the unzipped folder after installation, because Chrome loads the extension directly from that location.

### Updating

When a new version is released:

1. Download the new ZIP from **Releases**.
2. Unzip it, replacing the previous extension files or extracting it to a new permanent folder.
3. Open `chrome://extensions`.
4. Click **Reload** on the Arc Sidebar for Chrome extension card.

If you extracted the update to a different folder, remove the old unpacked extension and use **Load unpacked** again with the new folder.

## Importing your Arc sidebar

On macOS, Arc normally stores the sidebar file at `~/Library/Application Support/Arc/StorableSidebar.json`; in Finder press **⌘⇧G**, paste that path, and copy the file somewhere safe before importing it. On Windows, the common location is `%LOCALAPPDATA%\Packages\TheBrowserCompany.Arc_*\LocalCache\Local\Arc\StorableSidebar.json`.

1. Obtain your Arc `StorableSidebar.json` from your Arc profile/data files.
2. In Chrome, open **Extensions → Arc Sidebar for Chrome → Details → Extension options**.
3. Choose **Import StorableSidebar.json**.
4. The imported Spaces, Favorites, pinned tabs and folders become the extension’s persistent sidebar model.

Importing is destructive with respect to the extension’s existing sidebar model: it replaces the current Arc Sidebar data. It does not modify Arc itself.

## Right-click context menu

Arc Sidebar adds a **Pin to Arc Sidebar** submenu to Chrome's normal webpage context menu.

Use it when you want to save something without first opening the sidebar:

- **Right-click the page background** to pin the current page.
- **Right-click a link** to pin that link directly, even without opening it first.
- Choose the destination **Space** from the submenu.
- The item is added to the root of the selected Space and appears in the sidebar immediately.

When the current page itself is pinned, Arc Sidebar keeps the existing live Chrome tab associated with the new sidebar item where possible, so pinning the page does not immediately create a duplicate tab.

The Space submenu is rebuilt from the current sidebar model, so newly created, renamed or removed Spaces are reflected automatically.

This context-menu feature is available on normal web pages where Chrome allows extension context menus. Browser-internal and other protected pages remain subject to Chrome's normal extension restrictions.

## Chrome Sync

Cross-device sync is optional and disabled until you explicitly turn it on.

### Enabling sync

1. Make sure Chrome is signed in and Chrome Sync is enabled.
2. Open **Extensions → Arc Sidebar for Chrome → Details → Extension options**.
3. Enable **Chrome Sync**.
4. Repeat this on each computer where you want to use the same Arc Sidebar model.

When enabled, Arc Sidebar keeps its normal runtime model in local Chrome storage and mirrors the persistent sidebar data to `chrome.storage.sync`.

The following data is synchronized:

- Spaces and their order
- Space names and emoji/icons
- Favorites
- folders
- folder placement between Spaces
- pinned links and their hierarchy

The following deliberately remains local to each computer:

- currently open Chrome tabs
- live saved-item ↔ tab bindings
- restored-tab recovery state
- collapsed folder state
- overlay sidebar width
- other machine-specific UI/session state

This means two computers can share the same persistent sidebar organization without trying to reproduce each other's currently open browser processes.

### Stable extension ID

Starting with **v0.6.2**, the extension includes a fixed manifest key so unpacked installations use the same extension ID on every computer. This is required because `chrome.storage.sync` is namespaced by extension ID.

For Sync to work between two unpacked installations, both must therefore be running a version that uses the fixed key. With the current builds, the extension ID should stay stable across machines as long as the packaged manifest is not modified.

If you are upgrading from v0.6.1 or earlier, create a backup first. The stable extension ID introduced in v0.6.2 may differ from the ID Chrome previously generated for your unpacked installation, so local extension storage from the old ID may not be visible automatically. Use **Extension options → Backup & restore** to export before upgrading and restore afterward if needed.

### Sync behavior and conflict handling

The sidebar model is mirrored to Chrome Sync in quota-safe chunks. Synchronization is whole-model rather than per-item merging.

When local and synced copies differ:

- the copy with the newer modification timestamp wins;
- a newer local model is pushed to Chrome Sync;
- a newer synced model is pulled into local storage.

This keeps the implementation predictable and avoids partial hierarchy merges that could corrupt folder/Space structure.

Because synchronization is eventually consistent, changes made on one computer may take a short time to appear on another. If necessary, the Extension Options page can trigger an explicit sync/reconciliation.

Disabling Chrome Sync in Arc Sidebar stops future synchronization but does not delete the local sidebar data. Existing remote sync data is also left intact so synchronization can resume later.

If Chrome itself is not signed in, browser Sync is disabled, or Chrome prevents `storage.sync` from operating normally, Arc Sidebar continues to work locally.

## Backup and restore

Backup & restore is available from **Extensions → Arc Sidebar for Chrome → Details → Extension options**.

### Create a backup

1. Open **Extension options**.
2. In **Backup & restore**, click **Download backup**.
3. Save the generated JSON file somewhere safe.

The backup contains the complete persistent sidebar model:

- Spaces
- Space names and emoji/icons
- Favorites
- folders and their hierarchy
- pinned links

It intentionally does **not** contain machine-specific runtime state such as currently open tabs, live item↔tab bindings, collapsed-folder state or overlay width.

### Restore a backup

1. Open **Extension options**.
2. In **Backup & restore**, choose **Restore backup**.
3. Select a backup JSON file created by Arc Sidebar.
4. Confirm the restore.

Restore replaces the current persistent sidebar model with the contents of the backup. It can be used on the same computer or on another installation of Arc Sidebar.

If Chrome Sync is enabled, the restored model becomes the new local model and is then reconciled with Sync. For migrations or troubleshooting, keeping a manual backup is still recommended even if Sync is enabled.

## Everyday workflow

- Click a Favorite or pinned item once to open it.
- Click it again later to focus the same live Chrome tab.
- Navigate inside that tab freely — the binding remains attached to the sidebar item.
- Use the red dot to see which saved items are currently live.
- Use `−` on a live pinned item to close/reset only that item.
- Use `−` on a folder to close all live tabs inside that folder.
- Right-click a webpage to pin the current page or a link directly into a chosen Space.
- Right-click Favorites, pinned links, folders and Spaces to edit them.
- In a folder's editor, choose another Space to move the whole folder there.
- Drag pinned links within a Space or onto another Space.
- Use the **Open tabs** Space to pin an already-open Chrome tab without creating a duplicate.
- Enable **Chrome Sync** if you want the same persistent sidebar structure on multiple Chrome installations.
- Use **Backup & restore** before major upgrades, migrations or experiments.

## Architecture and privacy

Arc Sidebar is a local-first Manifest V3 extension built on Chrome’s Side Panel, Tabs, Tab Groups, Storage, Context Menus and favicon APIs.

The persistent sidebar model is always kept locally in Chrome storage. If Chrome Sync is enabled in the extension settings, that model is additionally mirrored through Chrome’s `storage.sync` service in chunks. Live item-to-tab bindings use session storage, with a small local recovery snapshot used to reconnect restored tabs after Chrome restarts.

The extension does not require an Arc account or its own cloud backend.

## Release packaging

Release ZIPs are generated from the tagged source and contain only the files Chrome needs to run the extension (`manifest.json` and `src/`).

Maintainers can create a release by pushing a version tag matching the manifest version, for example:

```bash
git tag v0.6.4
git push origin v0.6.4
```

The GitHub Actions release workflow packages the extension and publishes the ZIP as a GitHub Release asset.

## Current version

**v0.6.4**

## License

See [LICENSE](LICENSE).
