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

Pinned items can be organized in folders. Folders can be collapsed, renamed, moved and removed without deleting their contents. A folder with live tabs shows a red status dot and provides a `−` action to close all live tabs contained in that folder at once.

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
- **Native Chrome Side Panel fallback:** the toolbar button can open the persistent Chrome Side Panel when you want the sidebar to stay visible.
- **Persistent live-tab binding:** if a pinned page navigates away from its original URL, it still belongs to that sidebar item.
- **Chrome restart recovery:** restored Chrome tabs are reconnected to their saved sidebar items after restart when they can be matched safely.
- **Optional Chrome Sync:** sync Spaces, Favorites, folders and pinned links between Chrome installations signed into the same Chrome Sync account.
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

1. Obtain your Arc `StorableSidebar.json` from your Arc profile/data files.
2. In Chrome, open **Extensions → Arc Sidebar for Chrome → Details → Extension options**.
3. Choose **Import StorableSidebar.json**.
4. The imported Spaces, Favorites, pinned tabs and folders become the extension’s persistent sidebar model.

Importing is destructive with respect to the extension’s existing sidebar model: it replaces the current Arc Sidebar data. It does not modify Arc itself.

## Chrome Sync

Cross-device sync is optional and is disabled until you turn it on.

Open **Extensions → Arc Sidebar for Chrome → Details → Extension options**, then enable **Chrome Sync**.

When enabled, Chrome Sync carries the persistent sidebar model between Chrome installations using the same Chrome Sync account:

- Spaces
- Favorites
- folders
- pinned links

The following deliberately stay local to each computer:

- currently open Chrome tabs
- live saved-item ↔ tab bindings
- restored-tab recovery state
- collapsed folder state
- overlay sidebar width

The sidebar model is kept in local storage as the runtime copy and mirrored to `chrome.storage.sync` in quota-safe chunks. If two copies differ, the newer local or synced model wins based on modification time. Disabling sync stops future synchronization but does not delete your local sidebar data.

If Chrome itself is not signed in or Chrome Sync is disabled, `chrome.storage.sync` cannot provide normal cross-device synchronization.

## Everyday workflow

- Click a Favorite or pinned item once to open it.
- Click it again later to focus the same live Chrome tab.
- Navigate inside that tab freely — the binding remains attached to the sidebar item.
- Use the red dot to see which saved items are currently live.
- Use `−` on a live pinned item to close/reset only that item.
- Use `−` on a folder to close all live tabs inside that folder.
- Right-click Favorites, pinned links, folders and Spaces to edit them.
- Drag pinned links within a Space or onto another Space.
- Use the **Open tabs** Space to pin an already-open Chrome tab without creating a duplicate.

## Architecture and privacy

Arc Sidebar is a local-first Manifest V3 extension built on Chrome’s Side Panel, Tabs, Tab Groups, Storage and favicon APIs.

The persistent sidebar model is always kept locally in Chrome storage. If Chrome Sync is enabled in the extension settings, that model is additionally mirrored through Chrome’s `storage.sync` service in chunks. Live item-to-tab bindings use session storage, with a small local recovery snapshot used to reconnect restored tabs after Chrome restarts.

The extension does not require an Arc account or its own cloud backend.

## Release packaging

Release ZIPs are generated from the tagged source and contain only the files Chrome needs to run the extension (`manifest.json` and `src/`).

Maintainers can create a release by pushing a version tag matching the manifest version, for example:

```bash
git tag v0.6.0
git push origin v0.6.0
```

The GitHub Actions release workflow packages the extension and publishes the ZIP as a GitHub Release asset.

## Current version

**v0.6.0**

## License

See [LICENSE](LICENSE).
